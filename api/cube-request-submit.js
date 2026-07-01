const { URL } = require("url");
const { loadDotEnv } = require("../scripts/load-env");
const {
  FORM_FIELDS: REQUEST_FORM_FIELDS,
  validateCubeRequestPayload,
  isValidCustomFieldId
} = require("../cubesync-schema");
const {
  json,
  setApiHeaders,
  stripWrappingQuotes,
  parseServiceAccount,
  initFirebaseAdmin,
  logServerEvent,
  formatUserFacingError
} = require("./_utils/firebase-api-helper");

const COLLECTION_NAME = "cubeRequests";
const ALLOWED_TEMPLATES = new Set(["Original", "Glassmorphic"]);
// Public submissions are always created as Drafts. "Ready"/"Archived" are staff
// lifecycle states promoted only through the authenticated dashboard, never here.
const PUBLIC_SUBMISSION_STATUS = "Draft";
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

function initializeFirebaseAdmin() {
  admin = initFirebaseAdmin(admin);
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

  // Ignore any client-supplied status: anonymous submissions are always Drafts
  // so they cannot inject themselves into the RPA/ERP queue (which only picks up
  // "Ready" forms). Only authenticated staff can promote a request.
  clean.status = PUBLIC_SUBMISSION_STATUS;

  if (!Array.isArray(clean.results)) {
    throw new Error("Invalid test results");
  }

  if ("extraFields" in clean) {
    clean.extraFields = cleanExtraFields(clean.extraFields);
    if (!clean.extraFields || !Object.keys(clean.extraFields).length) {
      delete clean.extraFields;
    }
  }

  return clean;
}

async function verifyRecaptcha(token, remoteAddress) {
  const secret = process.env.CUBESYNC_RECAPTCHA_SECRET_KEY;
  if (!secret) {
    const err = new Error("reCAPTCHA secret key is not configured");
    logServerEvent({
      feature: "CubeSubmission",
      functionName: "verifyRecaptcha",
      operation: "checkSecret",
      status: "failed",
      category: "ConfigError",
      error: err
    });
    throw err;
  }

  const body = new URLSearchParams({
    secret,
    response: token || ""
  });

  if (remoteAddress) {
    body.set("remoteip", remoteAddress);
  }

  let result;
  try {
    const verification = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    });
    result = await verification.json();
  } catch (err) {
    logServerEvent({
      feature: "CubeSubmission",
      functionName: "verifyRecaptcha",
      operation: "fetchGoogleRecaptcha",
      status: "failed",
      category: "ExternalServiceCall",
      error: err
    });
    throw new Error("reCAPTCHA verification failed");
  }

  if (!result.success) {
    logServerEvent({
      feature: "CubeSubmission",
      functionName: "verifyRecaptcha",
      operation: "verifyToken",
      status: "failed",
      category: "AuthCheck",
      validationRule: "reCAPTCHA score/success check"
    });
    throw new Error("reCAPTCHA verification failed");
  }

  const allowedHostnamesEnv = process.env.CUBESYNC_ALLOWED_HOSTNAMES || process.env.CUBESYNC_ALLOWED_ORIGINS;
  if (allowedHostnamesEnv && typeof allowedHostnamesEnv === "string" && result.hostname) {
    const defaultExceptions = new Set(["localhost", "127.0.0.1", "testkey.google.com"]);
    if (!defaultExceptions.has(result.hostname)) {
      const allowedList = allowedHostnamesEnv
        .split(",")
        .map((s) => {
          const trimmed = s.trim();
          try {
            return trimmed.startsWith("http://") || trimmed.startsWith("https://")
              ? new URL(trimmed).hostname
              : trimmed;
          } catch {
            return trimmed;
          }
        })
        .filter(Boolean);

      if (allowedList.length > 0 && !allowedList.includes(result.hostname)) {
        logServerEvent({
          feature: "CubeSubmission",
          functionName: "verifyRecaptcha",
          operation: "verifyHostname",
          status: "failed",
          category: "AuthCheck",
          expected: allowedList,
          actual: result.hostname
        });
        throw new Error("reCAPTCHA verification failed: invalid hostname");
      }
    }
  }
}

function clientIp(request) {
  const forwardedFor = request.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string") {
    return forwardedFor.split(",")[0].trim();
  }
  return request.socket && request.socket.remoteAddress;
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
    if (id) {
      logServerEvent({
        feature: "CubeSubmission",
        functionName: "handler",
        operation: "submitForm",
        status: "failed",
        category: "PermissionCheck",
        validationRule: "Public submissions cannot target an existing document"
      });
      json(response, 400, { error: "Public submissions cannot target an existing document." });
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

    let fieldConfig = null;
    try {
      const configDoc = await db.collection("settings").doc("formFieldConfig").get();
      if (configDoc.exists) {
        fieldConfig = configDoc.data();
      }
    } catch (err) {
      logServerEvent({
        feature: "CubeSubmission",
        functionName: "handler",
        operation: "fetchFormFieldConfig",
        status: "failed",
        category: "DatabaseRead",
        error: err
      });
    }

    const validation = validateCubeRequestPayload(clean, fieldConfig);

    if (!validation.valid) {
      logServerEvent({
        feature: "CubeSubmission",
        functionName: "handler",
        operation: "validatePayload",
        status: "failed",
        category: "ValidationFailure",
        validationRule: validation.message
      });
      json(response, 400, { error: validation.message });
      return;
    }

    const reference = await db.collection(COLLECTION_NAME).add({
      ...clean,
      createdAt: now
    });
    logServerEvent({
      feature: "CubeSubmission",
      functionName: "handler",
      operation: "createSubmission",
      status: "succeeded",
      category: "DatabaseWrite",
      safeId: reference.id
    });
    json(response, 200, { id: reference.id });
  } catch (error) {
    logServerEvent({
      feature: "CubeSubmission",
      functionName: "handler",
      operation: "processSubmission",
      status: "failed",
      category: "FormSubmission",
      error: error
    });
    json(response, 400, { error: formatUserFacingError(error, "Unable to submit form") });
  }
};

module.exports._test = {
  parseServiceAccount,
  setFirebaseAdminForTest(testAdmin) {
    admin = testAdmin;
  },
  stripWrappingQuotes
};
