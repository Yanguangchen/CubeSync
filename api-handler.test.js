const assert = require("node:assert/strict");
const test = require("node:test");
const handler = require("./api/cube-request-submit");
const { parseServiceAccount, stripWrappingQuotes } = handler._test;

function mockResponse() {
  return {
    headers: {},
    statusCode: null,
    body: "",
    setHeader(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    end(body = "") {
      this.body = body;
      return this;
    }
  };
}

test("submission API allows OPTIONS preflight for browser clients", async () => {
  const request = {
    method: "OPTIONS",
    headers: {
      origin: "http://localhost:5500"
    }
  };
  const response = mockResponse();

  await handler(request, response);

  assert.equal(response.statusCode, 204);
  assert.equal(response.headers["Access-Control-Allow-Origin"], "http://localhost:5500");
  assert.equal(response.headers["Access-Control-Allow-Methods"], "POST, OPTIONS");
  assert.equal(response.headers["Access-Control-Allow-Headers"], "Content-Type");
});

test("submission API returns actionable 405 for non-POST requests", async () => {
  const request = {
    method: "GET",
    headers: {}
  };
  const response = mockResponse();

  await handler(request, response);

  assert.equal(response.statusCode, 405);
  assert.equal(response.headers.Allow, "POST, OPTIONS");
  assert.match(JSON.parse(response.body).error, /Live Server cannot run \/api functions/);
});

test("submission API service account parser gives actionable JSON errors", () => {
  assert.throws(
    () => parseServiceAccount("{type:'service_account'}"),
    /Invalid Firebase service account JSON/
  );
  assert.equal(stripWrappingQuotes("'value'"), "value");
  assert.equal(stripWrappingQuotes("\"value\""), "value");
});

test("submission API service account parser accepts valid JSON and normalizes private key newlines", () => {
  const account = parseServiceAccount(JSON.stringify({
    type: "service_account",
    private_key: "-----BEGIN PRIVATE KEY-----\\nABC\\n-----END PRIVATE KEY-----\\n"
  }));

  assert.equal(account.type, "service_account");
  assert.equal(account.private_key, "-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----\n");
});
