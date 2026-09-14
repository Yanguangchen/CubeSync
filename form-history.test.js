const assert = require("node:assert/strict");
const test = require("node:test");

const history = require("./cubesync-form-history");

function memoryStorage(initial) {
  const data = new Map();
  if (initial) {
    Object.keys(initial).forEach(function (key) {
      data.set(key, initial[key]);
    });
  }
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    }
  };
}

function samplePayload(overrides) {
  return Object.assign({
    customerBilling: "Billing Co",
    contact: "Alex",
    cubeJobNumber: "CJ-101",
    dateOfCast: "2026-09-14",
    locationRepresented: "Bay 4",
    projectNameOnReport: "Tower A",
    supplier: "Supplier A",
    template: "Glassmorphic",
    status: "Draft",
    customFields: [],
    results: [
      { specimenRef: "REF-1", barcode: "BC-1", age: 7 }
    ]
  }, overrides);
}

test("saveSubmission stores a full payload including results, not just headers", () => {
  const storage = memoryStorage();
  const result = history.saveSubmission(samplePayload(), "doc-1", storage, "2026-09-14T02:00:00.000Z");

  assert.equal(result.ok, true);
  assert.equal(result.entry.id, "doc-1");
  assert.equal(result.entry.payload.results[0].specimenRef, "REF-1");
  assert.equal(result.entry.payload.dateOfCast, "2026-09-14");
  assert.equal(result.entry.summary.customerBilling, "Billing Co");
  assert.equal(history.hasSubmissions(storage), true);
  assert.equal(history.getById("doc-1", storage).payload.cubeJobNumber, "CJ-101");
});

test("saveSubmission strips recaptcha tokens and caller-supplied ids from the snapshot", () => {
  const storage = memoryStorage();
  const result = history.saveSubmission(samplePayload({
    recaptchaToken: "secret-token",
    recaptcha: "also-secret",
    id: "should-not-keep"
  }), "doc-2", storage, "2026-09-14T02:00:00.000Z");

  assert.equal(result.ok, true);
  assert.equal("recaptchaToken" in result.entry.payload, false);
  assert.equal("recaptcha" in result.entry.payload, false);
  assert.equal("id" in result.entry.payload, false);
  assert.equal(result.entry.id, "doc-2");
});

test("saveSubmission keeps the newest copies and drops the oldest when the cap is reached", () => {
  const storage = memoryStorage();
  for (let i = 0; i < history.MAX_ENTRIES + 3; i += 1) {
    const result = history.saveSubmission(
      samplePayload({ cubeJobNumber: "CJ-" + i }),
      "doc-" + i,
      storage,
      "2026-09-14T02:00:00.000Z"
    );
    assert.equal(result.ok, true);
  }

  const entries = history.listSubmissions(storage);
  assert.equal(entries.length, history.MAX_ENTRIES);
  assert.equal(entries[0].id, "doc-" + (history.MAX_ENTRIES + 2));
  assert.equal(history.getById("doc-0", storage), null);
});

test("replacing the same id does not duplicate the list", () => {
  const storage = memoryStorage();
  history.saveSubmission(samplePayload({ cubeJobNumber: "OLD" }), "same-id", storage, "2026-09-14T01:00:00.000Z");
  history.saveSubmission(samplePayload({ cubeJobNumber: "NEW" }), "same-id", storage, "2026-09-14T02:00:00.000Z");

  const entries = history.listSubmissions(storage);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].payload.cubeJobNumber, "NEW");
});

test("malformed storage and unknown versions are ignored", () => {
  const storage = memoryStorage({ [history.STORAGE_KEY]: "{not-json" });
  assert.deepEqual(history.listSubmissions(storage), []);

  storage.setItem(history.STORAGE_KEY, JSON.stringify({ v: 99, entries: [{ id: "x" }] }));
  assert.deepEqual(history.listSubmissions(storage), []);
});

test("clearHistory removes copies on this device", () => {
  const storage = memoryStorage();
  history.saveSubmission(samplePayload(), "doc-1", storage, "2026-09-14T02:00:00.000Z");
  assert.equal(history.clearHistory(storage), true);
  assert.equal(history.hasSubmissions(storage), false);
  assert.equal(history.getById("doc-1", storage), null);
});

test("formatEntryLabel uses date, customer, job number, and location", () => {
  const label = history.formatEntryLabel({
    v: 1,
    id: "doc-1",
    submittedAt: "2026-09-14T02:00:00.000Z",
    summary: {
      customerBilling: "Billing Co",
      cubeJobNumber: "CJ-101",
      locationRepresented: "Bay 4"
    },
    payload: samplePayload()
  });

  assert.match(label, /Billing Co/);
  assert.match(label, /CJ-101/);
  assert.match(label, /Bay 4/);
  assert.match(label, /14 Sep 2026/);
});

test("oversized snapshots drop older copies so a new one can still save", () => {
  const storage = memoryStorage();
  const bulky = "x".repeat(20 * 1024);
  for (let i = 0; i < 30; i += 1) {
    history.saveSubmission(
      samplePayload({ additionalInformation: bulky, cubeJobNumber: "BIG-" + i }),
      "big-" + i,
      storage,
      "2026-09-14T02:00:00.000Z"
    );
  }

  const entries = history.listSubmissions(storage);
  assert.ok(entries.length >= 1);
  assert.ok(entries.length <= history.MAX_ENTRIES);
  assert.ok(JSON.stringify({ v: 1, entries }).length <= history.MAX_BYTES || entries.length < 30);
  const stored = JSON.parse(storage.getItem(history.STORAGE_KEY));
  assert.ok(JSON.stringify(stored).length <= history.MAX_BYTES);
});

test("saveSubmission fails closed when storage throws", () => {
  const storage = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
    removeItem() {}
  };

  const result = history.saveSubmission(samplePayload(), "doc-1", storage, "2026-09-14T02:00:00.000Z");
  assert.equal(result.ok, false);
  assert.match(result.message, /this device/i);
});

test("implicit storage uses the browser localStorage on globalThis.window", () => {
  const previousWindow = globalThis.window;
  const storage = memoryStorage();
  globalThis.window = { localStorage: storage };
  try {
    const result = history.saveSubmission(samplePayload(), "implicit-1", undefined, "2026-09-14T02:00:00.000Z");
    assert.equal(result.ok, true);
    assert.equal(history.getById("implicit-1").payload.customerBilling, "Billing Co");
    assert.equal(history.hasSubmissions(), true);
  } finally {
    if (previousWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = previousWindow;
    }
  }
});
