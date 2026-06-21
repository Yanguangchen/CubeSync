const { JSDOM } = require("jsdom");
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const glassHtml = fs.readFileSync("glassmorphic.html", "utf8");
const indexHtml = fs.readFileSync("index.html", "utf8");

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
      // Create-only: the form never sends a document id (the API rejects one).
      assert.equal(id, undefined);
      assert.equal(recaptchaToken, "test-recaptcha-token");
      return "saved-form-1";
    }
  };

  dispatchDOMContentLoaded();
  fillRequiredRequestFields(global.document);
  global.document.querySelector('[name="specimenRef1"]').value = "T-001";
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
  assert.equal(savedPayload.results[0].specimenRef, "T-001");
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

  assert.ok(fetchCalledWith.includes(encodeURI("dropdown-options/project erp.txt")));
  assert.ok(fetchCalledWith.includes(encodeURI("dropdown-options/customer billing.txt")));

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

test("app.js stores typed dropdown fields as free text even when the value matches an option", async () => {
  installDom(glassHtml, "http://localhost/glassmorphic.html");

  global.window.fetch = async () => ({
    ok: true,
    text: async () => "Option A\nOption B"
  });
  global.window.CubeSyncEnv = { RECAPTCHA_SITE_KEY: "test-site-key" };
  global.window.grecaptcha = {
    render: () => 0,
    getResponse: () => "test-recaptcha-token",
    reset: () => {}
  };

  let savedPayload = null;
  global.window.CubeSyncFirestore = {
    getFormFieldConfig: async () => null,
    savePublicCubeRequest: async (payload) => {
      savedPayload = payload;
      return "saved-free-text";
    }
  };

  dispatchDOMContentLoaded();
  await new Promise((resolve) => setTimeout(resolve, 50));

  fillRequiredRequestFields(global.document);

  const typedExactOption = global.document.querySelector('[name="projectErp"]');
  typedExactOption.value = "Option A";
  typedExactOption.dispatchEvent(new global.Event("input", { bubbles: true }));

  const selectedOption = global.document.querySelector('[name="customerBilling"]');
  selectedOption.value = "Option";
  selectedOption.dispatchEvent(new global.Event("input", { bubbles: true }));
  selectedOption
    .parentElement
    .querySelector(".erp-dropdown-item")
    .dispatchEvent(new global.window.MouseEvent("mousedown", { bubbles: true, cancelable: true }));

  const typedCustomOption = global.document.querySelector('[name="supplier"]');
  typedCustomOption.value = "Typed Supplier";
  typedCustomOption.dispatchEvent(new global.Event("input", { bubbles: true }));

  global.document.querySelector('[name="specimenRef1"]').value = "T-003";
  global.document.querySelector('[name="barcode1"]').value = "BC-003";

  global.document.getElementById("nextStep").click();
  global.document.getElementById("nextStep").click();
  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.deepEqual(savedPayload.customFields, ["projectErp", "supplier"]);
  assert.equal(savedPayload.customerBilling, "Option A");

  delete require.cache[require.resolve("./app.js")];
});

test("app.js applies cached field config and skips disabled required fields", async () => {
  installDom(glassHtml, "http://localhost/glassmorphic.html");

  global.window.CubeSyncEnv = { RECAPTCHA_SITE_KEY: "test-site-key" };
  global.window.grecaptcha = {
    render: () => 0,
    getResponse: () => "test-recaptcha-token",
    reset: () => {}
  };

  const disabledConfig = global.window.CubeSyncFormData.normalizeFormFieldConfig({
    requestFields: {
      customerBilling: false,
      reportGrade: false
    }
  });
  global.localStorage.setItem(
    global.window.CubeSyncFormData.FORM_FIELD_CONFIG_STORAGE_KEY,
    JSON.stringify(disabledConfig)
  );

  let savedPayload = null;
  global.window.CubeSyncFirestore = {
    getFormFieldConfig: async () => null,
    savePublicCubeRequest: async (payload) => {
      savedPayload = payload;
      return "saved-with-config";
    }
  };

  dispatchDOMContentLoaded();
  await new Promise((resolve) => setTimeout(resolve, 30));

  const billingRow = global.document.querySelector('[name="customerBilling"]').closest(".field-row");
  assert.equal(billingRow.hidden, true);

  fillRequiredRequestFields(global.document);
  global.document.querySelector('[name="customerBilling"]').value = "";
  global.document.querySelector('[name="reportGrade"]').value = "";
  global.document.querySelector('[name="specimenRef1"]').value = "T-002";
  global.document.querySelector('[name="barcode1"]').value = "BC-002";

  global.document.getElementById("nextStep").click();
  global.document.getElementById("nextStep").click();
  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.equal(savedPayload.customerBilling, "");
  assert.equal(savedPayload.reportGrade, "");
  assert.equal(global.document.getElementById("saveStatus").textContent, "Saved");

  delete require.cache[require.resolve("./app.js")];
});

test("app.js uses custom validation instead of native hidden-step dateOfCast errors", async () => {
  installDom(glassHtml, "http://localhost/glassmorphic.html");

  global.window.CubeSyncEnv = { RECAPTCHA_SITE_KEY: "test-site-key" };
  global.window.grecaptcha = {
    render: () => 0,
    getResponse: () => "test-recaptcha-token",
    reset: () => {}
  };
  global.window.CubeSyncFirestore = {
    getFormFieldConfig: async () => null,
    savePublicCubeRequest: async () => {
      throw new Error("Should not save when request details are incomplete");
    }
  };

  dispatchDOMContentLoaded();
  await new Promise((resolve) => setTimeout(resolve, 40));

  const form = global.document.getElementById("cubeRequestForm");
  assert.ok(form.hasAttribute("novalidate"));

  global.document.getElementById("nextStep").click();
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.ok(global.document.querySelector('.form-step[data-step="2"]').classList.contains("active"));
  assert.equal(form.elements.dateOfCast.hasAttribute("required"), false);

  let submitEventFired = false;
  form.addEventListener("submit", () => {
    submitEventFired = true;
  });

  global.document.getElementById("saveFormButton").click();
  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.equal(submitEventFired, true);
  assert.match(global.document.getElementById("saveStatus").textContent, /Date of cast/i);
  assert.ok(global.document.querySelector('.form-step[data-step="1"]').classList.contains("active"));

  delete require.cache[require.resolve("./app.js")];
});

test("app.js initializes correctly on index.html", async () => {
  installDom(indexHtml, "http://localhost/index.html");
  require("./app.js");
  dispatchDOMContentLoaded();

  assert.ok(global.document.getElementById("cubeRequestForm"));
  
  delete require.cache[require.resolve("./app.js")];
});

test("app.js loads existing form from ?id= param", async () => {
  installDom(glassHtml, "http://localhost/glassmorphic.html?id=test-form-123");
  
  let getCubeRequestCalled = false;
  global.window.CubeSyncFirestore = {
    getCubeRequest: async (id) => {
      getCubeRequestCalled = true;
      assert.equal(id, "test-form-123");
      return {
        projectErp: "Loaded ERP",
        results: [{
          setNo: 1,
          size: "150x150x150",
          specimenRef: "REF-LOADED",
          barcode: "BC-LOADED"
        }]
      };
    }
  };

  require("./app.js");
  dispatchDOMContentLoaded();
  
  await new Promise(resolve => setTimeout(resolve, 50));
  
  assert.equal(getCubeRequestCalled, true);
  assert.equal(global.document.querySelector('[name="projectErp"]').value, "Loaded ERP");
  assert.equal(global.document.querySelector('[name="specimenRef1"]').value, "REF-LOADED");
  assert.equal(global.document.querySelector('[name="barcode1"]').value, "BC-LOADED");
  assert.equal(global.document.getElementById("saveStatus").textContent, "Loaded");

  delete require.cache[require.resolve("./app.js")];
});

test("print action triggered by print button", async () => {
  installDom(glassHtml);
  
  let printCalls = 0;
  global.window.print = () => {
    printCalls += 1;
  };
  
  require("./app.js");
  dispatchDOMContentLoaded();
  
  const printBtn = global.document.getElementById("printButton");
  assert.ok(printBtn);
  printBtn.click();
  
  assert.equal(printCalls, 1);

  delete require.cache[require.resolve("./app.js")];
});

test("form reset clears barcodes and save status", async () => {
  installDom(glassHtml);
  require("./app.js");
  dispatchDOMContentLoaded();
  
  const form = global.document.getElementById("cubeRequestForm");
  const saveStatus = global.document.getElementById("saveStatus");
  const barcodeInput = global.document.querySelector('[name="barcode1"]');
  
  barcodeInput.value = "TEST-BC";
  barcodeInput.dispatchEvent(new global.Event("input"));
  
  assert.ok(barcodeInput.closest(".barcode-cell").classList.contains("has-barcode"));
  saveStatus.textContent = "Saved";
  saveStatus.classList.add("is-error");
  
  form.reset();
  barcodeInput.value = "";
  
  await new Promise(resolve => setTimeout(resolve, 10));
  
  assert.equal(barcodeInput.closest(".barcode-cell").classList.contains("has-barcode"), false);
  assert.equal(saveStatus.textContent, "");
  assert.equal(saveStatus.classList.contains("is-error"), false);

  delete require.cache[require.resolve("./app.js")];
});
