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
  global.window.CubeSyncFormData = require("./cubesync-form-data.js");

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
    customerBilling: "Glass Billing",
    projectNameOnReport: "Glass Project",
    clientNameOnReport: "Glass Client",
    contact: "Glass Contact",
    cubeJobNumber: "GLASS-001",
    testItem: "BS EN 12390-3 : 2019",
    concreteGrade: "C35/45",
    reportGrade: "C35/45",
    supplier: "Glass Supplier",
    supplierDisplay: "Glass Supplier Display",
    locationRepresented: "Level 12",
    additionalInformation: "Rush job",
    dateOfCast: "2026-06-18",
    slumpMeasured: "120",
    specimenSize: "150 x 150 x 150",
    slumpSpecified: "100",
    personInCharge: "Glass PIC",
    managerInCharge: "Glass Manager"
  };

  Object.entries(values).forEach(([name, value]) => {
    const control = document.querySelector(`[name="${name}"]`);
    if (control) control.value = value;
  });
}

test("app.js handles multi-step navigation in glassmorphic form", async () => {
  installDom(glassHtml);
  dispatchDOMContentLoaded();

  const nextBtn = global.document.getElementById("nextStep");
  const step2 = global.document.querySelector('.form-step[data-step="2"]');
  assert.ok(step2, "Step 2 should exist in glassmorphic form");
  assert.ok(!step2.classList.contains("active"));

  nextBtn.click();
  assert.ok(step2.classList.contains("active"));

  delete require.cache[require.resolve("./app.js")];
});

test("glassmorphic final step saves to Firestore instead of printing", async () => {
  installDom(glassHtml, "http://localhost/glassmorphic.html");

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

  dispatchDOMContentLoaded();
  fillRequiredRequestFields(global.document);
  global.document.querySelector('[name="testNumber1"]').value = "T-001";
  global.document.querySelector('[name="barcode1"]').value = "BC-GLASS-001";

  const nextBtn = global.document.getElementById("nextStep");
  nextBtn.click();
  nextBtn.click();

  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(printCalls, 0);
  assert.equal(savedPayload.reportNo, "GLASS-001");
  assert.equal(savedPayload.customerBilling, "Glass Billing");
  assert.equal(savedPayload.client, "Glass Billing");
  assert.equal(savedPayload.cubeJobNumber, "GLASS-001");
  assert.equal(savedPayload.projectNameOnReport, "Glass Project");
  assert.equal(savedPayload.dateOfCast, "2026-06-18");
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
  installDom(glassHtml);
  dispatchDOMContentLoaded();

  const input = global.document.querySelector("[data-barcode-input]");
  input.value = "CUBE-101";
  input.dispatchEvent(new global.Event("input"));

  const cell = input.closest(".barcode-cell");
  const preview = cell.querySelector(".barcode-preview");
  assert.match(preview.innerHTML, /<svg/);

  const addRowBtn = global.document.getElementById("addRowButton");
  const tableBody = global.document.querySelector(".results-table tbody");
  const initialRows = tableBody.querySelectorAll("tr").length;

  addRowBtn.click();
  assert.equal(tableBody.querySelectorAll("tr").length, initialRows + 1);

  delete require.cache[require.resolve("./app.js")];
});

test("app.js loads autocomplete options for ERP and billing fields", async () => {
  const fetchCalledWith = [];
  installDom(glassHtml);
  global.window.fetch = async (url) => {
    fetchCalledWith.push(url);
    return {
      ok: true,
      text: async () => "Option A\nOption B \n\n Option C"
    };
  };
  dispatchDOMContentLoaded();

  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.ok(fetchCalledWith.includes("project erp.txt"));
  assert.ok(fetchCalledWith.includes("customer billing.txt"));

  ["projectErp", "customerBilling"].forEach((inputName) => {
    const inputs = global.document.querySelectorAll(`input[name="${inputName}"]`);
    assert.ok(inputs.length > 0, `should find ${inputName} inputs`);

    inputs.forEach((input) => {
      assert.equal(input.getAttribute("autocomplete"), "off");
      assert.equal(input.getAttribute("list"), null);

      const wrapper = input.parentElement;
      assert.ok(wrapper.classList.contains("erp-autocomplete-wrapper"), "input should be wrapped");

      const dropdown = wrapper.querySelector(".erp-dropdown");
      assert.ok(dropdown, "dropdown should be created");

      input.dispatchEvent(new global.Event("focus"));

      const options = Array.from(dropdown.querySelectorAll("li.erp-dropdown-item"));
      assert.equal(options.length, 3, "should render 3 non-empty options");
      assert.match(options[0].textContent, /Option A/);
      assert.match(options[1].textContent, /Option B/);
      assert.match(options[2].textContent, /Option C/);
    });
  });

  delete require.cache[require.resolve("./app.js")];
});
