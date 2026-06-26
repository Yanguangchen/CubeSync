const { test, describe } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const { createRequire } = require("node:module");
const path = require("node:path");
const vm = require("node:vm");

const scriptPath = path.resolve(__dirname, "scripts/validate-env.js");

function runValidateEnv(env) {
  const stdout = [];
  const stderr = [];
  const processStub = {
    argv: [process.execPath, scriptPath, "dummy.env"],
    env: { ...env },
    cwd: () => __dirname,
    exitCode: 0
  };
  const sandbox = {
    require: createRequire(scriptPath),
    process: processStub,
    console: {
      log: (message) => stdout.push(String(message)),
      error: (message) => stderr.push(String(message))
    },
    Buffer
  };

  vm.runInNewContext(fs.readFileSync(scriptPath, "utf8"), sandbox, {
    filename: scriptPath
  });

  return {
    exitCode: processStub.exitCode || 0,
    stdout: stdout.join("\n"),
    stderr: stderr.join("\n")
  };
}

function assertInvalid(env, messagePattern) {
  const result = runValidateEnv(env);

  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, messagePattern);
}

describe("validate-env.js", () => {
  test("fails when missing CUBESYNC_RECAPTCHA_SITE_KEY", () => {
    assertInvalid({
      CUBESYNC_RECAPTCHA_SECRET_KEY: "secret",
      FIREBASE_SERVICE_ACCOUNT_JSON: "{}"
    }, /missing CUBESYNC_RECAPTCHA_SITE_KEY/);
  });

  test("fails when neither service account env var is present", () => {
    assertInvalid({
      CUBESYNC_RECAPTCHA_SITE_KEY: "site",
      CUBESYNC_RECAPTCHA_SECRET_KEY: "secret"
    }, /missing FIREBASE_SERVICE_ACCOUNT_JSON/);
  });

  test("fails when both service account env vars are present", () => {
    assertInvalid({
      CUBESYNC_RECAPTCHA_SITE_KEY: "site",
      CUBESYNC_RECAPTCHA_SECRET_KEY: "secret",
      FIREBASE_SERVICE_ACCOUNT_JSON: "{}",
      FIREBASE_SERVICE_ACCOUNT_JSON_BASE64: "e30="
    }, /not both/);
  });

  test("fails when service account is not valid JSON", () => {
    assertInvalid({
      CUBESYNC_RECAPTCHA_SITE_KEY: "site",
      CUBESYNC_RECAPTCHA_SECRET_KEY: "secret",
      FIREBASE_SERVICE_ACCOUNT_JSON: "not-json"
    }, /FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON/);
  });

  test("fails when service account is missing fields", () => {
    assertInvalid({
      CUBESYNC_RECAPTCHA_SITE_KEY: "site",
      CUBESYNC_RECAPTCHA_SECRET_KEY: "secret",
      FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ type: "service_account" })
    }, /service account missing project_id/);
  });

  test("passes when valid", () => {
    const account = {
      type: "service_account",
      project_id: "test",
      private_key: "-----BEGIN PRIVATE KEY-----\\nkey\\n-----END PRIVATE KEY-----",
      client_email: "test@test.com",
      token_uri: "uri"
    };
    
    const result = runValidateEnv({
      CUBESYNC_RECAPTCHA_SITE_KEY: "site",
      CUBESYNC_RECAPTCHA_SECRET_KEY: "secret",
      FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify(account)
    });
    
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /env ok:/);
  });
});
