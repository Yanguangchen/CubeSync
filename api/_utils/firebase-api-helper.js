const { randomUUID } = require("crypto");

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
  const headers = options.headers || "Content-Type, X-CubeSync-Request-Id";
  response.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  response.setHeader("Access-Control-Allow-Methods", methods);
  response.setHeader("Access-Control-Allow-Headers", headers);
  response.setHeader("Access-Control-Expose-Headers", "X-CubeSync-Request-Id");
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
  "password", "token", "apikey", "secret", "privatekey", "authorization", "auth",
  "recaptchatoken", "idtoken", "bearer", "creditcard", "payment", "email", "phone",
  "contact", "address", "customerbilling", "clientnameonreport", "projectnameonreport",
  "barcode", "payload", "body"
]);

function sanitizeForLog(data) {
  const seen = new WeakSet();

  function walk(value, depth) {
    if (value === null || value === undefined) return value;
    if (typeof value === "string") {
      return value.length > 1000 ? `${value.slice(0, 1000)}…[truncated]` : value;
    }
    if (typeof value === "number" || typeof value === "boolean") return value;
    if (typeof value === "bigint") return String(value);
    if (typeof value !== "object") return String(value);
    if (depth >= 6) return "[MAX_DEPTH]";
    if (seen.has(value)) return "[CIRCULAR]";
    seen.add(value);

    if (value instanceof Error) {
      return walk({ name: value.name, code: value.code, message: value.message }, depth + 1);
    }
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) {
      const clean = value.slice(0, 50).map((entry) => walk(entry, depth + 1));
      if (value.length > 50) clean.push(`[${value.length - 50} more items]`);
      return clean;
    }

    const clean = {};
    for (const [key, val] of Object.entries(value).slice(0, 100)) {
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
      const isSensitive =
        SENSITIVE_KEYS.has(normalizedKey) ||
        normalizedKey.includes("password") ||
        normalizedKey.includes("token") ||
        normalizedKey.includes("secret") ||
        normalizedKey.includes("privatekey") ||
        normalizedKey.includes("apikey");
      clean[key] = isSensitive ? "[REDACTED]" : walk(val, depth + 1);
    }
    return clean;
  }

  return walk(data, 0);
}

function normalizeErrorForLog(error) {
  if (!error) return undefined;
  if (typeof error === "string") {
    return { name: "Error", message: sanitizeForLog(error) };
  }
  return sanitizeForLog({
    name: error.name || "Error",
    code: error.code,
    message: error.message || String(error)
  });
}

function normalizeLogNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : undefined;
}

function logServerEvent(context) {
  const status = context.status || "info";
  const level = context.level || (status === "failed" ? "error" : status === "warning" ? "warn" : "info");
  const feature = context.feature || "General";
  const operation = context.operation || "unknown";
  const payload = {
    schemaVersion: 1,
    timestamp: new Date().toISOString(),
    level,
    source: "server",
    event: context.event || `${feature}.${operation}`,
    message: context.message || `${feature} ${operation} ${status}`,
    feature,
    functionName: context.functionName || "unknown",
    operation,
    status,
    category: context.category || "General",
    route: context.route || undefined,
    method: context.method || undefined,
    requestId: context.requestId || undefined,
    correlationId: context.correlationId || undefined,
    httpStatus: normalizeLogNumber(context.httpStatus),
    durationMs: normalizeLogNumber(context.durationMs),
    safeId: context.safeId || context.recordId || undefined,
    userAction: context.userAction || undefined,
    validationRule: context.validationRule || undefined,
    systemStep: context.systemStep || undefined,
    expected: context.expected !== undefined ? sanitizeForLog(context.expected) : undefined,
    actual: context.actual !== undefined ? sanitizeForLog(context.actual) : undefined,
    metadata: context.metadata !== undefined ? sanitizeForLog(context.metadata) : undefined,
    error: normalizeErrorForLog(context.error)
  };
  Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);
  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
  return payload;
}

function requestHeader(request, name) {
  if (!request || !request.headers) return "";
  if (typeof request.headers.get === "function") {
    return String(request.headers.get(name) || "");
  }
  const lowerName = name.toLowerCase();
  return String(request.headers[lowerName] || request.headers[name] || "");
}

function safeCorrelationId(value) {
  const candidate = String(value || "").trim();
  return /^[a-zA-Z0-9_.:/-]{1,128}$/.test(candidate) ? candidate : "";
}

function createApiRequestLogger(request, response, route) {
  const startedAt = Date.now();
  const vercelRequestId = safeCorrelationId(requestHeader(request, "x-vercel-id"));
  const clientCorrelationId = safeCorrelationId(requestHeader(request, "x-cubesync-request-id"));
  const requestId = vercelRequestId || randomUUID();
  const correlationId = clientCorrelationId || requestId;
  const base = {
    feature: "HttpRequest",
    functionName: "handler",
    route,
    method: String((request && request.method) || "UNKNOWN").toUpperCase(),
    requestId,
    correlationId
  };

  if (response && typeof response.setHeader === "function") {
    response.setHeader("X-CubeSync-Request-Id", correlationId);
  }

  function emit(context = {}) {
    return logServerEvent({ ...base, ...context });
  }

  return {
    requestId,
    correlationId,
    route,
    method: base.method,
    log: emit,
    start(metadata) {
      return emit({
        operation: "request",
        status: "started",
        category: "HTTPRequest",
        event: "http.request.started",
        message: `${base.method} ${route} started`,
        metadata
      });
    },
    complete(httpStatus, context = {}) {
      const failed = Number(httpStatus) >= 400;
      return emit({
        operation: "request",
        status: failed ? "failed" : "succeeded",
        category: context.category || "HTTPRequest",
        event: failed ? "http.request.failed" : "http.request.completed",
        message: `${base.method} ${route} ${httpStatus}`,
        ...context,
        httpStatus,
        durationMs: Date.now() - startedAt
      });
    }
  };
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
  createApiRequestLogger,
  formatUserFacingError,
  sanitizeForLog,
  safeCorrelationId
};
