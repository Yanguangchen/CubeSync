const { loadDotEnv } = require("../scripts/load-env");
const {
  FORM_FIELDS: REQUEST_FORM_FIELDS,
  validateCubeRequestPayload,
  isValidCustomFieldId
} = require("../cubesync-form-data");

const COLLECTION_NAME = "cubeRequests";
const ALLOWED_TEMPLATES = new Set(["Original", "Glassmorphic"]);
const ALLOWED_STATUSES = new Set(["Draft", "Ready", "Archived"]);
const LEGACY_FORM_FIELDS = [
  "internalDate",
  "projectCode",
  "reportNo",
  "client",
  "method",
  "project",
  "concreteGrade",
  "supplier",
  "locationRepresented",
  "additionalInformation",
  "dateTimeSampled",
  "slumpMeasured",
  "specimenSize",
  "slumpSpecified"
];
const FORM_FIELDS = new Set([
  ...REQUEST_FORM_FIELDS,
  ...LEGACY_FORM_FIELDS,
  "template",
  "status",
  "results",
  "customFields",
  "extraFields"
]);

loadDotEnv();
let admin = null;

function json(response, status, body) {
  response.status(status).setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(body));
}

function setApiHeaders(request, response) {
  const origin = request.headers.origin || "*";
  response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Vary", "Origin");
}

function stripWrappingQuotes(value) {
  const trimmed = String(value || "").trim();
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function serviceAccountJson() {
  const base64 = stripWrappingQuotes(process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64);
  if (base64) {
    return Buffer.from(base64, "base64").toString("utf8");
  }

  return stripWrappingQuotes(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
}

function parseServiceAccount(raw) {
  if (!raw) return null;

  let account;
  try {
    account = JSON.parse(raw);
  } catch {
    throw new Error(
      "Invalid Firebase service account JSON. Use valid JSON with double-quoted property names, or set FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 to a base64-encoded service account JSON file."
    );
  }

  if (typeof account.private_key === "string") {
    account.private_key = account.private_key.replace(/\\n/g, "\n");
  }
  return account;
}

function serviceAccount() {
  return parseServiceAccount(serviceAccountJson());
}

function initializeFirebaseAdmin() {
  if (!admin) {
    admin = require("firebase-admin");
  }

  if (admin.apps.length) return;

  const account = serviceAccount();
  if (account) {
    admin.initializeApp({
      credential: admin.credential.cert(account)
    });
    return;
  }

  admin.initializeApp({
    credential: admin.credential.applicationDefault()
  });
}

function cleanExtraFields(value) {
  if (value == null) {
    return undefined;
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid extra fields");
  }

  const clean = {};
  for (const [key, fieldValue] of Object.entries(value)) {
    if (!isValidCustomFieldId(key)) {
      throw new Error(`Unexpected extra field: ${key}`);
    }

    if (typeof fieldValue === "boolean") {
      clean[key] = fieldValue;
      continue;
    }

    if (typeof fieldValue === "number") {
      if (!Number.isFinite(fieldValue)) {
        throw new Error(`Invalid extra field value: ${key}`);
      }
      clean[key] = fieldValue;
      continue;
    }

    if (typeof fieldValue !== "string") {
      throw new Error(`Invalid extra field value: ${key}`);
    }

    if (fieldValue.length > 500) {
      throw new Error(`Extra field value too long: ${key}`);
    }

    clean[key] = fieldValue;
  }

  if (Object.keys(clean).length > 25) {
    throw new Error("Too many extra fields");
  }

  return clean;
}

function cleanPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Invalid form payload");
  }

  const clean = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!FORM_FIELDS.has(key)) {
      throw new Error(`Unexpected field: ${key}`);
    }
    clean[key] = value;
  }

  if (!ALLOWED_TEMPLATES.has(clean.template)) {
    throw new Error("Invalid form template");
  }

  if (!ALLOWED_STATUSES.has(clean.status)) {
    throw new Error("Invalid form status");
  }

  if (!Array.isArray(clean.results)) {
    throw new Error("Invalid test results");
  }

  if ("extraFields" in clean) {
    clean.extraFields = cleanExtraFields(clean.extraFields);
    if (!Object.keys(clean.extraFields).length) {
      delete clean.extraFields;
    }
  }

  return clean;
}

async function verifyRecaptcha(token, remoteAddress) {
  const secret = process.env.CUBESYNC_RECAPTCHA_SECRET_KEY;
  if (!secret) {
    throw new Error("reCAPTCHA secret key is not configured");
  }

  const body = new URLSearchParams({
    secret,
    response: token || ""
  });

  if (remoteAddress) {
    body.set("remoteip", remoteAddress);
  }

  const verification = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });
  const result = await verification.json();

  if (!result.success) {
    throw new Error("reCAPTCHA verification failed");
  }
}

function clientIp(request) {
  const forwardedFor = request.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string") {
    return forwardedFor.split(",")[0].trim();
  }
  return request.socket && request.socket.remoteAddress;
}

function validDocumentId(id) {
  return !id || /^[A-Za-z0-9_-]{1,128}$/.test(id);
}

module.exports = async function handler(request, response) {
  setApiHeaders(request, response);

  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST, OPTIONS");
    json(response, 405, {
      error: "Submission API only accepts POST. Use Vercel or vercel dev; static servers such as Live Server cannot run /api functions."
    });
    return;
  }

  try {
    const { id, payload, recaptchaToken } = request.body || {};
    if (!validDocumentId(id)) {
      json(response, 400, { error: "Invalid document id" });
      return;
    }

    await verifyRecaptcha(recaptchaToken, clientIp(request));
    initializeFirebaseAdmin();

    const db = admin.firestore();
    const now = admin.firestore.FieldValue.serverTimestamp();
    const clean = {
      ...cleanPayload(payload),
      updatedAt: now
    };
    const validation = validateCubeRequestPayload(clean);

    if (!validation.valid) {
      json(response, 400, { error: validation.message });
      return;
    }

    if (id) {
      await db.collection(COLLECTION_NAME).doc(id).set(clean, { merge: true });
      json(response, 200, { id });
      return;
    }

    const reference = await db.collection(COLLECTION_NAME).add({
      ...clean,
      createdAt: now
    });
    json(response, 200, { id: reference.id });
  } catch (error) {
    json(response, 400, { error: error.message || "Unable to submit form" });
  }
};

module.exports._test = {
  parseServiceAccount,
  setFirebaseAdminForTest(testAdmin) {
    admin = testAdmin;
  },
  stripWrappingQuotes
};
