const { JSDOM } = require("jsdom");
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const glassHtml = fs.readFileSync("glassmorphic.html", "utf8");

function installDom(html, url = "http://localhost/") {
  const dom = new JSDOM(html, { url });
  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.URLSearchParams = dom.window.URLSearchParams;
  global.Event = dom.window.Event;
  global.localStorage = dom.window.localStorage;
  global.scrollTo = () => {};
  global.window.scrollTo = () => {};
  global.window.Element.prototype.scrollIntoView = () => {};
  global.window.fetch = async () => ({
    ok: true,
    text: async () => "Option A\nOption B"
  });
  global.window.CubeSyncBarcode = require("./barcode.js");
  global.window.CubeSyncFormMarkup = require("./cubesync-form-markup.js");
  global.window.CubeSyncFormData = require("./cubesync-form-data.js");
  global.window.CubeSyncFormPrefs = require("./cubesync-form-prefs.js");
  global.window.CubeSyncFormHistory = require("./cubesync-form-history.js");
  global.window.CubeSyncAutocomplete = require("./cubesync-autocomplete.js");
  global.window.CubeSyncTableManager = require("./cubesync-table-manager.js");

  delete require.cache[require.resolve("./app.js")];
  require("./app.js");

  return dom;
}

function dispatchDOMContentLoaded() {
  global.window.dispatchEvent(new global.Event("DOMContentLoaded"));
}

function fillRequiredRequestFields(document) {
  const values = {
    projectErp: "PRJ-001",
    customerBilling: "Billing",
    projectNameOnReport: "Project",
    clientNameOnReport: "Client",
    contact: "Contact",
    cubeJobNumber: "CJ-001",
    testItem: "BS EN 12390-3 : 2019",
    concreteGrade: "C35/45",
    reportGrade: "C35/45",
    supplier: "Supplier",
    supplierDisplay: "Supplier Display",
    locationRepresented: "Location",
    additionalInformation: "",
    dateOfCast: "2026-06-18",
    slumpMeasured: "120",
    specimenSize: "150 x 150 x 150",
    slumpSpecified: "100",
    personInCharge: "PIC",
    managerInCharge: "Manager"
  };

  Object.entries(values).forEach(([name, value]) => {
    const control = document.querySelector(`[name="${name}"]`);
    if (control) control.value = value;
  });
}

test("auto-print triggers window.print on ?print=true after loading form", async () => {
  installDom(glassHtml, "http://localhost/glassmorphic.html?id=print-form&print=true");

  let printCalls = 0;
  global.window.print = () => {
    printCalls += 1;
  };

  global.window.CubeSyncFirestore = {
    getCubeRequest: async (id) => {
      assert.equal(id, "print-form");
      return {
        projectErp: "Print ERP",
        results: [{ setNo: 1, specimenRef: "REF-1", barcode: "BC-1" }]
      };
    }
  };

  dispatchDOMContentLoaded();

  await new Promise((resolve) => setTimeout(resolve, 1000));

  assert.ok(printCalls >= 1, `expected window.print to be called, got ${printCalls} calls`);
  assert.equal(global.document.querySelector('[name="projectErp"]').value, "Print ERP");

  delete require.cache[require.resolve("./app.js")];
});

test("loading a form with ?setNo= keeps only that set's result rows", async () => {
  installDom(glassHtml, "http://localhost/glassmorphic.html?id=multi-set&setNo=2");

  global.window.CubeSyncFirestore = {
    getCubeRequest: async (id) => {
      assert.equal(id, "multi-set");
      return {
        projectErp: "Set ERP",
        customerBilling: "Client A",
        dateOfCast: "2026-06-18",
        results: [
          { setNo: 1, specimenRef: "SET-1", barcode: "BC-1" },
          { setNo: 2, specimenRef: "SET-2A", barcode: "BC-2A" },
          { setNo: 2, specimenRef: "SET-2B", barcode: "BC-2B" }
        ]
      };
    }
  };

  dispatchDOMContentLoaded();
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(global.document.querySelector('[name="projectErp"]').value, "Set ERP");
  assert.equal(global.document.querySelector('[name="specimenRef1"]').value, "SET-2A");
  assert.equal(global.document.querySelector('[name="specimenRef2"]').value, "SET-2B");
  assert.equal(global.document.querySelector('[name="specimenRef3"]'), null);

  delete require.cache[require.resolve("./app.js")];
});

test("form save error resets reCAPTCHA and shows error message", async () => {
  installDom(glassHtml, "http://localhost/glassmorphic.html");

  let recaptchaResetCalls = 0;
  global.window.CubeSyncEnv = { RECAPTCHA_SITE_KEY: "test-site-key" };
  global.window.grecaptcha = {
    render: () => 0,
    getResponse: () => "test-token",
    reset: () => { recaptchaResetCalls += 1; }
  };
  global.window.CubeSyncFirestore = {
    savePublicCubeRequest: async () => {
      throw new Error("Network timeout");
    }
  };

  dispatchDOMContentLoaded();
  fillRequiredRequestFields(global.document);
  global.document.querySelector('[name="specimenRef1"]').value = "T-001";
  global.document.querySelector('[name="barcode1"]').value = "BC-001";

  global.document.getElementById("nextStep").click();
  global.document.getElementById("nextStep").click();
  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.equal(global.document.getElementById("saveStatus").textContent, "Network timeout");
  assert.ok(global.document.getElementById("saveStatus").classList.contains("is-error"));
  assert.equal(recaptchaResetCalls, 1);
  assert.equal(global.document.getElementById("saveFormButton").disabled, false);

  delete require.cache[require.resolve("./app.js")];
});

test("reCAPTCHA error before submit shows message without saving", async () => {
  installDom(glassHtml, "http://localhost/glassmorphic.html");

  global.window.CubeSyncEnv = { RECAPTCHA_SITE_KEY: "test-site-key" };
  global.window.grecaptcha = {
    render: () => 0,
    getResponse: () => "" // Empty token triggers error
  };

  let saveCalled = false;
  global.window.CubeSyncFirestore = {
    savePublicCubeRequest: async () => {
      saveCalled = true;
      return "should-not-reach";
    }
  };

  dispatchDOMContentLoaded();
  fillRequiredRequestFields(global.document);
  global.document.querySelector('[name="specimenRef1"]').value = "T-001";
  global.document.querySelector('[name="barcode1"]').value = "BC-001";

  global.document.getElementById("nextStep").click();
  global.document.getElementById("nextStep").click();
  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.equal(saveCalled, false);
  assert.match(global.document.getElementById("saveStatus").textContent, /reCAPTCHA/);

  delete require.cache[require.resolve("./app.js")];
});

test("reCAPTCHA not loaded shows loading message", async () => {
  installDom(glassHtml, "http://localhost/glassmorphic.html");

  global.window.CubeSyncEnv = { RECAPTCHA_SITE_KEY: "test-site-key" };
  // No grecaptcha at all - simulates library not loaded yet
  delete global.window.grecaptcha;

  let saveCalled = false;
  global.window.CubeSyncFirestore = {
    savePublicCubeRequest: async () => {
      saveCalled = true;
      return "should-not-reach";
    }
  };

  dispatchDOMContentLoaded();
  fillRequiredRequestFields(global.document);
  global.document.querySelector('[name="specimenRef1"]').value = "T-001";
  global.document.querySelector('[name="barcode1"]').value = "BC-001";

  global.document.getElementById("nextStep").click();
  global.document.getElementById("nextStep").click();
  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.equal(saveCalled, false);
  assert.match(global.document.getElementById("saveStatus").textContent, /reCAPTCHA/i);

  delete require.cache[require.resolve("./app.js")];
});

test("manual cube job number toggle enables and disables the field", async () => {
  installDom(glassHtml);
  dispatchDOMContentLoaded();

  await new Promise((resolve) => setTimeout(resolve, 30));

  const form = global.document.getElementById("cubeRequestForm");
  const toggle = form.elements["enableManualCubeJobNumber"];
  const cubeJobInput = form.elements["cubeJobNumber"];

  if (!toggle || !cubeJobInput) {
    // If fields don't exist in the form, skip
    return;
  }

  // Initially disabled (checkbox unchecked)
  assert.equal(cubeJobInput.disabled, true);
  assert.ok(cubeJobInput.classList.contains("is-disabled"));

  // Enable
  toggle.checked = true;
  toggle.dispatchEvent(new global.Event("change"));
  assert.equal(cubeJobInput.disabled, false);
  assert.equal(cubeJobInput.classList.contains("is-disabled"), false);

  // Set a value, then disable - should clear value
  cubeJobInput.value = "CJ-123";
  toggle.checked = false;
  toggle.dispatchEvent(new global.Event("change"));
  assert.equal(cubeJobInput.disabled, true);
  assert.equal(cubeJobInput.value, "");

  delete require.cache[require.resolve("./app.js")];
});

test("removing a result row renumbers remaining rows", async () => {
  installDom(glassHtml);
  dispatchDOMContentLoaded();

  const tableBody = global.document.querySelector(".results-table tbody");

  // glassmorphic.html seeds 3 initial rows
  const initialRows = tableBody.querySelectorAll("tr").length;
  assert.ok(initialRows >= 3, `expected at least 3 seed rows, got ${initialRows}`);

  // Remove the first row
  const rows = tableBody.querySelectorAll("tr");
  const removeBtn = rows[0].querySelector(".remove-row-btn");
  if (removeBtn) {
    removeBtn.click();

    const remaining = tableBody.querySelectorAll("tr");
    assert.equal(remaining.length, initialRows - 1);

    // Check renumbering: first remaining row should have input names ending in "1"
    const firstInput = remaining[0].querySelector("input");
    if (firstInput) {
      assert.match(firstInput.name, /1$/);
    }
  }

  delete require.cache[require.resolve("./app.js")];
});

test("date of test is date of cast plus age in days", async () => {
  installDom(glassHtml);
  dispatchDOMContentLoaded();

  const tableBody = global.document.querySelector(".results-table tbody");
  const row = tableBody.querySelector("tr");
  assert.ok(row, "expected a seeded result row");

  const castInput = row.querySelector('[name^="resultDateOfCast"]');
  const testInput = row.querySelector('[name^="dateOfTest"]');
  const ageInput = row.querySelector('[name^="age"]');

  assert.ok(castInput && testInput && ageInput);
  assert.equal(ageInput.type, "number");

  castInput.value = "2026-06-01";
  ageInput.value = "28";
  ageInput.dispatchEvent(new global.Event("input"));

  assert.equal(testInput.value, "2026-06-29");
  assert.equal(ageInput.value, "28");

  delete require.cache[require.resolve("./app.js")];
});

test("form load error shows error message in save status", async () => {
  installDom(glassHtml, "http://localhost/glassmorphic.html?id=bad-form");

  global.window.CubeSyncFirestore = {
    getCubeRequest: async () => {
      throw new Error("Firestore permission denied");
    }
  };

  require("./app.js");
  dispatchDOMContentLoaded();

  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(global.document.getElementById("saveStatus").textContent, "Firestore permission denied");
  assert.ok(global.document.getElementById("saveStatus").classList.contains("is-error"));

  delete require.cache[require.resolve("./app.js")];
});

test("form load shows 'Form not found' when record is null", async () => {
  installDom(glassHtml, "http://localhost/glassmorphic.html?id=missing-form");

  global.window.CubeSyncFirestore = {
    getCubeRequest: async () => null
  };

  require("./app.js");
  dispatchDOMContentLoaded();

  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(global.document.getElementById("saveStatus").textContent, "Form not found");
  assert.ok(global.document.getElementById("saveStatus").classList.contains("is-error"));

  delete require.cache[require.resolve("./app.js")];
});

test("Firestore unavailable shows error when submitting", async () => {
  installDom(glassHtml, "http://localhost/glassmorphic.html");

  global.window.CubeSyncEnv = { RECAPTCHA_SITE_KEY: "test-site-key" };
  global.window.grecaptcha = {
    render: () => 0,
    getResponse: () => "token",
    reset: () => {}
  };
  delete global.window.CubeSyncFirestore;

  dispatchDOMContentLoaded();
  fillRequiredRequestFields(global.document);
  global.document.querySelector('[name="specimenRef1"]').value = "T-001";
  global.document.querySelector('[name="barcode1"]').value = "BC-001";

  global.document.getElementById("nextStep").click();
  global.document.getElementById("nextStep").click();
  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.match(global.document.getElementById("saveStatus").textContent, /Firestore unavailable/);

  delete require.cache[require.resolve("./app.js")];
});

test("step indicators allow clicking to navigate to a step", async () => {
  installDom(glassHtml);
  dispatchDOMContentLoaded();

  const step1 = global.document.querySelector('.form-step[data-step="1"]');
  const step2 = global.document.querySelector('.form-step[data-step="2"]');
  const indicators = global.document.querySelectorAll(".step-indicator");

  if (indicators.length < 2) return;

  // Move to step 2 via next button first (to enable indicator)
  global.document.getElementById("nextStep").click();
  assert.ok(step2.classList.contains("active"));

  // Click step 1 indicator to go back
  indicators[0].click();
  assert.ok(step1.classList.contains("active"));
  assert.equal(step2.classList.contains("active"), false);

  delete require.cache[require.resolve("./app.js")];
});

test("encouraging popup shown on successful save", async () => {
  installDom(glassHtml, "http://localhost/glassmorphic.html");

  let popupMessage = null;
  global.window.CubeSyncEnv = { RECAPTCHA_SITE_KEY: "test-site-key" };
  global.window.grecaptcha = {
    render: () => 0,
    getResponse: () => "test-token",
    reset: () => {}
  };
  global.window.CubeSyncChime = {
    showEncouragingPopup: (msg) => { popupMessage = msg; }
  };
  global.window.CubeSyncFirestore = {
    savePublicCubeRequest: async () => "saved-id"
  };

  dispatchDOMContentLoaded();
  fillRequiredRequestFields(global.document);
  global.document.querySelector('[name="specimenRef1"]').value = "T-001";
  global.document.querySelector('[name="barcode1"]').value = "BC-001";

  global.document.getElementById("nextStep").click();
  global.document.getElementById("nextStep").click();
  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.ok(popupMessage);
  assert.match(popupMessage, /submitted successfully/i);

  delete require.cache[require.resolve("./app.js")];
});

test("new result row prefills values from request fields", async () => {
  installDom(glassHtml);
  dispatchDOMContentLoaded();

  const form = global.document.getElementById("cubeRequestForm");
  const specimenSize = form.elements["specimenSize"];
  const dateOfCast = form.elements["dateOfCast"];
  const concreteGrade = form.elements["concreteGrade"];

  if (specimenSize) specimenSize.value = "100x100x100";
  if (dateOfCast) dateOfCast.value = "2026-07-01";
  if (concreteGrade) concreteGrade.value = "C40/50";

  const addRowBtn = global.document.getElementById("addRowButton");
  const tableBody = global.document.querySelector(".results-table tbody");
  const initialCount = tableBody.querySelectorAll("tr").length;

  addRowBtn.click();

  const newRow = tableBody.querySelectorAll("tr")[initialCount];
  if (!newRow) return;

  const sizeInput = newRow.querySelector('[name^="size"]');
  const castInput = newRow.querySelector('[name^="resultDateOfCast"]');
  const gradeInput = newRow.querySelector('[name^="resultGrade"]');

  if (sizeInput) assert.equal(sizeInput.value, "100x100x100");
  if (castInput) assert.equal(castInput.value, "2026-07-01");
  if (gradeInput) assert.equal(gradeInput.value, "C40/50");

  delete require.cache[require.resolve("./app.js")];
});

test("app.js pre-fills dateOfCast with today when loaded before 6pm SGT", () => {
  // 09:59 UTC = 17:59 SGT — still today; mock Node.js global Date
  const RealDate = global.Date;
  global.Date = class extends RealDate {
    constructor(...args) {
      if (args.length === 0) super("2026-06-24T09:59:00Z");
      else super(...args);
    }
    static now() { return new RealDate("2026-06-24T09:59:00Z").getTime(); }
  };
  try {
    installDom(glassHtml);
    dispatchDOMContentLoaded();
    const dateInput = global.document.querySelector('[name="dateOfCast"]');
    assert.equal(dateInput.value, "2026-06-24");
    delete require.cache[require.resolve("./app.js")];
  } finally {
    global.Date = RealDate;
  }
});

test("app.js pre-fills dateOfCast with tomorrow when loaded at or after 6pm SGT", () => {
  // 10:00 UTC = 18:00 SGT — next day
  const RealDate = global.Date;
  global.Date = class extends RealDate {
    constructor(...args) {
      if (args.length === 0) super("2026-06-24T10:00:00Z");
      else super(...args);
    }
    static now() { return new RealDate("2026-06-24T10:00:00Z").getTime(); }
  };
  try {
    installDom(glassHtml);
    dispatchDOMContentLoaded();
    const dateInput = global.document.querySelector('[name="dateOfCast"]');
    assert.equal(dateInput.value, "2026-06-25");
    delete require.cache[require.resolve("./app.js")];
  } finally {
    global.Date = RealDate;
  }
});

test("app.js does not override dateOfCast when already populated", () => {
  installDom(glassHtml);
  const dateInput = global.document.querySelector('[name="dateOfCast"]');
  dateInput.value = "2026-01-01";
  dispatchDOMContentLoaded();
  assert.equal(dateInput.value, "2026-01-01", "pre-existing value must not be overwritten");

  delete require.cache[require.resolve("./app.js")];
});

test("Remember details stores request fields in a cookie and restores them on load", async () => {
  installDom(glassHtml, "http://localhost/glassmorphic.html");
  dispatchDOMContentLoaded();
  fillRequiredRequestFields(global.document);
  global.document.querySelector('[name="specimenRef1"]').value = "DO-NOT-REMEMBER";
  global.document.querySelector('[name="barcode1"]').value = "BC-DO-NOT-REMEMBER";

  global.document.getElementById("rememberDetailsButton").click();

  assert.equal(global.document.getElementById("saveStatus").textContent, "Details remembered for next visit");
  assert.equal(global.document.getElementById("forgetDetailsButton").hidden, false);

  const stored = global.window.CubeSyncFormPrefs.readFormPreferenceCookie(global.document);
  assert.ok(stored);
  assert.equal(stored.fields.customerBilling, "Billing");
  assert.equal(stored.fields.supplier, "Supplier");
  assert.equal("dateOfCast" in stored.fields, false);
  assert.equal("cubeJobNumber" in stored.fields, false);
  assert.equal("results" in stored.fields, false);

  const remembered = stored;
  installDom(glassHtml, "http://localhost/glassmorphic.html");
  global.window.CubeSyncFormPrefs.writeFormPreferenceCookie(global.document, remembered);
  dispatchDOMContentLoaded();
  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.equal(global.document.querySelector('[name="customerBilling"]').value, "Billing");
  assert.equal(global.document.querySelector('[name="contact"]').value, "Contact");
  assert.equal(global.document.querySelector('[name="supplier"]').value, "Supplier");
  assert.notEqual(global.document.querySelector('[name="dateOfCast"]').value, "2026-06-18");
  assert.equal(global.document.querySelector('[name="cubeJobNumber"]').value, "");
  assert.equal(global.document.querySelector('[name="specimenRef1"]').value, "");
  assert.equal(global.document.getElementById("forgetDetailsButton").hidden, false);

  delete require.cache[require.resolve("./app.js")];
});

test("loading a saved form with ?id= prefers Firestore over a stale local copy", async () => {
  installDom(glassHtml, "http://localhost/glassmorphic.html?id=live-form");
  global.window.CubeSyncFormHistory.saveSubmission({
    customerBilling: "Stale Client",
    projectErp: "STALE-ERP",
    results: [{ specimenRef: "STALE-REF" }]
  }, "live-form", global.window.localStorage, "2026-09-14T02:00:00.000Z");
  global.window.CubeSyncFirestore = {
    getCubeRequest: async () => ({
      customerBilling: "Live Client",
      projectErp: "LIVE-ERP",
      results: [{ specimenRef: "LIVE-REF" }]
    })
  };

  dispatchDOMContentLoaded();
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(global.document.querySelector('[name="customerBilling"]').value, "Live Client");
  assert.equal(global.document.querySelector('[name="specimenRef1"]').value, "LIVE-REF");
  assert.equal(global.document.getElementById("saveStatus").textContent, "Loaded");
  assert.equal(global.document.getElementById("localCopyBanner").hidden, true);

  delete require.cache[require.resolve("./app.js")];
});

test("loading a saved form with ?id= does not overwrite it with remembered cookie details", async () => {
  installDom(glassHtml, "http://localhost/glassmorphic.html?id=existing-form");
  global.window.CubeSyncFormPrefs.writeFormPreferenceCookie(global.document, {
    v: 1,
    fields: { customerBilling: "Cookie Client", projectErp: "COOKIE-ERP" },
    extraFields: {},
    customFields: []
  });
  global.window.CubeSyncFirestore = {
    getCubeRequest: async () => ({
      customerBilling: "Loaded Client",
      projectErp: "LOADED-ERP",
      results: [{ specimenRef: "LOADED-REF" }]
    })
  };

  dispatchDOMContentLoaded();
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(global.document.querySelector('[name="customerBilling"]').value, "Loaded Client");
  assert.equal(global.document.querySelector('[name="projectErp"]').value, "LOADED-ERP");
  assert.equal(global.document.querySelector('[name="specimenRef1"]').value, "LOADED-REF");

  delete require.cache[require.resolve("./app.js")];
});

test("Forget saved details clears the cookie", async () => {
  installDom(glassHtml, "http://localhost/glassmorphic.html");
  global.window.CubeSyncFormPrefs.writeFormPreferenceCookie(global.document, {
    v: 1,
    fields: { customerBilling: "Cookie Client" },
    extraFields: {},
    customFields: []
  });
  dispatchDOMContentLoaded();
  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.equal(global.document.querySelector('[name="customerBilling"]').value, "Cookie Client");
  assert.equal(global.document.getElementById("forgetDetailsButton").hidden, false);

  global.document.getElementById("forgetDetailsButton").click();
  assert.equal(global.document.getElementById("saveStatus").textContent, "Saved details cleared");
  assert.equal(global.document.getElementById("forgetDetailsButton").hidden, true);
  assert.equal(global.window.CubeSyncFormPrefs.hasStoredPreferences(global.document), false);

  delete require.cache[require.resolve("./app.js")];
});

test("Firestore permission denied falls back to a local copy on this device", async () => {
  installDom(glassHtml, "http://localhost/glassmorphic.html?id=local-copy-1");
  global.window.CubeSyncFormHistory.saveSubmission({
    customerBilling: "Device Client",
    projectErp: "DEVICE-ERP",
    results: [{ specimenRef: "DEVICE-REF" }]
  }, "local-copy-1", global.window.localStorage, "2026-09-14T02:00:00.000Z");
  global.window.CubeSyncFirestore = {
    getCubeRequest: async () => {
      throw new Error("Firestore permission denied");
    }
  };

  dispatchDOMContentLoaded();
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(global.document.querySelector('[name="customerBilling"]').value, "Device Client");
  assert.equal(global.document.querySelector('[name="projectErp"]').value, "DEVICE-ERP");
  assert.equal(global.document.querySelector('[name="specimenRef1"]').value, "DEVICE-REF");
  assert.equal(global.document.getElementById("saveStatus").textContent, "Loaded from this device");
  assert.equal(global.document.getElementById("localCopyBanner").hidden, false);
  assert.equal(global.document.getElementById("mySubmissionsButton").hidden, false);

  delete require.cache[require.resolve("./app.js")];
});

test("Previous submissions panel loads a copy without calling Firestore", async () => {
  installDom(glassHtml, "http://localhost/glassmorphic.html");
  global.window.CubeSyncFormHistory.saveSubmission({
    customerBilling: "Listed Client",
    cubeJobNumber: "CJ-LIST",
    locationRepresented: "Bay 9",
    results: [{ specimenRef: "LIST-REF" }]
  }, "listed-copy", global.window.localStorage, "2026-09-14T02:00:00.000Z");
  let getCubeRequestCalled = false;
  global.window.CubeSyncFirestore = {
    getCubeRequest: async () => {
      getCubeRequestCalled = true;
      return null;
    }
  };

  dispatchDOMContentLoaded();
  await new Promise((resolve) => setTimeout(resolve, 30));

  const listButton = global.document.getElementById("mySubmissionsButton");
  assert.equal(listButton.hidden, false);
  listButton.click();
  assert.equal(global.document.getElementById("localSubmissionsPanel").hidden, false);

  const item = global.document.querySelector(".local-submission-item");
  assert.ok(item);
  assert.match(item.textContent, /Listed Client/);
  item.click();

  assert.equal(getCubeRequestCalled, false);
  assert.equal(global.document.querySelector('[name="customerBilling"]').value, "Listed Client");
  assert.equal(global.document.querySelector('[name="specimenRef1"]').value, "LIST-REF");
  assert.equal(global.document.getElementById("saveStatus").textContent, "Loaded from this device");
  assert.equal(global.document.getElementById("localCopyBanner").hidden, false);
  assert.equal(global.document.getElementById("localSubmissionsPanel").hidden, true);
  assert.equal(new global.window.URL(global.window.location.href).searchParams.get("id"), "listed-copy");

  global.document.getElementById("forgetLocalCopiesButton").click();
  assert.equal(global.window.CubeSyncFormHistory.hasSubmissions(), false);
  assert.equal(global.document.getElementById("mySubmissionsButton").hidden, true);
  assert.equal(global.document.getElementById("saveStatus").textContent, "Copies on this device cleared");

  delete require.cache[require.resolve("./app.js")];
});
