const assert = require("node:assert/strict");
const test = require("node:test");

const handler = require("./api/dropdown-options");

function createResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
      return this;
    },
    end(value) {
      this.body = value || "";
    }
  };
}

function createAdmin(existingData) {
  const writes = [];
  const docApi = {
    get: async () => ({ exists: !!existingData, data: () => existingData }),
    set: async (data, options) => { writes.push({ data, options }); }
  };
  return {
    apps: [{ name: "test" }],
    auth: () => ({
      verifyIdToken: async () => ({ email: "desmond@rakmat.com.sg" })
    }),
    firestore: Object.assign(() => ({
      collection: () => ({ doc: () => docApi })
    }), {
      FieldValue: {
        serverTimestamp: () => "SERVER_TIME",
        arrayUnion: (...values) => ({ __op: "arrayUnion", values })
      }
    }),
    writes
  };
}

test("dropdown options API reads shared options", async () => {
  const admin = createAdmin({ supplier: ["  A ", "a"], bogus: ["ignored"] });
  handler._test.setFirebaseAdminForTest(admin);
  const response = createResponse();

  await handler({ method: "GET", headers: {} }, response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body).options, { supplier: ["A"] });
});

test("dropdown options API saves managed lists for allowlisted staff", async () => {
  const admin = createAdmin({});
  handler._test.setFirebaseAdminForTest(admin);
  const response = createResponse();

  await handler({
    method: "POST",
    headers: { authorization: "Bearer token" },
    body: {
      action: "save",
      options: { supplier: ["A", "a", "B"], bogus: ["ignored"] }
    }
  }, response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body).options, { supplier: ["A", "B"] });
  assert.equal(admin.writes.length, 1);
  assert.deepEqual(admin.writes[0].options, { merge: true });
  assert.deepEqual(admin.writes[0].data.supplier, ["A", "B"]);
  assert.equal(admin.writes[0].data.updatedAt, "SERVER_TIME");
});

test("dropdown options API appends promoted values with arrayUnion", async () => {
  const admin = createAdmin({});
  handler._test.setFirebaseAdminForTest(admin);
  const response = createResponse();

  await handler({
    method: "POST",
    headers: { authorization: "Bearer token" },
    body: { action: "add", options: { supplier: "New Supplier" } }
  }, response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(admin.writes[0].data.supplier, { __op: "arrayUnion", values: ["New Supplier"] });
});

// --- New coverage-increasing tests ---

test("stripWrappingQuotes utility", () => {
  const { stripWrappingQuotes } = handler._test;
  assert.equal(stripWrappingQuotes(null), "");
  assert.equal(stripWrappingQuotes(undefined), "");
  assert.equal(stripWrappingQuotes("  "), "");
  assert.equal(stripWrappingQuotes("'test'"), "test");
  assert.equal(stripWrappingQuotes("\"test\""), "test");
  assert.equal(stripWrappingQuotes("'test\""), "'test\""); // mismatched
  assert.equal(stripWrappingQuotes("no-quotes"), "no-quotes");
});

test("parseServiceAccount utility", () => {
  const { parseServiceAccount } = handler._test;
  assert.equal(parseServiceAccount(null), null);
  assert.equal(parseServiceAccount(""), null);
  assert.equal(parseServiceAccount(undefined), null);

  const rawJson = '{"project_id":"test","private_key":"key\\\\nline"}';
  const parsed = parseServiceAccount(rawJson);
  assert.equal(parsed.project_id, "test");
  assert.equal(parsed.private_key, "key\nline");
});

test("handles OPTIONS preflight request", async () => {
  const response = createResponse();
  await handler({ method: "OPTIONS", headers: {} }, response);
  assert.equal(response.statusCode, 204);
  assert.equal(response.headers["Access-Control-Allow-Origin"], "*");
});

test("rejects unsupported HTTP methods with 405", async () => {
  const response = createResponse();
  await handler({ method: "PUT", headers: {} }, response);
  assert.equal(response.statusCode, 405);
  const body = JSON.parse(response.body);
  assert.equal(body.error, "Dropdown options API only accepts GET or POST.");
});

test("rejects when Authorization header is missing or invalid", async () => {
  const admin = createAdmin({});
  handler._test.setFirebaseAdminForTest(admin);

  // Missing Authorization header
  const response1 = createResponse();
  await handler({ method: "POST", headers: {}, body: { action: "save" } }, response1);
  assert.equal(response1.statusCode, 400);
  assert.equal(JSON.parse(response1.body).error, "Missing Firebase ID token.");

  // Malformed Authorization header
  const response2 = createResponse();
  await handler({ method: "POST", headers: { authorization: "Basic base64" }, body: { action: "save" } }, response2);
  assert.equal(response2.statusCode, 400);
  assert.equal(JSON.parse(response2.body).error, "Missing Firebase ID token.");
});

test("rejects non-allowlisted email addresses", async () => {
  const admin = createAdmin({});
  admin.auth = () => ({
    verifyIdToken: async () => ({ email: "intruder@evil.com" })
  });
  handler._test.setFirebaseAdminForTest(admin);

  const response = createResponse();
  await handler({
    method: "POST",
    headers: { authorization: "Bearer token" },
    body: { action: "save" }
  }, response);

  assert.equal(response.statusCode, 400);
  assert.equal(JSON.parse(response.body).error, "This account is not allowed to manage autocomplete lists.");
});

test("rejects unknown action in POST request", async () => {
  const admin = createAdmin({});
  handler._test.setFirebaseAdminForTest(admin);

  const response = createResponse();
  await handler({
    method: "POST",
    headers: { authorization: "Bearer token" },
    body: { action: "invalid_action" }
  }, response);

  assert.equal(response.statusCode, 400);
  assert.equal(JSON.parse(response.body).error, "Unknown dropdown options action.");
});

test("firebase admin initialization - cert from base64 env", async () => {
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
        collection: () => ({ doc: () => ({ get: async () => ({ exists: false }) }) })
      };
    }
  };
  require.cache[require.resolve("firebase-admin")] = { exports: mockFirebaseAdmin };

  const prevBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64;
  const prevJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  const account = { type: "service_account", project_id: "base64-proj" };
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 = Buffer.from(JSON.stringify(account)).toString("base64");
  delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  handler._test.setFirebaseAdminForTest(null);

  try {
    const response = createResponse();
    await handler({ method: "GET", headers: {} }, response);

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
});

test("firebase admin initialization - cert from JSON env", async () => {
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
        collection: () => ({ doc: () => ({ get: async () => ({ exists: false }) }) })
      };
    }
  };
  require.cache[require.resolve("firebase-admin")] = { exports: mockFirebaseAdmin };

  const prevBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64;
  const prevJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  const account = { type: "service_account", project_id: "json-proj" };
  delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64;
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify(account);

  handler._test.setFirebaseAdminForTest(null);

  try {
    const response = createResponse();
    await handler({ method: "GET", headers: {} }, response);

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
});

test("firebase admin initialization - application default fallback", async () => {
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
        collection: () => ({ doc: () => ({ get: async () => ({ exists: false }) }) })
      };
    }
  };
  require.cache[require.resolve("firebase-admin")] = { exports: mockFirebaseAdmin };

  const prevBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64;
  const prevJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64;
  delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  handler._test.setFirebaseAdminForTest(null);

  try {
    const response = createResponse();
    await handler({ method: "GET", headers: {} }, response);

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
});

test("firebase admin initialization - early exit if already initialized", async () => {
  const originalCache = require.cache[require.resolve("firebase-admin")];
  
  let initCount = 0;
  const mockFirebaseAdmin = {
    apps: [{ name: "[DEFAULT]" }],
    initializeApp() {
      initCount++;
    },
    firestore() {
      return {
        collection: () => ({ doc: () => ({ get: async () => ({ exists: false }) }) })
      };
    }
  };
  require.cache[require.resolve("firebase-admin")] = { exports: mockFirebaseAdmin };

  handler._test.setFirebaseAdminForTest(null);

  try {
    const response = createResponse();
    await handler({ method: "GET", headers: {} }, response);

    assert.equal(initCount, 0);
  } finally {
    if (originalCache) {
      require.cache[require.resolve("firebase-admin")] = originalCache;
    } else {
      delete require.cache[require.resolve("firebase-admin")];
    }
  }
});

test("handles handler errors and returns 400", async () => {
  const admin = createAdmin({});
  admin.firestore = () => {
    throw new Error("Firestore connection failure");
  };
  handler._test.setFirebaseAdminForTest(admin);

  const response = createResponse();
  await handler({ method: "GET", headers: {} }, response);

  assert.equal(response.statusCode, 400);
  assert.equal(JSON.parse(response.body).error, "Firestore connection failure");
});
