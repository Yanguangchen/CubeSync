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
  initFirebaseAdmin
} = require("./_utils/firebase-api-helper");
const STAFF_ALLOWLIST = require("../shared/staff-allowlist.json");

const SETTINGS_COLLECTION = "settings";
const DROPDOWN_OPTIONS_DOC_ID = "dropdownOptions";
const CUBESYNC_ALLOWED_EMAILS = new Set(STAFF_ALLOWLIST);

loadDotEnv();
let admin = null;

function initializeFirebaseAdmin() {
  admin = initFirebaseAdmin(admin);
}

function bearerToken(request) {
  const header = request.headers.authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1] : "";
}

async function requireStaff(request) {
  const token = bearerToken(request);
  if (!token) {
    throw new Error("Missing Firebase ID token.");
  }
  const decoded = await admin.auth().verifyIdToken(token);
  const email = String(decoded.email || "").trim().toLowerCase();
  if (!email || !CUBESYNC_ALLOWED_EMAILS.has(email)) {
    throw new Error("This account is not allowed to manage autocomplete lists.");
  }
  return decoded;
}

async function readOptions(db) {
  const snapshot = await db.collection(SETTINGS_COLLECTION).doc(DROPDOWN_OPTIONS_DOC_ID).get();
  return snapshot.exists ? readSharedDropdownOptions(snapshot.data() || {}) : {};
}

async function saveOptions(db, values) {
  const clean = buildSharedDropdownSaveValues(values);
  await db.collection(SETTINGS_COLLECTION).doc(DROPDOWN_OPTIONS_DOC_ID).set({
    ...clean,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  return clean;
}

async function addOptions(db, values) {
  const additions = buildSharedDropdownAddValues(values);
  const update = {};
  Object.keys(additions).forEach((field) => {
    update[field] = admin.firestore.FieldValue.arrayUnion(...additions[field]);
  });
  if (!Object.keys(update).length) return additions;
  update.updatedAt = admin.firestore.FieldValue.serverTimestamp();
  await db.collection(SETTINGS_COLLECTION).doc(DROPDOWN_OPTIONS_DOC_ID).set(update, { merge: true });
  return additions;
}

module.exports = async function handler(request, response) {
  setApiHeaders(request, response, {
    methods: "GET, POST, OPTIONS",
    headers: "Authorization, Content-Type"
  });
  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }
  if (request.method !== "GET" && request.method !== "POST") {
    response.setHeader("Allow", "GET, POST, OPTIONS");
    json(response, 405, { error: "Dropdown options API only accepts GET or POST." });
    return;
  }

  try {
    initializeFirebaseAdmin();
    const db = admin.firestore();

    if (request.method === "GET") {
      json(response, 200, { options: await readOptions(db) });
      return;
    }

    await requireStaff(request);
    const action = request.body && request.body.action;
    const values = (request.body && request.body.options) || {};
    if (action === "add") {
      json(response, 200, { options: await addOptions(db, values) });
      return;
    }
    if (action === "save") {
      json(response, 200, { options: await saveOptions(db, values) });
      return;
    }
    json(response, 400, { error: "Unknown dropdown options action." });
  } catch (error) {
    json(response, 400, { error: error.message || "Unable to manage dropdown options." });
  }
};

module.exports._test = {
  parseServiceAccount,
  setFirebaseAdminForTest(testAdmin) {
    admin = testAdmin;
  },
  stripWrappingQuotes
};
