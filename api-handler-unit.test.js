const assert = require("node:assert/strict");
const test = require("node:test");
const handler = require("./api/cube-request-submit");
const { parseServiceAccount, setFirebaseAdminForTest, stripWrappingQuotes } = handler._test;

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

function mockFirestoreAdmin(overrides = {}) {
  const serverTimestamp = { ".sv": "timestamp" };
  function firestore() {
    return {
      collection() {
        return {
          add: overrides.add || (async () => ({ id: "generated-id" })),
          doc() {
            return {
              set: overrides.set || (async () => {})
            };
          }
        };
      }
    };
  }
  firestore.FieldValue = {
    serverTimestamp() {
      return serverTimestamp;
    }
  };
  return { apps: [{}], firestore };
}

function withRecaptcha(fn) {
  return async () => {
    const previousFetch = global.fetch;
    const previousSecret = process.env.CUBESYNC_RECAPTCHA_SECRET_KEY;
    global.fetch = async () => ({ json: async () => ({ success: true }) });
    process.env.CUBESYNC_RECAPTCHA_SECRET_KEY = "test-secret";
    try {
      await fn();
    } finally {
      global.fetch = previousFetch;
      if (previousSecret === undefined) {
        delete process.env.CUBESYNC_RECAPTCHA_SECRET_KEY;
      } else {
        process.env.CUBESYNC_RECAPTCHA_SECRET_KEY = previousSecret;
      }
      setFirebaseAdminForTest(null);
    }
  };
}

function validPayload(overrides = {}) {
  return {
    projectErp: "ERP-001",
    customerBilling: "Billing",
    projectNameOnReport: "Project",
    clientNameOnReport: "Client",
    contact: "Contact",
    enableManualCubeJobNumber: false,
    cubeJobNumber: "",
    quote: "",
    testItem: "Test",
    supplier: "Supplier",
    supplierDisplay: "Supplier Display",
    locationRepresented: "Location",
    additionalInformation: "",
    dateOfCast: "2026-06-18",
    concreteGrade: "C35",
    reportGrade: "C35",
    specimenSize: "150",
    slumpMeasured: 100,
    slumpSpecified: 100,
    personInCharge: "Person",
    managerInCharge: "Manager",
    template: "Original",
    status: "Draft",
    results: [],
    ...overrides
  };
}

// --- reCAPTCHA tests ---

test("reCAPTCHA verification sends token and remoteip to Google", withRecaptcha(async () => {
  let capturedBody = null;
  global.fetch = async (url, opts) => {
    assert.ok(url.includes("siteverify"));
    assert.equal(opts.method, "POST");
    capturedBody = opts.body;
    return { json: async () => ({ success: true }) };
  };

  setFirebaseAdminForTest(mockFirestoreAdmin());

  const response = mockResponse();
  await handler({
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.50, 10.0.0.1" },
    body: {
      recaptchaToken: "my-token",
      payload: validPayload()
    }
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(capturedBody.get("response"), "my-token");
  assert.equal(capturedBody.get("remoteip"), "203.0.113.50");
}));

test("reCAPTCHA returns 400 when secret key is not configured", async () => {
  const previousSecret = process.env.CUBESYNC_RECAPTCHA_SECRET_KEY;
  delete process.env.CUBESYNC_RECAPTCHA_SECRET_KEY;

  try {
    const response = mockResponse();
    await handler({
      method: "POST",
      headers: {},
      body: {
        recaptchaToken: "token",
        payload: validPayload()
      }
    }, response);

    assert.equal(response.statusCode, 400);
    assert.match(JSON.parse(response.body).error, /reCAPTCHA secret key is not configured/);
  } finally {
    if (previousSecret !== undefined) {
      process.env.CUBESYNC_RECAPTCHA_SECRET_KEY = previousSecret;
    }
  }
});

test("reCAPTCHA fails when hostname does not match configured CUBESYNC_ALLOWED_HOSTNAMES", withRecaptcha(async () => {
  const originalHostnames = process.env.CUBESYNC_ALLOWED_HOSTNAMES;
  process.env.CUBESYNC_ALLOWED_HOSTNAMES = "cubesync.vercel.app";

  try {
    global.fetch = async () => ({
      json: async () => ({ success: true, hostname: "evil-attacker.com" })
    });

    const response = mockResponse();
    await handler({
      method: "POST",
      headers: {},
      body: {
        recaptchaToken: "token",
        payload: validPayload()
      }
    }, response);

    assert.equal(response.statusCode, 400);
    assert.match(JSON.parse(response.body).error, /reCAPTCHA verification failed: invalid hostname/);
  } finally {
    if (originalHostnames === undefined) {
      delete process.env.CUBESYNC_ALLOWED_HOSTNAMES;
    } else {
      process.env.CUBESYNC_ALLOWED_HOSTNAMES = originalHostnames;
    }
  }
}));


test("reCAPTCHA sends empty string when token is missing", withRecaptcha(async () => {
  let capturedBody = null;
  global.fetch = async (url, opts) => {
    capturedBody = opts.body;
    return { json: async () => ({ success: true }) };
  };

  setFirebaseAdminForTest(mockFirestoreAdmin());

  const response = mockResponse();
  await handler({
    method: "POST",
    headers: {},
    socket: { remoteAddress: "127.0.0.1" },
    body: {
      payload: validPayload()
    }
  }, response);

  assert.equal(capturedBody.get("response"), "");
}));

test("clientIp uses socket.remoteAddress when x-forwarded-for is absent", withRecaptcha(async () => {
  let capturedBody = null;
  global.fetch = async (url, opts) => {
    capturedBody = opts.body;
    return { json: async () => ({ success: true }) };
  };

  setFirebaseAdminForTest(mockFirestoreAdmin());

  const response = mockResponse();
  await handler({
    method: "POST",
    headers: {},
    socket: { remoteAddress: "192.168.1.1" },
    body: {
      recaptchaToken: "token",
      payload: validPayload()
    }
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(capturedBody.get("remoteip"), "192.168.1.1");
}));

test("clientIp omits remoteip when no address is available", withRecaptcha(async () => {
  let capturedBody = null;
  global.fetch = async (url, opts) => {
    capturedBody = opts.body;
    return { json: async () => ({ success: true }) };
  };

  setFirebaseAdminForTest(mockFirestoreAdmin());

  const response = mockResponse();
  await handler({
    method: "POST",
    headers: {},
    body: {
      recaptchaToken: "token",
      payload: validPayload()
    }
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(capturedBody.has("remoteip"), false);
}));

// --- Service account tests ---

test("base64-encoded service account is decoded correctly", withRecaptcha(async () => {
  const previousBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64;
  const previousJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  const account = { type: "service_account", project_id: "test-proj", private_key: "key\\ndata" };
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 = Buffer.from(JSON.stringify(account)).toString("base64");
  delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  try {
    // parseServiceAccount is already tested, but verify the base64 path through serviceAccount()
    // We can test parseServiceAccount with the decoded value
    const decoded = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64, "base64").toString("utf8");
    const parsed = parseServiceAccount(decoded);
    assert.equal(parsed.type, "service_account");
    assert.equal(parsed.project_id, "test-proj");
    assert.equal(parsed.private_key, "key\ndata");
  } finally {
    if (previousBase64 !== undefined) {
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 = previousBase64;
    } else {
      delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64;
    }
    if (previousJson !== undefined) {
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON = previousJson;
    }
  }
}));

test("parseServiceAccount returns null for empty input", () => {
  assert.equal(parseServiceAccount(null), null);
  assert.equal(parseServiceAccount(""), null);
  assert.equal(parseServiceAccount(undefined), null);
});

test("stripWrappingQuotes handles edge cases", () => {
  assert.equal(stripWrappingQuotes(null), "");
  assert.equal(stripWrappingQuotes(undefined), "");
  assert.equal(stripWrappingQuotes("  "), "");
  assert.equal(stripWrappingQuotes("no-quotes"), "no-quotes");
  assert.equal(stripWrappingQuotes("  \"padded\"  "), "padded");
  assert.equal(stripWrappingQuotes("'single'"), "single");
  // Mismatched quotes should not strip
  assert.equal(stripWrappingQuotes("\"mixed'"), "\"mixed'");
});

// --- Create-only enforcement (no caller-supplied document id) ---

test("a malformed document id is rejected (create-only)", withRecaptcha(async () => {
  const response = mockResponse();
  await handler({
    method: "POST",
    headers: {},
    body: {
      id: "invalid id with spaces!",
      recaptchaToken: "token",
      payload: validPayload()
    }
  }, response);

  assert.equal(response.statusCode, 400);
  assert.match(JSON.parse(response.body).error, /cannot target an existing document/i);
}));

test("a well-formed document id is also rejected (create-only IDOR guard)", withRecaptcha(async () => {
  const response = mockResponse();
  await handler({
    method: "POST",
    headers: {},
    body: {
      id: "AbCd1234ValidLookingId",
      recaptchaToken: "token",
      payload: validPayload()
    }
  }, response);

  assert.equal(response.statusCode, 400);
  assert.match(JSON.parse(response.body).error, /cannot target an existing document/i);
}));

// --- Payload cleaning / extra fields ---

test("cleanPayload rejects array payload", withRecaptcha(async () => {
  setFirebaseAdminForTest(mockFirestoreAdmin());

  const response = mockResponse();
  await handler({
    method: "POST",
    headers: {},
    body: {
      recaptchaToken: "token",
      payload: [1, 2, 3]
    }
  }, response);

  assert.equal(response.statusCode, 400);
  assert.match(JSON.parse(response.body).error, /Invalid form payload/);
}));

test("cleanPayload rejects null payload", withRecaptcha(async () => {
  setFirebaseAdminForTest(mockFirestoreAdmin());

  const response = mockResponse();
  await handler({
    method: "POST",
    headers: {},
    body: {
      recaptchaToken: "token",
      payload: null
    }
  }, response);

  assert.equal(response.statusCode, 400);
  assert.match(JSON.parse(response.body).error, /Invalid form payload/);
}));

test("cleanPayload rejects invalid template", withRecaptcha(async () => {
  setFirebaseAdminForTest(mockFirestoreAdmin());

  const response = mockResponse();
  await handler({
    method: "POST",
    headers: {},
    body: {
      recaptchaToken: "token",
      payload: validPayload({ template: "BadTemplate" })
    }
  }, response);

  assert.equal(response.statusCode, 400);
  assert.match(JSON.parse(response.body).error, /Invalid form template/);
}));

test("cleanPayload forces any supplied status to Draft", withRecaptcha(async () => {
  let savedData = null;
  setFirebaseAdminForTest(mockFirestoreAdmin({
    add: async (data) => {
      savedData = data;
      return { id: "generated-id" };
    }
  }));

  const response = mockResponse();
  await handler({
    method: "POST",
    headers: {},
    body: {
      recaptchaToken: "token",
      payload: validPayload({ status: "Ready" })
    }
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(savedData.status, "Draft");
}));

test("cleanPayload rejects non-array results", withRecaptcha(async () => {
  setFirebaseAdminForTest(mockFirestoreAdmin());

  const response = mockResponse();
  await handler({
    method: "POST",
    headers: {},
    body: {
      recaptchaToken: "token",
      payload: validPayload({ results: "not-an-array" })
    }
  }, response);

  assert.equal(response.statusCode, 400);
  assert.match(JSON.parse(response.body).error, /Invalid test results/);
}));

test("extraFields accepts valid boolean, number, and string values", withRecaptcha(async () => {
  let savedData = null;
  setFirebaseAdminForTest(mockFirestoreAdmin({
    add: async (data) => {
      savedData = data;
      return { id: "extra-fields-id" };
    }
  }));

  const response = mockResponse();
  await handler({
    method: "POST",
    headers: {},
    body: {
      recaptchaToken: "token",
      payload: validPayload({
        extraFields: {
          customBool: true,
          customNum: 42,
          customStr: "hello"
        }
      })
    }
  }, response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(savedData.extraFields, {
    customBool: true,
    customNum: 42,
    customStr: "hello"
  });
}));

test("extraFields rejects non-finite numbers", withRecaptcha(async () => {
  setFirebaseAdminForTest(mockFirestoreAdmin());

  const response = mockResponse();
  await handler({
    method: "POST",
    headers: {},
    body: {
      recaptchaToken: "token",
      payload: validPayload({
        extraFields: { badNum: Infinity }
      })
    }
  }, response);

  assert.equal(response.statusCode, 400);
  assert.match(JSON.parse(response.body).error, /Invalid extra field value/);
}));

test("extraFields rejects values longer than 500 characters", withRecaptcha(async () => {
  setFirebaseAdminForTest(mockFirestoreAdmin());

  const response = mockResponse();
  await handler({
    method: "POST",
    headers: {},
    body: {
      recaptchaToken: "token",
      payload: validPayload({
        extraFields: { longVal: "x".repeat(501) }
      })
    }
  }, response);

  assert.equal(response.statusCode, 400);
  assert.match(JSON.parse(response.body).error, /Extra field value too long/);
}));

test("extraFields rejects more than 25 fields", withRecaptcha(async () => {
  setFirebaseAdminForTest(mockFirestoreAdmin());

  const fields = {};
  for (let i = 0; i < 26; i++) {
    fields[`field${i}`] = `value${i}`;
  }

  const response = mockResponse();
  await handler({
    method: "POST",
    headers: {},
    body: {
      recaptchaToken: "token",
      payload: validPayload({ extraFields: fields })
    }
  }, response);

  assert.equal(response.statusCode, 400);
  assert.match(JSON.parse(response.body).error, /Too many extra fields/);
}));

test("extraFields rejects array values", withRecaptcha(async () => {
  setFirebaseAdminForTest(mockFirestoreAdmin());

  const response = mockResponse();
  await handler({
    method: "POST",
    headers: {},
    body: {
      recaptchaToken: "token",
      payload: validPayload({
        extraFields: [1, 2, 3]
      })
    }
  }, response);

  assert.equal(response.statusCode, 400);
  assert.match(JSON.parse(response.body).error, /Invalid extra fields/);
}));

test("empty extraFields object is stripped from payload", withRecaptcha(async () => {
  let savedData = null;
  setFirebaseAdminForTest(mockFirestoreAdmin({
    add: async (data) => {
      savedData = data;
      return { id: "no-extras" };
    }
  }));

  const response = mockResponse();
  await handler({
    method: "POST",
    headers: {},
    body: {
      recaptchaToken: "token",
      payload: validPayload({ extraFields: {} })
    }
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(savedData.extraFields, undefined);
}));

// --- CORS ---

test("CORS uses wildcard origin when no origin header is present", async () => {
  const response = mockResponse();
  await handler({
    method: "OPTIONS",
    headers: {}
  }, response);

  assert.equal(response.headers["Access-Control-Allow-Origin"], "*");
  assert.equal(response.headers.Vary, "Origin");
});

test("CORS enforces CUBESYNC_ALLOWED_ORIGINS allowlist when configured", async () => {
  const originalEnv = process.env.CUBESYNC_ALLOWED_ORIGINS;
  process.env.CUBESYNC_ALLOWED_ORIGINS = "https://cubesync.vercel.app, https://custom.domain";

  try {
    const allowedResp = mockResponse();
    await handler({
      method: "OPTIONS",
      headers: { origin: "https://cubesync.vercel.app" }
    }, allowedResp);
    assert.equal(allowedResp.headers["Access-Control-Allow-Origin"], "https://cubesync.vercel.app");

    const disallowedResp = mockResponse();
    await handler({
      method: "OPTIONS",
      headers: { origin: "https://evil-attacker.com" }
    }, disallowedResp);
    assert.equal(disallowedResp.headers["Access-Control-Allow-Origin"], "https://cubesync.vercel.app");
  } finally {
    if (originalEnv === undefined) {
      delete process.env.CUBESYNC_ALLOWED_ORIGINS;
    } else {
      process.env.CUBESYNC_ALLOWED_ORIGINS = originalEnv;
    }
  }
});


// --- Missing body ---

test("missing request body returns 400", withRecaptcha(async () => {
  const response = mockResponse();
  await handler({
    method: "POST",
    headers: {},
    body: undefined
  }, response);

  assert.equal(response.statusCode, 400);
}));

// --- Extra fields edge cases & base64/fallback config ---

test("null extraFields returns undefined", withRecaptcha(async () => {
  let savedData = null;
  setFirebaseAdminForTest(mockFirestoreAdmin({
    add: async (data) => {
      savedData = data;
      return { id: "null-extras" };
    }
  }));

  const response = mockResponse();
  await handler({
    method: "POST",
    headers: {},
    body: {
      recaptchaToken: "token",
      payload: validPayload({ extraFields: null })
    }
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(savedData.extraFields, undefined);
}));

test("extraFields rejects invalid field IDs", withRecaptcha(async () => {
  const response = mockResponse();
  await handler({
    method: "POST",
    headers: {},
    body: {
      recaptchaToken: "token",
      payload: validPayload({
        extraFields: { "invalid-key": "value" }
      })
    }
  }, response);

  assert.equal(response.statusCode, 400);
  assert.match(JSON.parse(response.body).error, /Unexpected extra field/);
}));

test("extraFields rejects object values", withRecaptcha(async () => {
  const response = mockResponse();
  await handler({
    method: "POST",
    headers: {},
    body: {
      recaptchaToken: "token",
      payload: validPayload({
        extraFields: { customField_1: { nested: "object" } }
      })
    }
  }, response);

  assert.equal(response.statusCode, 400);
  assert.match(JSON.parse(response.body).error, /Invalid extra field value/);
}));

test("firebase admin initialization in submit - cert from base64 env", withRecaptcha(async () => {
  const originalCache = require.cache[require.resolve("firebase-admin")];
  
  const initializedConfig = [];
  const mockFirebaseAdmin = {
    apps: [],
    initializeApp(config) {
      this.apps.push({ name: "[DEFAULT]" });
      initializedConfig.push(config);
    },
    credential: {
      cert: (cert) => ({ cert }),
      applicationDefault: () => ({ default: true })
    },
    firestore() {
      return {
        collection: () => ({ add: async () => ({ id: "id" }) })
      };
    }
  };
  require.cache[require.resolve("firebase-admin")] = { exports: mockFirebaseAdmin };

  const prevBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64;
  const prevJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  const account = { type: "service_account", project_id: "base64-proj-submit" };
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 = Buffer.from(JSON.stringify(account)).toString("base64");
  delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  setFirebaseAdminForTest(null);

  try {
    const response = mockResponse();
    await handler({
      method: "POST",
      headers: {},
      body: {
        recaptchaToken: "token",
        payload: validPayload()
      }
    }, response);

    assert.equal(initializedConfig.length, 1);
    assert.deepEqual(initializedConfig[0].credential.cert, account);
  } finally {
    if (originalCache) {
      require.cache[require.resolve("firebase-admin")] = originalCache;
    } else {
      delete require.cache[require.resolve("firebase-admin")];
    }
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 = prevBase64;
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = prevJson;
  }
}));

test("firebase admin initialization in submit - application default fallback", withRecaptcha(async () => {
  const originalCache = require.cache[require.resolve("firebase-admin")];
  
  const initializedConfig = [];
  const mockFirebaseAdmin = {
    apps: [],
    initializeApp(config) {
      this.apps.push({ name: "[DEFAULT]" });
      initializedConfig.push(config);
    },
    credential: {
      cert: (cert) => ({ cert }),
      applicationDefault: () => ({ default: true })
    },
    firestore() {
      return {
        collection: () => ({ add: async () => ({ id: "id" }) })
      };
    }
  };
  require.cache[require.resolve("firebase-admin")] = { exports: mockFirebaseAdmin };

  const prevBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64;
  const prevJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64;
  delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  setFirebaseAdminForTest(null);

  try {
    const response = mockResponse();
    await handler({
      method: "POST",
      headers: {},
      body: {
        recaptchaToken: "token",
        payload: validPayload()
      }
    }, response);

    assert.equal(initializedConfig.length, 1);
    assert.deepEqual(initializedConfig[0].credential.default, true);
  } finally {
    if (originalCache) {
      require.cache[require.resolve("firebase-admin")] = originalCache;
    } else {
      delete require.cache[require.resolve("firebase-admin")];
    }
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 = prevBase64;
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = prevJson;
  }
}));
