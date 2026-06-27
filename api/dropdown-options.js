const { loadDotEnv } = require("../scripts/load-env");
const {
  buildSharedDropdownAddValues,
  buildSharedDropdownSaveValues,
  readSharedDropdownOptions
} = require("../cubesync-form-data");

const SETTINGS_COLLECTION = "settings";
const DROPDOWN_OPTIONS_DOC_ID = "dropdownOptions";
const CUBESYNC_ALLOWED_EMAILS = new Set([
  "yanguangchensp@gmail.com",
  "yanguangchen@outlook.com",
  "mushfiqsiddqiue@gmail.com",
  "desmond@rakmat.com.sg",
  "theresaongpohkuan@gmail.com",
  "theresa@rakmat.com.sg",
  "ken@rakmat.com.sg",
  "fondlekc@gmail.com",
  "account@rakmat.com.sg",
  "account1@rakmat.com.sg",
  "feichin@rakmat.com.sg",
  "taiheng@rakmat.com.sg",
  "oakkar@rakmat.com.sg",
  "agga@rakmat.com.sg",
  "ma@rakmat.com.sg",
  "khun@rakmat.com.sg",
  "yanguangchen@webwizardsg.com",
  "santofokir605@gmail.com",
  "nckeyong@gmail.com",
  "nck@rakmat.com.sg",
  "ernestngcy@gmail.com",
  "jlee.j.m9382@gmail.com",
  "rakdurga0000@gmail.com",
  "ilovestudy123456@gmail.com",
  "kirubhashniravendran@gmail.com"
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
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  response.setHeader("Vary", "Origin");
}

function stripWrappingQuotes(value) {
  const trimmed = String(value || "").trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
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
  const account = JSON.parse(raw);
  if (typeof account.private_key === "string") {
    account.private_key = account.private_key.replace(/\\n/g, "\n");
  }
  return account;
}

function initializeFirebaseAdmin() {
  if (!admin) {
    admin = require("firebase-admin");
  }
  if (admin.apps.length) return;

  const account = parseServiceAccount(serviceAccountJson());
  if (account) {
    admin.initializeApp({ credential: admin.credential.cert(account) });
    return;
  }
  admin.initializeApp({ credential: admin.credential.applicationDefault() });
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
  setApiHeaders(request, response);
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
