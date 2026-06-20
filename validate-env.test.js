const { test, describe } = require("node:test");
const assert = require("node:assert");
const { execSync } = require("node:child_process");
const path = require("node:path");

const scriptPath = path.resolve(__dirname, "scripts/validate-env.js");

describe("validate-env.js", () => {
  test("fails when missing CUBESYNC_RECAPTCHA_SITE_KEY", () => {
    try {
      execSync(`node "${scriptPath}" dummy.env`, {
        env: { 
          CUBESYNC_RECAPTCHA_SECRET_KEY: "secret",
          FIREBASE_SERVICE_ACCOUNT_JSON: "{}"
        },
        stdio: "pipe"
      });
      assert.fail("Should have failed");
    } catch (err) {
      assert.match(err.stderr.toString(), /missing CUBESYNC_RECAPTCHA_SITE_KEY/);
    }
  });

  test("fails when neither service account env var is present", () => {
    try {
      execSync(`node "${scriptPath}" dummy.env`, {
        env: { 
          CUBESYNC_RECAPTCHA_SITE_KEY: "site",
          CUBESYNC_RECAPTCHA_SECRET_KEY: "secret"
        },
        stdio: "pipe"
      });
      assert.fail("Should have failed");
    } catch (err) {
      assert.match(err.stderr.toString(), /missing FIREBASE_SERVICE_ACCOUNT_JSON/);
    }
  });

  test("fails when both service account env vars are present", () => {
    try {
      execSync(`node "${scriptPath}" dummy.env`, {
        env: { 
          CUBESYNC_RECAPTCHA_SITE_KEY: "site",
          CUBESYNC_RECAPTCHA_SECRET_KEY: "secret",
          FIREBASE_SERVICE_ACCOUNT_JSON: "{}",
          FIREBASE_SERVICE_ACCOUNT_JSON_BASE64: "e30="
        },
        stdio: "pipe"
      });
      assert.fail("Should have failed");
    } catch (err) {
      assert.match(err.stderr.toString(), /not both/);
    }
  });

  test("fails when service account is not valid JSON", () => {
    try {
      execSync(`node "${scriptPath}" dummy.env`, {
        env: { 
          CUBESYNC_RECAPTCHA_SITE_KEY: "site",
          CUBESYNC_RECAPTCHA_SECRET_KEY: "secret",
          FIREBASE_SERVICE_ACCOUNT_JSON: "not-json"
        },
        stdio: "pipe"
      });
      assert.fail("Should have failed");
    } catch (err) {
      assert.match(err.stderr.toString(), /FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON/);
    }
  });

  test("fails when service account is missing fields", () => {
    try {
      execSync(`node "${scriptPath}" dummy.env`, {
        env: { 
          CUBESYNC_RECAPTCHA_SITE_KEY: "site",
          CUBESYNC_RECAPTCHA_SECRET_KEY: "secret",
          FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ type: "service_account" })
        },
        stdio: "pipe"
      });
      assert.fail("Should have failed");
    } catch (err) {
      assert.match(err.stderr.toString(), /service account missing project_id/);
    }
  });

  test("passes when valid", () => {
    const account = {
      type: "service_account",
      project_id: "test",
      private_key: "-----BEGIN PRIVATE KEY-----\\nkey\\n-----END PRIVATE KEY-----",
      client_email: "test@test.com",
      token_uri: "uri"
    };
    
    const output = execSync(`node "${scriptPath}" dummy.env`, {
      env: { 
        CUBESYNC_RECAPTCHA_SITE_KEY: "site",
        CUBESYNC_RECAPTCHA_SECRET_KEY: "secret",
        FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify(account)
      },
      stdio: "pipe"
    });
    
    assert.match(output.toString(), /env ok:/);
  });
});
