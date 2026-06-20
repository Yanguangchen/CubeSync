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

  await new Promise((resolve) => setTimeout(resolve, 700));

  assert.ok(printCalls >= 1, `expected window.print to be called, got ${printCalls} calls`);
  assert.equal(global.document.querySelector('[name="projectErp"]').value, "Print ERP");

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

test("date-based age computation calculates days between cast and test dates", async () => {
  installDom(glassHtml);
  dispatchDOMContentLoaded();

  const tableBody = global.document.querySelector(".results-table tbody");
  const row = tableBody.querySelector("tr");
  if (!row) return;

  const castInput = row.querySelector('[name^="resultDateOfCast"]');
  const testInput = row.querySelector('[name^="dateOfTest"]');
  const ageInput = row.querySelector('[name^="age"]');

  if (!castInput || !testInput || !ageInput) return;

  castInput.value = "2026-06-01";
  testInput.value = "2026-06-29";
  testInput.dispatchEvent(new global.Event("change"));

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
