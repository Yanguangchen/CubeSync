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

test("saveSubmission keeps the newest copies and FIFO-drops the oldest at 25 entries", () => {
  const storage = memoryStorage();
  for (let i = 0; i < history.MAX_ENTRIES; i += 1) {
    const result = history.saveSubmission(
      samplePayload({ cubeJobNumber: "CJ-" + i }),
      "doc-" + i,
      storage,
      "2026-09-14T02:00:00.000Z"
    );
    assert.equal(result.ok, true);
    assert.equal(result.evicted, 0);
  }

  const overflow = history.saveSubmission(
    samplePayload({ cubeJobNumber: "CJ-NEW" }),
    "doc-new",
    storage,
    "2026-09-14T02:00:00.000Z"
  );
  assert.equal(overflow.ok, true);
  assert.equal(overflow.evicted, 1);

  const entries = history.listSubmissions(storage);
  assert.equal(entries.length, history.MAX_ENTRIES);
  assert.equal(entries[0].id, "doc-new");
  assert.equal(history.getById("doc-0", storage), null);
  assert.ok(history.getById("doc-1", storage));
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

test("byte-ceiling FIFO drops the oldest copies first so the newest still saves", () => {
  const storage = memoryStorage();
  const bulky = "x".repeat(20 * 1024);
  let last = null;
  for (let i = 0; i < 30; i += 1) {
    last = history.saveSubmission(
      samplePayload({ additionalInformation: bulky, cubeJobNumber: "BIG-" + i }),
      "big-" + i,
      storage,
      "2026-09-14T02:00:00.000Z"
    );
    assert.equal(last.ok, true);
  }

  const entries = history.listSubmissions(storage);
  assert.ok(entries.length >= 1);
  assert.ok(entries.length < 30);
  assert.ok(last.evicted >= 1);
  assert.equal(entries[0].id, "big-29");
  assert.equal(history.getById("big-0", storage), null);
  const stored = JSON.parse(storage.getItem(history.STORAGE_KEY));
  assert.ok(JSON.stringify(stored).length <= history.MAX_BYTES);
});

function quotaStorage(maxChars) {
  const data = new Map();
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      const encoded = String(value);
      if (encoded.length > maxChars) {
        const error = new Error("The quota has been exceeded.");
        error.name = "QuotaExceededError";
        error.code = 22;
        throw error;
      }
      data.set(key, encoded);
    },
    removeItem(key) {
      data.delete(key);
    }
  };
}

test("browser quota FIFO drops oldest copies until the new snapshot fits", () => {
  const bulky = "x".repeat(8 * 1024);
  const storage = quotaStorage(20 * 1024);
  assert.equal(
    history.saveSubmission(samplePayload({ additionalInformation: bulky }), "q-1", storage, "2026-09-14T02:00:00.000Z").ok,
    true
  );
  assert.equal(
    history.saveSubmission(samplePayload({ additionalInformation: bulky }), "q-2", storage, "2026-09-14T02:00:00.000Z").ok,
    true
  );
  const third = history.saveSubmission(
    samplePayload({ additionalInformation: bulky }),
    "q-3",
    storage,
    "2026-09-14T02:00:00.000Z"
  );
  assert.equal(third.ok, true);
  assert.ok(third.evicted >= 1);
  assert.equal(history.getById("q-3", storage).id, "q-3");
  assert.equal(history.getById("q-1", storage), null);
  assert.ok(storage.getItem(history.STORAGE_KEY).length <= 20 * 1024);
});

test("a single snapshot larger than browser quota cannot be kept", () => {
  const storage = quotaStorage(1000);
  const result = history.saveSubmission(
    samplePayload({ additionalInformation: "x".repeat(5000) }),
    "too-big",
    storage,
    "2026-09-14T02:00:00.000Z"
  );
  assert.equal(result.ok, false);
  assert.equal(history.getById("too-big", storage), null);
});

test("isQuotaExceededError recognizes browser quota names and codes", () => {
  assert.equal(history.isQuotaExceededError({ name: "QuotaExceededError" }), true);
  assert.equal(history.isQuotaExceededError({ name: "NS_ERROR_DOM_QUOTA_REACHED" }), true);
  assert.equal(history.isQuotaExceededError({ code: 22 }), true);
  assert.equal(history.isQuotaExceededError({ code: 1014 }), true);
  assert.equal(history.isQuotaExceededError({ name: "TypeError" }), false);
  assert.equal(history.isQuotaExceededError(null), false);
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
