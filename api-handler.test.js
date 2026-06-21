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
