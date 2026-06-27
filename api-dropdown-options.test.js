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
