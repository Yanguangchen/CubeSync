const assert = require("node:assert/strict");
const test = require("node:test");
const handler = require("./api/cube-request-submit");
const { REQUIRED_FORM_FIELDS } = require("./cubesync-form-data");
const { parseServiceAccount, stripWrappingQuotes } = handler._test;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

// Minimal valid payload — all 13 required fields filled, no disabled config.
function basePayload(overrides = {}) {
  return {
    customerBilling: "Acme Ltd",
    contact: "Ada",
    supplier: "MixCo",
    supplierDisplay: "MixCo Display",
    locationRepresented: "Site A",
    dateOfCast: "2026-06-18",
    concreteGrade: "C35",
    reportGrade: "C35",
    specimenSize: "150 x 150 x 150",
    slumpMeasured: 100,
    slumpSpecified: 90,
    personInCharge: "PIC",
    managerInCharge: "MIC",
    template: "Glassmorphic",
    status: "Draft",
    results: [],
    ...overrides
  };
}

// Mock Firestore that returns the given field config doc (or simulates missing/error).
function mockFirestoreWithConfig({ fieldConfig = null, throws = false } = {}) {
  function firestore() {
    return {
      collection(name) {
        if (name === "settings") {
          return {
            doc() {
              return {
                get: throws
                  ? async () => { throw new Error("Firestore unavailable"); }
                  : async () => ({
                      exists: fieldConfig !== null,
                      data: () => fieldConfig
                    })
              };
            }
          };
        }
        return { add: async () => ({ id: "new-doc" }) };
      }
    };
  }
  firestore.FieldValue = { serverTimestamp: () => ({ ".sv": "timestamp" }) };
  return firestore;
}

async function postPayload(payload, firestoreMock) {
  const previousFetch = global.fetch;
  const previousSecret = process.env.CUBESYNC_RECAPTCHA_SECRET_KEY;
  global.fetch = async () => ({ async json() { return { success: true }; } });
  process.env.CUBESYNC_RECAPTCHA_SECRET_KEY = "test-secret";
  handler._test.setFirebaseAdminForTest({ apps: [{}], firestore: firestoreMock });

  const response = mockResponse();
  try {
    await handler({
      method: "POST",
      headers: {},
      socket: { remoteAddress: "127.0.0.1" },
      body: { recaptchaToken: "token", payload }
    }, response);
    return response;
  } finally {
    global.fetch = previousFetch;
    if (previousSecret === undefined) delete process.env.CUBESYNC_RECAPTCHA_SECRET_KEY;
    else process.env.CUBESYNC_RECAPTCHA_SECRET_KEY = previousSecret;
    handler._test.setFirebaseAdminForTest(null);
  }
}

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

test("submission API writes new request fields to Firestore", async () => {
  const savedDocuments = [];
  const serverTimestamp = { ".sv": "timestamp" };
  function firestore() {
    return {
      collection(name) {
        assert.equal(name, "cubeRequests");
        return {
          add(data) {
            savedDocuments.push(data);
            return Promise.resolve({ id: "new-cube-request" });
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

  const previousFetch = global.fetch;
  const previousSecret = process.env.CUBESYNC_RECAPTCHA_SECRET_KEY;
  global.fetch = async () => ({
    async json() {
      return { success: true };
    }
  });
  process.env.CUBESYNC_RECAPTCHA_SECRET_KEY = "test-secret";
  handler._test.setFirebaseAdminForTest({
    apps: [{}],
    firestore
  });

  try {
    const response = mockResponse();
    await handler({
      method: "POST",
      headers: {},
      socket: { remoteAddress: "127.0.0.1" },
      body: {
        recaptchaToken: "captcha-token",
        payload: {
          projectErp: "ERP-001",
          customerBilling: "Acme Billing",
          projectNameOnReport: "Tower",
          clientNameOnReport: "Acme Client",
          contact: "Jane",
          enableManualCubeJobNumber: true,
          cubeJobNumber: "CUBE-001",
          quote: "Q-001",
          testItem: "Concrete cube",
          supplier: "Supplier A",
          supplierDisplay: "Supplier A Display",
          locationRepresented: "Level 12",
          additionalInformation: "Rush job",
          dateOfCast: "2026-06-18",
          concreteGrade: "C35/45",
          reportGrade: "C35/45",
          specimenSize: "150 x 150 x 150",
          slumpMeasured: 120,
          slumpSpecified: 100,
          personInCharge: "Jane",
          managerInCharge: "John",
          template: "Original",
          status: "Draft",
          results: []
        }
      }
    }, response);

    assert.equal(response.statusCode, 200);
    assert.deepEqual(JSON.parse(response.body), { id: "new-cube-request" });
    assert.equal(savedDocuments.length, 1);
    assert.deepEqual(savedDocuments[0], {
      projectErp: "ERP-001",
      customerBilling: "Acme Billing",
      projectNameOnReport: "Tower",
      clientNameOnReport: "Acme Client",
      contact: "Jane",
      enableManualCubeJobNumber: true,
      cubeJobNumber: "CUBE-001",
      quote: "Q-001",
      testItem: "Concrete cube",
      supplier: "Supplier A",
      supplierDisplay: "Supplier A Display",
      locationRepresented: "Level 12",
      additionalInformation: "Rush job",
      dateOfCast: "2026-06-18",
      concreteGrade: "C35/45",
      reportGrade: "C35/45",
      specimenSize: "150 x 150 x 150",
      slumpMeasured: 120,
      slumpSpecified: 100,
      personInCharge: "Jane",
      managerInCharge: "John",
      template: "Original",
      status: "Draft",
      results: [],
      updatedAt: serverTimestamp,
      createdAt: serverTimestamp
    });
  } finally {
    global.fetch = previousFetch;
    if (previousSecret === undefined) {
      delete process.env.CUBESYNC_RECAPTCHA_SECRET_KEY;
    } else {
      process.env.CUBESYNC_RECAPTCHA_SECRET_KEY = previousSecret;
    }
    handler._test.setFirebaseAdminForTest(null);
  }
});

test("submission API returns 400 for failed reCAPTCHA verification", async () => {
  const previousFetch = global.fetch;
  const previousSecret = process.env.CUBESYNC_RECAPTCHA_SECRET_KEY;
  global.fetch = async () => ({
    async json() {
      return { success: false };
    }
  });
  process.env.CUBESYNC_RECAPTCHA_SECRET_KEY = "test-secret";

  try {
    const response = mockResponse();
    await handler({
      method: "POST",
      headers: {},
      body: {
        recaptchaToken: "bad-token",
        payload: { template: "Original", status: "Draft", results: [] }
      }
    }, response);

    assert.equal(response.statusCode, 400);
    assert.match(JSON.parse(response.body).error, /reCAPTCHA verification failed/);
  } finally {
    global.fetch = previousFetch;
    if (previousSecret === undefined) {
      delete process.env.CUBESYNC_RECAPTCHA_SECRET_KEY;
    } else {
      process.env.CUBESYNC_RECAPTCHA_SECRET_KEY = previousSecret;
    }
  }
});

test("submission API returns 400 for malformed payload (unexpected field)", async () => {
  const previousFetch = global.fetch;
  const previousSecret = process.env.CUBESYNC_RECAPTCHA_SECRET_KEY;
  global.fetch = async () => ({
    async json() {
      return { success: true };
    }
  });
  process.env.CUBESYNC_RECAPTCHA_SECRET_KEY = "test-secret";

  try {
    const response = mockResponse();
    await handler({
      method: "POST",
      headers: {},
      body: {
        recaptchaToken: "good-token",
        payload: { badField: "123" }
      }
    }, response);

    assert.equal(response.statusCode, 400);
    assert.match(JSON.parse(response.body).error, /Unexpected field/);
  } finally {
    global.fetch = previousFetch;
    if (previousSecret === undefined) {
      delete process.env.CUBESYNC_RECAPTCHA_SECRET_KEY;
    } else {
      process.env.CUBESYNC_RECAPTCHA_SECRET_KEY = previousSecret;
    }
  }
});

test("submission API rejects submissions targeting an existing document id (create-only)", async () => {
  // The public endpoint is unauthenticated (reCAPTCHA-gated only). Allowing a
  // caller-supplied id with set(..., { merge: true }) let anyone overwrite any
  // existing cubeRequests document (IDOR). Public submissions must be create-only.
  const previousFetch = global.fetch;
  const previousSecret = process.env.CUBESYNC_RECAPTCHA_SECRET_KEY;
  global.fetch = async () => ({
    async json() {
      return { success: true };
    }
  });
  process.env.CUBESYNC_RECAPTCHA_SECRET_KEY = "test-secret";
  handler._test.setFirebaseAdminForTest({
    apps: [{}],
    firestore() {
      throw new Error("Firestore must not be touched when an id is supplied");
    }
  });

  try {
    const response = mockResponse();
    await handler({
      method: "POST",
      headers: {},
      socket: { remoteAddress: "127.0.0.1" },
      body: {
        id: "existing-id",
        recaptchaToken: "captcha-token",
        payload: {
          template: "Original",
          status: "Draft",
          results: []
        }
      }
    }, response);

    assert.equal(response.statusCode, 400);
    assert.match(JSON.parse(response.body).error, /cannot target an existing document/i);
  } finally {
    global.fetch = previousFetch;
    if (previousSecret === undefined) {
      delete process.env.CUBESYNC_RECAPTCHA_SECRET_KEY;
    } else {
      process.env.CUBESYNC_RECAPTCHA_SECRET_KEY = previousSecret;
    }
    handler._test.setFirebaseAdminForTest(null);
  }
});

test("submission API forces public submissions to Draft status", async () => {
  // status is staff lifecycle state. An anonymous submission must never be able
  // to set status: "Ready" and inject itself straight into the RPA/ERP queue.
  const savedDocuments = [];
  const serverTimestamp = { ".sv": "timestamp" };
  function firestore() {
    return {
      collection(name) {
        assert.equal(name, "cubeRequests");
        return {
          add(data) {
            savedDocuments.push(data);
            return Promise.resolve({ id: "new-cube-request" });
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

  const previousFetch = global.fetch;
  const previousSecret = process.env.CUBESYNC_RECAPTCHA_SECRET_KEY;
  global.fetch = async () => ({
    async json() {
      return { success: true };
    }
  });
  process.env.CUBESYNC_RECAPTCHA_SECRET_KEY = "test-secret";
  handler._test.setFirebaseAdminForTest({
    apps: [{}],
    firestore
  });

  try {
    const response = mockResponse();
    await handler({
      method: "POST",
      headers: {},
      socket: { remoteAddress: "127.0.0.1" },
      body: {
        recaptchaToken: "captcha-token",
        payload: {
          customerBilling: "Acme Billing",
          contact: "Jane",
          supplier: "Supplier A",
          supplierDisplay: "Supplier A Display",
          locationRepresented: "Level 12",
          dateOfCast: "2026-06-20",
          concreteGrade: "C35/45",
          reportGrade: "C35/45",
          specimenSize: "150 x 150 x 150",
          slumpMeasured: 10,
          slumpSpecified: 20,
          personInCharge: "Jane",
          managerInCharge: "John",
          template: "Original",
          status: "Ready",
          results: []
        }
      }
    }, response);

    assert.equal(response.statusCode, 200);
    assert.deepEqual(JSON.parse(response.body), { id: "new-cube-request" });
    assert.equal(savedDocuments.length, 1);
    assert.equal(savedDocuments[0].status, "Draft");
  } finally {
    global.fetch = previousFetch;
    if (previousSecret === undefined) {
      delete process.env.CUBESYNC_RECAPTCHA_SECRET_KEY;
    } else {
      process.env.CUBESYNC_RECAPTCHA_SECRET_KEY = previousSecret;
    }
    handler._test.setFirebaseAdminForTest(null);
  }
});

test("submission API allows customFields and stores them", async () => {
  const previousFetch = global.fetch;
  const previousSecret = process.env.CUBESYNC_RECAPTCHA_SECRET_KEY;
  process.env.CUBESYNC_RECAPTCHA_SECRET_KEY = "dummy-secret";

  try {
    global.fetch = async (url) => {
      assert.ok(url.includes("siteverify"));
      return { json: async () => ({ success: true }) };
    };

    let savedData = null;
    const mockFirestore = () => ({
      collection: (name) => {
        assert.equal(name, "cubeRequests");
        return {
          add: async (data) => {
            savedData = data;
            return { id: "new-cube-request" };
          }
        };
      }
    });
    mockFirestore.FieldValue = { serverTimestamp: () => "TIMESTAMP" };

    const mockAdmin = {
      apps: [{}],
      firestore: mockFirestore
    };
    handler._test.setFirebaseAdminForTest(mockAdmin);

    const response = mockResponse();
    await handler({
      method: "POST",
      headers: { origin: "http://localhost:5500" },
      body: {
        recaptchaToken: "valid-token",
        payload: {
          client: "Client Custom",
          project: "Project Custom",
          reportNo: "REPORT-CUSTOM",
          template: "Original",
          status: "Draft",
          results: [],
          customFields: ["projectErp", "supplier"],
          customerBilling: "Billing",
          contact: "Contact",
          supplier: "Supplier",
          supplierDisplay: "Supplier Display",
          locationRepresented: "Location",
          dateOfCast: "2026-06-18",
          concreteGrade: "C35",
          reportGrade: "C35",
          specimenSize: "150",
          slumpMeasured: 100,
          slumpSpecified: 100,
          personInCharge: "Person",
          managerInCharge: "Manager"
        }
      }
    }, response);

    assert.equal(response.statusCode, 200);
    assert.deepEqual(savedData.customFields, ["projectErp", "supplier"]);
  } finally {
    global.fetch = previousFetch;
    if (previousSecret === undefined) {
      delete process.env.CUBESYNC_RECAPTCHA_SECRET_KEY;
    } else {
      process.env.CUBESYNC_RECAPTCHA_SECRET_KEY = previousSecret;
    }
    handler._test.setFirebaseAdminForTest(null);
  }
});

test("submission API accepts empty disabled required fields when formFieldConfig disables them", async () => {
  const previousFetch = global.fetch;
  const previousSecret = process.env.CUBESYNC_RECAPTCHA_SECRET_KEY;
  process.env.CUBESYNC_RECAPTCHA_SECRET_KEY = "test-secret";
  global.fetch = async () => ({ async json() { return { success: true }; } });

  const serverTimestamp = { ".sv": "timestamp" };
  const fieldConfig = {
    requestFields: {
      customerBilling: false,
      contact: false,
      personInCharge: false,
      managerInCharge: false
    }
  };

  function mockFirestore() {
    return {
      collection(name) {
        if (name === "settings") {
          return {
            doc(id) {
              return { get: async () => ({ exists: true, data: () => fieldConfig }) };
            }
          };
        }
        return { add: async () => ({ id: "saved-id" }) };
      }
    };
  }
  mockFirestore.FieldValue = { serverTimestamp: () => serverTimestamp };
  handler._test.setFirebaseAdminForTest({ apps: [{}], firestore: mockFirestore });

  const response = mockResponse();
  await handler({
    method: "POST",
    headers: {},
    socket: { remoteAddress: "127.0.0.1" },
    body: {
      recaptchaToken: "token",
      payload: {
        customerBilling: "",
        contact: "",
        personInCharge: "",
        managerInCharge: "",
        supplier: "Supplier A",
        supplierDisplay: "Supplier A Display",
        locationRepresented: "Site A",
        dateOfCast: "2026-06-18",
        concreteGrade: "C35",
        reportGrade: "C35",
        specimenSize: "150 x 150 x 150",
        slumpMeasured: 100,
        slumpSpecified: 90,
        template: "Glassmorphic",
        status: "Draft",
        results: []
      }
    }
  }, response);

  try {
    assert.equal(response.statusCode, 200,
      `Expected 200 but got ${response.statusCode}: ${response.body}`);
  } finally {
    global.fetch = previousFetch;
    if (previousSecret === undefined) {
      delete process.env.CUBESYNC_RECAPTCHA_SECRET_KEY;
    } else {
      process.env.CUBESYNC_RECAPTCHA_SECRET_KEY = previousSecret;
    }
    handler._test.setFirebaseAdminForTest(null);
  }
});

// ---------------------------------------------------------------------------
// Field-config / server-side validation parity tests
//
// These tests guard against the class of bug where a required field is hidden
// on the customer form (via field settings) but the server still rejects an
// empty value because it validated without reading the config.
// ---------------------------------------------------------------------------

test("API still rejects an enabled required field that is empty", async () => {
  const response = await postPayload(
    basePayload({ customerBilling: "" }),
    mockFirestoreWithConfig({ fieldConfig: { requestFields: { customerBilling: true } } })
  );
  assert.equal(response.statusCode, 400);
  assert.match(JSON.parse(response.body).error, /Customer \(Billing\)/);
});

test("API accepts empty value for each individually disabled required field", async () => {
  for (const field of REQUIRED_FORM_FIELDS) {
    const response = await postPayload(
      basePayload({ [field]: "" }),
      mockFirestoreWithConfig({ fieldConfig: { requestFields: { [field]: false } } })
    );
    assert.equal(
      response.statusCode, 200,
      `Expected 200 when ${field} is disabled but got ${response.statusCode}: ${response.body}`
    );
  }
});

test("API enforces remaining enabled required fields when only some are disabled", async () => {
  const response = await postPayload(
    basePayload({ customerBilling: "", contact: "" }),
    mockFirestoreWithConfig({
      fieldConfig: { requestFields: { customerBilling: false, contact: true } }
    })
  );
  assert.equal(response.statusCode, 400);
  assert.match(JSON.parse(response.body).error, /Contact/);
});

test("API falls back to requiring all fields when formFieldConfig Firestore fetch throws", async () => {
  const response = await postPayload(
    basePayload({ customerBilling: "" }),
    mockFirestoreWithConfig({ throws: true })
  );
  assert.equal(response.statusCode, 400);
  assert.match(JSON.parse(response.body).error, /Customer \(Billing\)/);
});

test("API falls back to requiring all fields when formFieldConfig doc does not exist", async () => {
  const response = await postPayload(
    basePayload({ customerBilling: "" }),
    mockFirestoreWithConfig({ fieldConfig: null })
  );
  assert.equal(response.statusCode, 400);
  assert.match(JSON.parse(response.body).error, /Customer \(Billing\)/);
});
