const { JSDOM } = require("jsdom");
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const glassHtml = fs.readFileSync("glassmorphic.html", "utf8");

function fillRequiredRequestFields(document) {
  const values = {
    internalDate: "2026-06-18",
    projectCode: "PRJ-001",
    reportNo: "GLASS-001",
    client: "Glass Client",
    method: "BS EN 12390-3 : 2019",
    project: "Glass Project",
    concreteGrade: "C35/45",
    supplier: "Glass Supplier",
    locationRepresented: "Level 12",
    additionalInformation: "Rush job",
    dateTimeSampled: "2026-06-18T10:30",
    slumpMeasured: "120",
    specimenSize: "150 x 150 x 150",
    slumpSpecified: "100"
  };

  Object.entries(values).forEach(([name, value]) => {
    const control = document.querySelector(`[name="${name}"]`);
    if (control) control.value = value;
  });
}

test("app.js handles multi-step navigation in glassmorphic form", async () => {
  const dom = new JSDOM(glassHtml, { url: "http://localhost/" });
  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.URLSearchParams = dom.window.URLSearchParams;
  global.Event = dom.window.Event;
  global.scrollTo = () => {};
  global.window.scrollTo = () => {};

  // Mock dependencies and assign to window
  global.window.CubeSyncBarcode = require("./barcode.js");
  global.window.CubeSyncFormData = require("./cubesync-form-data.js");
  
  // Load app.js
  require("./app.js");

  // Trigger DOMContentLoaded
  const event = new global.Event("DOMContentLoaded");
  global.window.dispatchEvent(event);

  // Test Multi-step
  const nextBtn = global.document.getElementById("nextStep");
  const step2 = global.document.querySelector('.form-step[data-step="2"]');
  assert.ok(step2, "Step 2 should exist in glassmorphic form");
  assert.ok(!step2.classList.contains("active"));
  
  nextBtn.click();
  assert.ok(step2.classList.contains("active"));

  // Clean up
  delete require.cache[require.resolve("./app.js")];
});

test("glassmorphic final step saves to Firestore instead of printing", async () => {
  const dom = new JSDOM(glassHtml, { url: "http://localhost/glassmorphic.html" });
  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.URLSearchParams = dom.window.URLSearchParams;
  global.Event = dom.window.Event;
  global.scrollTo = () => {};
  global.window.scrollTo = () => {};

  let printCalls = 0;
  let savedPayload = null;
  global.window.print = () => {
    printCalls += 1;
  };
  global.window.CubeSyncEnv = {
    RECAPTCHA_SITE_KEY: "test-site-key"
  };
  global.window.grecaptcha = {
    render: () => 0,
    getResponse: () => "test-recaptcha-token",
    reset: () => {}
  };
  global.window.CubeSyncBarcode = require("./barcode.js");
  global.window.CubeSyncFormData = require("./cubesync-form-data.js");
  let signInCalls = 0;
  global.window.CubeSyncAuth = {
    currentUser: () => null,
    isAllowedUser: () => false,
    signInWithGoogle: async () => {
      signInCalls += 1;
      throw new Error("Customer form submissions must not require sign-in");
    }
  };
  global.window.CubeSyncFirestore = {
    savePublicCubeRequest: async (payload, id, recaptchaToken) => {
      savedPayload = payload;
      assert.equal(id, null);
      assert.equal(recaptchaToken, "test-recaptcha-token");
      return "saved-form-1";
    }
  };

  require("./app.js");

  const event = new global.Event("DOMContentLoaded");
  global.window.dispatchEvent(event);

  fillRequiredRequestFields(global.document);
  global.document.querySelector('[name="testNumber1"]').value = "T-001";
  global.document.querySelector('[name="barcode1"]').value = "BC-GLASS-001";

  const nextBtn = global.document.getElementById("nextStep");
  nextBtn.click();
  nextBtn.click();

  await new Promise(resolve => setTimeout(resolve, 20));

  assert.equal(printCalls, 0);
  assert.equal(savedPayload.reportNo, "GLASS-001");
  assert.equal(savedPayload.client, "Glass Client");
  assert.equal(savedPayload.template, "Glassmorphic");
  assert.equal(savedPayload.results.length, 1);
  assert.equal(savedPayload.results[0].testNumber, "T-001");
  assert.equal(savedPayload.results[0].barcode, "BC-GLASS-001");
  assert.equal(signInCalls, 0);
  assert.equal(global.document.getElementById("saveStatus").textContent, "Saved");
  assert.equal(new global.window.URL(global.window.location.href).searchParams.get("id"), "saved-form-1");

  delete require.cache[require.resolve("./app.js")];
});

test("app.js renders barcodes and handles dynamic rows", async () => {
  const dom = new JSDOM(glassHtml, { url: "http://localhost/" });
  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.URLSearchParams = dom.window.URLSearchParams;
  global.Event = dom.window.Event;
  global.scrollTo = () => {};
  global.window.scrollTo = () => {};

  global.window.CubeSyncBarcode = require("./barcode.js");
  global.window.CubeSyncFormData = require("./cubesync-form-data.js");
  require("./app.js");

  const event = new global.Event("DOMContentLoaded");
  global.window.dispatchEvent(event);

  const input = global.document.querySelector("[data-barcode-input]");
  input.value = "CUBE-101";
  input.dispatchEvent(new global.Event("input"));

  const cell = input.closest(".barcode-cell");
  const preview = cell.querySelector(".barcode-preview");
  assert.match(preview.innerHTML, /<svg/);

  // Test Dynamic Rows
  const addRowBtn = global.document.getElementById("addRowButton");
  const tableBody = global.document.querySelector(".results-table tbody");
  const initialRows = tableBody.querySelectorAll("tr").length;
  
  addRowBtn.click();
  assert.equal(tableBody.querySelectorAll("tr").length, initialRows + 1);

  delete require.cache[require.resolve("./app.js")];
});
