const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { loadDotEnv } = require("./scripts/load-env");

function withCleanEnv(keys, callback) {
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  keys.forEach((key) => {
    delete process.env[key];
  });

  try {
    callback();
  } finally {
    keys.forEach((key) => {
      if (previous[key] == null) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    });
  }
}

test("env loader supports .env.local overrides and multiline service account JSON", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cubesync-env-"));
  const envPath = path.join(directory, ".env");
  const envLocalPath = path.join(directory, ".env.local");
  const keys = [
    "CUBESYNC_RECAPTCHA_SITE_KEY",
    "FIREBASE_SERVICE_ACCOUNT_JSON"
  ];

  fs.writeFileSync(envPath, [
    "CUBESYNC_RECAPTCHA_SITE_KEY=placeholder-site-key",
    "FIREBASE_SERVICE_ACCOUNT_JSON={",
    "  \"type\": \"service_account\",",
    "  \"project_id\": \"placeholder\"",
    "}"
  ].join("\n"));
  fs.writeFileSync(envLocalPath, [
    "CUBESYNC_RECAPTCHA_SITE_KEY=local-site-key",
    "FIREBASE_SERVICE_ACCOUNT_JSON={",
    "  \"type\": \"service_account\",",
    "  \"project_id\": \"local-project\",",
    "  \"private_key\": \"-----BEGIN PRIVATE KEY-----\\nABC\\n-----END PRIVATE KEY-----\\n\"",
    "}"
  ].join("\n"));

  withCleanEnv(keys, () => {
    loadDotEnv([envPath, envLocalPath]);

    assert.equal(process.env.CUBESYNC_RECAPTCHA_SITE_KEY, "local-site-key");
    assert.deepEqual(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON), {
      type: "service_account",
      project_id: "local-project",
      private_key: "-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----\n"
    });
  });
});

test("env loader does not overwrite host-provided environment variables", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cubesync-env-"));
  const envPath = path.join(directory, ".env");
  const key = "CUBESYNC_RECAPTCHA_SITE_KEY";
  const previous = process.env[key];

  fs.writeFileSync(envPath, "CUBESYNC_RECAPTCHA_SITE_KEY=file-site-key\n");
  process.env[key] = "host-site-key";

  try {
    loadDotEnv(envPath);
    assert.equal(process.env[key], "host-site-key");
  } finally {
    if (previous == null) {
      delete process.env[key];
    } else {
      process.env[key] = previous;
    }
  }
});

test(".env.example keeps a parseable multiline Firebase service account template", () => {
  const keys = [
    "CUBESYNC_RECAPTCHA_SITE_KEY",
    "CUBESYNC_RECAPTCHA_SECRET_KEY",
    "FIREBASE_SERVICE_ACCOUNT_JSON"
  ];

  withCleanEnv(keys, () => {
    loadDotEnv(".env.example");
    const account = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);

    assert.equal(process.env.CUBESYNC_RECAPTCHA_SITE_KEY, "your-recaptcha-v2-site-key");
    assert.equal(process.env.CUBESYNC_RECAPTCHA_SECRET_KEY, "your-recaptcha-v2-secret-key");
    assert.equal(account.type, "service_account");
    assert.equal(account.project_id, "your-firebase-project-id");
    assert.match(account.private_key, /^-----BEGIN PRIVATE KEY-----\n/);
    assert.match(account.private_key, /\n-----END PRIVATE KEY-----\n$/);
  });
});
