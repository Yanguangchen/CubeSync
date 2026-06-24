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

test("renderBarcode shows an error when the barcode text is invalid", () => {
  installDom(glassHtml, "http://localhost/glassmorphic.html");
  dispatchDOMContentLoaded();

  const barcodeInput = global.document.querySelector("[data-barcode-input]");
  assert.ok(barcodeInput, "expected a seeded barcode input");

  // "é" is outside Code 128-B printable ASCII, so renderBarcodeSvg throws and
  // app.js renderBarcode hits its catch block.
  barcodeInput.value = "abcé";
  barcodeInput.dispatchEvent(new global.Event("input", { bubbles: true }));

  const cell = barcodeInput.closest(".barcode-cell");
  assert.ok(cell.classList.contains("has-error"));
  assert.equal(barcodeInput.getAttribute("aria-invalid"), "true");
  assert.match(cell.querySelector(".barcode-preview").innerHTML, /barcode-error/);

  delete require.cache[require.resolve("./app.js")];
});

test("Previous on step 1 is a no-op, but goes back from step 2", () => {
  installDom(glassHtml, "http://localhost/glassmorphic.html");
  dispatchDOMContentLoaded();

  const step1 = global.document.querySelector('.form-step[data-step="1"]');
  const step2 = global.document.querySelector('.form-step[data-step="2"]');
  const prevBtn = global.document.getElementById("prevStep");

  // On step 1, Previous does nothing (the guard's false branch).
  prevBtn.click();
  assert.ok(step1.classList.contains("active"));
  assert.ok(!step2.classList.contains("active"));

  // Advance to step 2, then Previous walks back to step 1 (the true branch).
  global.document.getElementById("nextStep").click();
  assert.ok(step2.classList.contains("active"));
  prevBtn.click();
  assert.ok(step1.classList.contains("active"));
  assert.ok(!step2.classList.contains("active"));

  delete require.cache[require.resolve("./app.js")];
});

test("applyManualCubeJobState keeps Cube Job # disabled when config disables it", () => {
  installDom(glassHtml, "http://localhost/glassmorphic.html");
  dispatchDOMContentLoaded();

  const toggle = global.document.querySelector('[name="enableManualCubeJobNumber"]');
  const cubeJobInput = global.document.querySelector('[name="cubeJobNumber"]');
  assert.ok(toggle && cubeJobInput);

  // Simulate the form-field config having disabled this field.
  cubeJobInput.dataset.configDisabled = "true";
  toggle.checked = true; // even when "manual" is on, config-disabled wins
  toggle.dispatchEvent(new global.Event("change", { bubbles: true }));

  assert.equal(cubeJobInput.disabled, true);
  assert.ok(cubeJobInput.classList.contains("is-disabled"));

  delete require.cache[require.resolve("./app.js")];
});

test("submitForm falls back to dispatchEvent when requestSubmit is unavailable", async () => {
  installDom(glassHtml, "http://localhost/glassmorphic.html");

  global.window.CubeSyncEnv = { RECAPTCHA_SITE_KEY: "test-site-key" };
  global.window.grecaptcha = {
    render: () => 0,
    getResponse: () => "test-token",
    reset: () => {}
  };

  let saveCalls = 0;
  global.window.CubeSyncFirestore = {
    savePublicCubeRequest: async () => {
      saveCalls += 1;
      return "doc-1";
    }
  };

  dispatchDOMContentLoaded();

  // Force the dispatchEvent branch: browsers without requestSubmit (and the
  // defensive fallback) must still submit the form.
  const form = global.document.getElementById("cubeRequestForm");
  form.requestSubmit = undefined;

  fillRequiredRequestFields(global.document);
  global.document.querySelector('[name="specimenRef1"]').value = "T-001";
  global.document.querySelector('[name="barcode1"]').value = "BC-001";

  global.document.getElementById("nextStep").click(); // step 1 -> 2
  global.document.getElementById("nextStep").click(); // final -> submitForm
  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.equal(saveCalls, 1);
  assert.equal(global.document.getElementById("saveStatus").textContent, "Saved");

  delete require.cache[require.resolve("./app.js")];
});
