function json(response, status, body) {
  response.status(status).setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(body));
}

function setApiHeaders(request, response, options = {}) {
  const requestOrigin = request.headers.origin || "";
  let allowedOrigin = requestOrigin || "*";

  const allowedOriginsEnv = process.env.CUBESYNC_ALLOWED_ORIGINS;
  if (allowedOriginsEnv && typeof allowedOriginsEnv === "string") {
    const allowlist = allowedOriginsEnv
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (allowlist.length > 0) {
      if (requestOrigin && allowlist.includes(requestOrigin)) {
        allowedOrigin = requestOrigin;
      } else {
        allowedOrigin = allowlist[0];
      }
    }
  }

  const methods = options.methods || "POST, OPTIONS";
  const headers = options.headers || "Content-Type";
  response.setHeader("Access-Control-Allow-Origin", allowedOrigin);
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

const SENSITIVE_KEYS = new Set([
  "password", "token", "apikey", "api_key", "secret", "privatekey", "private_key",
  "authorization", "auth", "recaptchatoken", "idtoken", "bearer", "creditcard", "payment"
]);

function sanitizeForLog(data) {
  if (data === null || data === undefined) return data;
  if (typeof data !== "object") return data;
  if (Array.isArray(data)) return data.map(sanitizeForLog);
  const clean = {};
  for (const [key, val] of Object.entries(data)) {
    const lower = key.toLowerCase().replace(/[^a-z]/g, "");
    if (SENSITIVE_KEYS.has(lower) || lower.includes("password") || lower.includes("token") || lower.includes("secret") || lower.includes("key")) {
      clean[key] = "[REDACTED]";
    } else {
      clean[key] = sanitizeForLog(val);
    }
  }
  return clean;
}

function logServerEvent(context) {
  const payload = {
    timestamp: new Date().toISOString(),
    feature: context.feature || "General",
    functionName: context.functionName || "unknown",
    operation: context.operation || "unknown",
    status: context.status || "info",
    category: context.category || "General",
    safeId: context.safeId || context.recordId || undefined,
    userAction: context.userAction || undefined,
    validationRule: context.validationRule || undefined,
    systemStep: context.systemStep || undefined,
    expected: context.expected !== undefined ? sanitizeForLog(context.expected) : undefined,
    actual: context.actual !== undefined ? sanitizeForLog(context.actual) : undefined,
    error: context.error ? (typeof context.error === "object" ? context.error.message || String(context.error) : String(context.error)) : undefined
  };
  Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);
  if (payload.status === "failed") {
    console.error(`[Observability Error]`, JSON.stringify(payload));
  } else {
    console.log(`[Observability Info]`, JSON.stringify(payload));
  }
}

function formatUserFacingError(err, fallbackMessage = "Unable to process request due to a server error. Please try again later.") {
  if (!err) return fallbackMessage;
  const msg = typeof err === "string" ? err : err.message || "";
  if (!msg) return fallbackMessage;
  const safeMatches = [
    "reCAPTCHA", "Unexpected", "Invalid", "Public submissions cannot",
    "Missing Firebase ID token", "This account is not allowed", "Submission API",
    "Too many", "Extra field", "Unable to submit form", "Unable to manage dropdown options.",
    "Unknown dropdown"
  ];
  if (safeMatches.some((s) => msg.includes(s))) {
    return msg;
  }
  return fallbackMessage;
}

function parseServiceAccount(raw) {
  if (!raw) return null;

  let account;
  try {
    account = JSON.parse(raw);
  } catch (err) {
    logServerEvent({
      feature: "FirebaseHelper",
      functionName: "parseServiceAccount",
      operation: "parseJSON",
      status: "failed",
      category: "ConfigError",
      error: err
    });
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

  try {
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
  } catch (err) {
    logServerEvent({
      feature: "FirebaseHelper",
      functionName: "initFirebaseAdmin",
      operation: "initializeApp",
      status: "failed",
      category: "ConfigError",
      error: err
    });
    throw err;
  }
}

module.exports = {
  json,
  setApiHeaders,
  stripWrappingQuotes,
  serviceAccountJson,
  parseServiceAccount,
  initFirebaseAdmin,
  logServerEvent,
  formatUserFacingError,
  sanitizeForLog
};
