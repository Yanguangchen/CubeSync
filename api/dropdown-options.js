const { loadDotEnv } = require("../scripts/load-env");
const {
  buildSharedDropdownAddValues,
  buildSharedDropdownSaveValues,
  readSharedDropdownOptions
} = require("../cubesync-schema");
const {
  json,
  setApiHeaders,
  stripWrappingQuotes,
  parseServiceAccount,
  initFirebaseAdmin,
  logServerEvent,
  createApiRequestLogger,
  formatUserFacingError
} = require("./_utils/firebase-api-helper");
const STAFF_ALLOWLIST = require("../shared/staff-allowlist.json");

const SETTINGS_COLLECTION = "settings";
const DROPDOWN_OPTIONS_DOC_ID = "dropdownOptions";
const CUBESYNC_ALLOWED_EMAILS = new Set(STAFF_ALLOWLIST);

loadDotEnv();
let admin = null;

function emitServerEvent(requestLog, context) {
  return requestLog ? requestLog.log(context) : logServerEvent(context);
}

function initializeFirebaseAdmin() {
  admin = initFirebaseAdmin(admin);
}

function bearerToken(request) {
  const header = request.headers.authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1] : "";
}

async function requireStaff(request, requestLog) {
  const token = bearerToken(request);
  if (!token) {
    const err = new Error("Missing Firebase ID token.");
    emitServerEvent(requestLog, {
      feature: "DropdownOptions",
      functionName: "requireStaff",
      operation: "extractToken",
      status: "failed",
      category: "AuthenticationCheck",
      error: err
    });
    throw err;
  }
  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(token);
  } catch (err) {
    emitServerEvent(requestLog, {
      feature: "DropdownOptions",
      functionName: "requireStaff",
      operation: "verifyIdToken",
      status: "failed",
      category: "AuthenticationCheck",
      error: err
    });
    throw new Error("Missing Firebase ID token.");
  }
  const email = String(decoded.email || "").trim().toLowerCase();
  if (!email || !CUBESYNC_ALLOWED_EMAILS.has(email)) {
    const err = new Error("This account is not allowed to manage autocomplete lists.");
    emitServerEvent(requestLog, {
      feature: "DropdownOptions",
      functionName: "requireStaff",
      operation: "checkAllowlist",
      status: "failed",
      category: "PermissionCheck",
      validationRule: "Staff allowlist email match"
    });
    throw err;
  }
  return decoded;
}

async function readOptions(db) {
  const snapshot = await db.collection(SETTINGS_COLLECTION).doc(DROPDOWN_OPTIONS_DOC_ID).get();
  return snapshot.exists ? readSharedDropdownOptions(snapshot.data() || {}) : {};
}

function optionValueCount(options) {
  return Object.values(options || {}).reduce((count, entries) => {
    return count + (Array.isArray(entries) ? entries.length : 0);
  }, 0);
}

async function saveOptions(db, values, requestLog) {
  const startedAt = Date.now();
  const clean = buildSharedDropdownSaveValues(values);
  await db.collection(SETTINGS_COLLECTION).doc(DROPDOWN_OPTIONS_DOC_ID).set({
    ...clean,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  emitServerEvent(requestLog, {
    feature: "DropdownOptions",
    functionName: "saveOptions",
    operation: "overwriteOptions",
    status: "succeeded",
    category: "DatabaseWrite",
    durationMs: Date.now() - startedAt,
    metadata: {
      fieldCount: Object.keys(clean).length,
      valueCount: optionValueCount(clean)
    }
  });
  return clean;
}

async function addOptions(db, values, requestLog) {
  const startedAt = Date.now();
  const additions = buildSharedDropdownAddValues(values);
  const update = {};
  Object.keys(additions).forEach((field) => {
    update[field] = admin.firestore.FieldValue.arrayUnion(...additions[field]);
  });
  if (!Object.keys(update).length) {
    emitServerEvent(requestLog, {
      feature: "DropdownOptions",
      functionName: "addOptions",
      operation: "unionOptions",
      status: "succeeded",
      category: "DatabaseWrite",
      durationMs: Date.now() - startedAt,
      metadata: { fieldCount: 0, valueCount: 0, noOp: true }
    });
    return additions;
  }
  update.updatedAt = admin.firestore.FieldValue.serverTimestamp();
  await db.collection(SETTINGS_COLLECTION).doc(DROPDOWN_OPTIONS_DOC_ID).set(update, { merge: true });
  emitServerEvent(requestLog, {
    feature: "DropdownOptions",
    functionName: "addOptions",
    operation: "unionOptions",
    status: "succeeded",
    category: "DatabaseWrite",
    durationMs: Date.now() - startedAt,
    metadata: {
      fieldCount: Object.keys(additions).length,
      valueCount: optionValueCount(additions)
    }
  });
  return additions;
}

module.exports = async function handler(request, response) {
  setApiHeaders(request, response, {
    methods: "GET, POST, OPTIONS",
    headers: "Authorization, Content-Type, X-CubeSync-Request-Id"
  });
  const requestLog = createApiRequestLogger(request, response, "/api/dropdown-options");
  requestLog.start();
  if (request.method === "OPTIONS") {
    requestLog.complete(204);
    response.status(204).end();
    return;
  }
  if (request.method !== "GET" && request.method !== "POST") {
    response.setHeader("Allow", "GET, POST, OPTIONS");
    requestLog.complete(405, { category: "MethodNotAllowed" });
    json(response, 405, { error: "Dropdown options API only accepts GET or POST." });
    return;
  }

  try {
    initializeFirebaseAdmin();
    const db = admin.firestore();

    if (request.method === "GET") {
      const options = await readOptions(db);
      requestLog.complete(200, {
        metadata: {
          fieldCount: Object.keys(options).length,
          valueCount: optionValueCount(options)
        }
      });
      json(response, 200, { options });
      return;
    }

    await requireStaff(request, requestLog);
    const action = request.body && request.body.action;
    const values = (request.body && request.body.options) || {};
    if (action === "add") {
      const options = await addOptions(db, values, requestLog);
      requestLog.complete(200, {
        metadata: { action, fieldCount: Object.keys(options).length, valueCount: optionValueCount(options) }
      });
      json(response, 200, { options });
      return;
    }
    if (action === "save") {
      const options = await saveOptions(db, values, requestLog);
      requestLog.complete(200, {
        metadata: { action, fieldCount: Object.keys(options).length, valueCount: optionValueCount(options) }
      });
      json(response, 200, { options });
      return;
    }
    requestLog.log({
      feature: "DropdownOptions",
      functionName: "handler",
      operation: "executeAction",
      status: "failed",
      category: "ValidationFailure",
      validationRule: "Action must be add or save"
    });
    requestLog.complete(400, { category: "ValidationFailure", metadata: { action: action || "missing" } });
    json(response, 400, { error: "Unknown dropdown options action." });
  } catch (error) {
    requestLog.complete(400, {
      category: "APIError",
      metadata: { action: request.method === "POST" ? (request.body && request.body.action || "post") : "get" },
      error: error
    });
    json(response, 400, { error: formatUserFacingError(error, error.message || "Unable to manage dropdown options.") });
  }
};

module.exports._test = {
  parseServiceAccount,
  setFirebaseAdminForTest(testAdmin) {
    admin = testAdmin;
  },
  stripWrappingQuotes
};
