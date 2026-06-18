const path = require("node:path");
const { loadDotEnv } = require("./load-env");

const envFile = process.argv[2] || ".env.local";
const envPath = path.resolve(process.cwd(), envFile);
const REQUIRED_KEYS = [
  "CUBESYNC_RECAPTCHA_SITE_KEY",
  "CUBESYNC_RECAPTCHA_SECRET_KEY"
];

function fail(message) {
  console.error(`env invalid: ${message}`);
  process.exitCode = 1;
}

function pass(message) {
  console.log(`env ok: ${message}`);
}

function parseServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const base64 = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64;

  if (raw && base64) {
    fail("set either FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_JSON_BASE64, not both");
    return null;
  }

  if (base64) {
    try {
      return JSON.parse(Buffer.from(base64, "base64").toString("utf8"));
    } catch {
      fail("FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 does not decode to valid JSON");
      return null;
    }
  }

  if (!raw) {
    fail("missing FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_JSON_BASE64");
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    fail("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON");
    return null;
  }
}

loadDotEnv(envPath);

for (const key of REQUIRED_KEYS) {
  if (!process.env[key]) {
    fail(`missing ${key}`);
  }
}

const account = parseServiceAccount();
if (account) {
  const requiredAccountFields = [
    "type",
    "project_id",
    "private_key",
    "client_email",
    "token_uri"
  ];

  for (const field of requiredAccountFields) {
    if (!account[field]) {
      fail(`service account missing ${field}`);
    }
  }

  if (account.type !== "service_account") {
    fail("service account type must be service_account");
  }

  const privateKey = String(account.private_key || "").replace(/\\n/g, "\n");
  if (!/^-----BEGIN PRIVATE KEY-----\n[\s\S]+\n-----END PRIVATE KEY-----\n?$/.test(privateKey)) {
    fail("service account private_key does not look like a PEM private key");
  }
}

if (!process.exitCode) {
  pass(`${envFile} has required reCAPTCHA and Firebase service account values`);
}
