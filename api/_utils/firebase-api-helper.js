function json(response, status, body) {
  response.status(status).setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(body));
}

function setApiHeaders(request, response, options = {}) {
  const origin = request.headers.origin || "*";
  const methods = options.methods || "POST, OPTIONS";
  const headers = options.headers || "Content-Type";
  response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Access-Control-Allow-Methods", methods);
  response.setHeader("Access-Control-Allow-Headers", headers);
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

function initFirebaseAdmin(currentAdmin) {
  let admin = currentAdmin;
  if (!admin) {
    admin = require("firebase-admin");
  }

  if (admin.apps && admin.apps.length) return admin;

  const account = parseServiceAccount(serviceAccountJson());
  if (account) {
    admin.initializeApp({
      credential: admin.credential.cert(account)
    });
    return admin;
  }

  admin.initializeApp({
    credential: admin.credential.applicationDefault()
  });
  return admin;
}

module.exports = {
  json,
  setApiHeaders,
  stripWrappingQuotes,
  serviceAccountJson,
  parseServiceAccount,
  initFirebaseAdmin
};
