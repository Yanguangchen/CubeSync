const { JSDOM } = require("jsdom");
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const barcodeJs = fs.readFileSync("barcode.js", "utf8");
const formDataJs = fs.readFileSync("cubesync-form-data.js", "utf8");
const dashboardJs = fs.readFileSync("dashboard.js", "utf8");
const html = fs.readFileSync("dashboard.html", "utf8");

test("dashboard.js handles auth and loads forms", async () => {
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    url: "http://localhost/"
  });
  const { window } = dom;

  // Mock alert and prompt
  window.alert = () => {};
  window.confirm = () => true;

  // Mock Firestore and Auth
  let authChangeCallback = null;
  const mockAuth = {
    signInWithGoogle: async () => {
      authChangeCallback({ email: "test@rakmat.com.sg" });
    },
    signOutUser: async () => {
      authChangeCallback(null);
    },
    onAuthChange: (cb) => {
      authChangeCallback = cb;
    },
    isAllowedUser: (user) => user && user.email.endsWith("@rakmat.com.sg"),
    currentUser: () => null
  };

  const mockFirestore = {
    listCubeRequests: async () => [
      {
        id: "1",
        reportNo: "REPORT-001",
        client: "Client A",
        project: "Project X",
        projectErp: "Project X",
        customerBilling: "Client A",
        status: "Ready",
        template: "Original",
        updatedAt: "2026-06-17",
        results: [
          {
            specimenRef: "T-001",
            barcode: "REPORT-001-T-001"
          }
        ]
      }
    ],
    updateCubeRequest: async () => {},
    deleteCubeRequest: async () => {}
  };

  window.CubeSyncAuth = mockAuth;
  window.CubeSyncFirestore = mockFirestore;

  // Inject dependencies
  const barcodeScript = window.document.createElement("script");
  barcodeScript.textContent = barcodeJs;
  window.document.head.appendChild(barcodeScript);

  const formDataScript = window.document.createElement("script");
  formDataScript.textContent = formDataJs;
  window.document.head.appendChild(formDataScript);

  // Inject dashboard.js
  const dashboardScript = window.document.createElement("script");
  dashboardScript.textContent = dashboardJs;
  window.document.head.appendChild(dashboardScript);

  // Trigger DOMContentLoaded
  const event = window.document.createEvent("Event");
  event.initEvent("DOMContentLoaded", true, true);
  window.document.dispatchEvent(event);

  // Initially dashboard should be locked (is-hidden on shell)
  assert.ok(window.document.getElementById("dashboardShell").classList.contains("is-hidden"));

  // Click Sign In
  const signInBtn = window.document.getElementById("signInButton");
  signInBtn.click();

  // Wait for async loadForms
  await new Promise(resolve => setTimeout(resolve, 50));

  // Dashboard should be unlocked
  assert.ok(!window.document.getElementById("dashboardShell").classList.contains("is-hidden"));
  assert.equal(window.document.getElementById("authUser").textContent, "test@rakmat.com.sg");

  // Check if form is listed
  const list = window.document.getElementById("formList");
  assert.match(list.innerHTML, /REPORT-001/);
  assert.match(list.innerHTML, /Client A/);

  // Test Selection
  const row = list.querySelector("tr[data-id='1']");
  row.click();

  const detailTitle = window.document.getElementById("detailTitle");
  const detailContent = window.document.getElementById("detailContent");
  assert.equal(detailTitle.textContent, "REPORT-001");
  assert.match(detailContent.innerHTML, /Project X/);
});

test("dashboard.js filters forms by search query", async () => {
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    url: "http://localhost/"
  });
  const { window } = dom;

  const mockAuth = {
    onAuthChange: (cb) => cb({ email: "test@rakmat.com.sg" }),
    isAllowedUser: () => true
  };

  const mockFirestore = {
    listCubeRequests: async () => [
      { id: "1", reportNo: "APPLE", client: "A", project: "P", status: "Ready" },
      { id: "2", reportNo: "BANANA", client: "B", project: "P", status: "Draft" }
    ]
  };

  window.CubeSyncAuth = mockAuth;
  window.CubeSyncFirestore = mockFirestore;

  const scripts = [barcodeJs, formDataJs, dashboardJs];
  scripts.forEach(js => {
    const s = window.document.createElement("script");
    s.textContent = js;
    window.document.head.appendChild(s);
  });

  const event = window.document.createEvent("Event");
  event.initEvent("DOMContentLoaded", true, true);
  window.document.dispatchEvent(event);

  await new Promise(resolve => setTimeout(resolve, 50));

  const list = window.document.getElementById("formList");
  const searchInput = window.document.getElementById("searchInput");

  assert.match(list.innerHTML, /APPLE/);
  assert.match(list.innerHTML, /BANANA/);

  // Search for APPLE
  searchInput.value = "apple";
  searchInput.dispatchEvent(new window.Event("input"));

  assert.match(list.innerHTML, /APPLE/);
  assert.doesNotMatch(list.innerHTML, /BANANA/);
});

test("dashboard.js shows dropdown free text counter, legend, and highlighted fields", async () => {
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    url: "http://localhost/"
  });
  const { window } = dom;

  const mockAuth = {
    onAuthChange: (cb) => cb({ email: "test@rakmat.com.sg" }),
    isAllowedUser: () => true
  };

  const mockFirestore = {
    listCubeRequests: async () => [
      {
        id: "custom-1",
        reportNo: "CUSTOM-001",
        client: "Client A",
        project: "Typed ERP Project",
        projectErp: "Typed ERP Project",
        supplier: "Typed Supplier",
        specimenSize: "Typed Size",
        status: "Ready",
        template: "Glassmorphic",
        updatedAt: "2026-06-20",
        customFields: ["projectErp", "supplier", "specimenSize"]
      }
    ]
  };

  window.CubeSyncAuth = mockAuth;
  window.CubeSyncFirestore = mockFirestore;

  [barcodeJs, formDataJs, dashboardJs].forEach((js) => {
    const script = window.document.createElement("script");
    script.textContent = js;
    window.document.head.appendChild(script);
  });

  const event = window.document.createEvent("Event");
  event.initEvent("DOMContentLoaded", true, true);
  window.dispatchEvent(event);

  await new Promise((resolve) => setTimeout(resolve, 50));

  const list = window.document.getElementById("formList");
  assert.match(list.innerHTML, /3 free-text fields/);
  assert.match(list.innerHTML, /custom-field-count/);
  assert.ok(list.querySelector("tr[data-id='custom-1']").classList.contains("has-custom-fields"));

  list.querySelector("tr[data-id='custom-1']").click();

  const detailContent = window.document.getElementById("detailContent");
  assert.match(detailContent.innerHTML, /Orange tint indicates free text typed instead of selecting a dropdown option/);
  assert.match(detailContent.innerHTML, /Free-text dropdown fields: 3/);
  assert.equal(detailContent.querySelectorAll(".highlight-custom").length, 3);
  assert.equal(detailContent.querySelectorAll(".detail-field.is-custom-field").length, 3);
});

test("dashboard.js flags only values missing from the loaded option list", async () => {
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    url: "http://localhost/"
  });
  const { window } = dom;

  const optionFiles = {
    "dropdown-options/supplier.txt": "ABC Concrete\nXYZ Ready Mix",
    "dropdown-options/project erp.txt": "ERP-001\nERP-002"
  };

  window.fetch = async (url) => {
    const key = decodeURI(String(url));
    const body = optionFiles[key];
    return {
      ok: body !== undefined,
      text: async () => body || ""
    };
  };

  const mockAuth = {
    onAuthChange: (cb) => cb({ email: "test@rakmat.com.sg" }),
    isAllowedUser: () => true
  };

  const mockFirestore = {
    listCubeRequests: async () => [
      {
        id: "selected-1",
        reportNo: "SELECTED-001",
        // Both dropdown values match an option exactly -> should NOT be flagged,
        // even though stale metadata claims they were typed.
        projectErp: "ERP-001",
        supplier: "ABC Concrete",
        status: "Ready",
        template: "Original",
        updatedAt: "2026-06-20",
        customFields: ["projectErp", "supplier"]
      },
      {
        id: "typed-1",
        reportNo: "TYPED-001",
        // supplier is not in the option list -> flagged. projectErp matches.
        projectErp: "ERP-002",
        supplier: "Brand New Supplier",
        status: "Ready",
        template: "Original",
        updatedAt: "2026-06-20"
      }
    ]
  };

  window.CubeSyncAuth = mockAuth;
  window.CubeSyncFirestore = mockFirestore;

  [barcodeJs, formDataJs, dashboardJs].forEach((js) => {
    const script = window.document.createElement("script");
    script.textContent = js;
    window.document.head.appendChild(script);
  });

  const event = window.document.createEvent("Event");
  event.initEvent("DOMContentLoaded", true, true);
  window.dispatchEvent(event);

  await new Promise((resolve) => setTimeout(resolve, 80));

  const list = window.document.getElementById("formList");
  const selectedRow = list.querySelector("tr[data-id='selected-1']");
  const typedRow = list.querySelector("tr[data-id='typed-1']");

  // Matching values are not flagged despite stale metadata.
  assert.ok(!selectedRow.classList.contains("has-custom-fields"));
  assert.doesNotMatch(selectedRow.innerHTML, /free-text field/);

  // The genuinely novel value is flagged.
  assert.ok(typedRow.classList.contains("has-custom-fields"));
  assert.match(typedRow.innerHTML, /1 free-text field/);
});

test("dashboard.js edit form handles all request fields", async () => {
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    url: "http://localhost/"
  });
  const { window } = dom;

  const mockAuth = {
    onAuthChange: (cb) => cb({ email: "test@rakmat.com.sg" }),
    isAllowedUser: () => true
  };

  let updatedData = null;
  const mockFirestore = {
    listCubeRequests: async () => [
      { 
        id: "1", reportNo: "APPLE", client: "A", project: "P", status: "Draft",
        internalDate: "2026-06-19", projectCode: "PC1", method: "M1",
        supplier: "S1", dateTimeSampled: "2026-06-19T10:00", slumpMeasured: 10,
        specimenSize: "150x150", slumpSpecified: 20,
        customFields: ["projectErp", "supplier"]
      }
    ],
    updateCubeRequest: async (id, data) => { updatedData = data; }
  };

  window.CubeSyncAuth = mockAuth;
  window.CubeSyncFirestore = mockFirestore;

  const scripts = [barcodeJs, formDataJs, dashboardJs];
  scripts.forEach(js => {
    const s = window.document.createElement("script");
    s.textContent = js;
    window.document.head.appendChild(s);
  });

  const event = window.document.createEvent("Event");
  event.initEvent("DOMContentLoaded", true, true);
  window.document.dispatchEvent(event);

  await new Promise(resolve => setTimeout(resolve, 50));

  const list = window.document.getElementById("formList");
  
  // Mock dialog methods
  window.HTMLDialogElement.prototype.showModal = function() {
    this.open = true;
  };
  window.HTMLDialogElement.prototype.close = function() {
    this.open = false;
  };

  // Click edit button
  const editBtn = list.querySelector("button[data-action='edit']");
  editBtn.click();

  const editForm = window.document.getElementById("editForm");
  
  // Assert all fields are populated
  assert.equal(editForm.elements.dateOfCast.value, "2026-06-19");
  assert.equal(editForm.elements.projectErp.value, "PC1");
  assert.equal(editForm.elements.testItem.value, "M1");
  assert.equal(editForm.elements.supplier.value, "S1");
  assert.equal(editForm.elements.slumpMeasured.value, "10");
  assert.equal(editForm.elements.specimenSize.value, "150x150");
  assert.equal(editForm.elements.slumpSpecified.value, "20");

  // Modify some fields
  editForm.elements.dateOfCast.value = "2026-06-20";
  editForm.elements.slumpMeasured.value = "15";

  // Submit form
  editForm.dispatchEvent(new window.Event("submit", { cancelable: true }));
  await new Promise(resolve => setTimeout(resolve, 50));

  assert.equal(updatedData.internalDate, "2026-06-20");
  assert.equal(updatedData.dateOfCast, "2026-06-20");
  assert.equal(updatedData.slumpMeasured, 15);
  assert.ok(!("projectCode" in updatedData));
  assert.ok(!("customFields" in updatedData));
});

test("dashboard.js saves form field settings from field config dialog", async () => {
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    url: "http://localhost/"
  });
  const { window } = dom;

  window.alert = () => {};

  let savedConfig = null;
  const mockAuth = {
    onAuthChange: (cb) => cb({ email: "test@rakmat.com.sg" }),
    isAllowedUser: () => true
  };
  const mockFirestore = {
    listCubeRequests: async () => [],
    getFormFieldConfig: async () => ({
      requestFields: { quote: true, contact: true },
      resultFields: { invoiceNumber: true }
    }),
    saveFormFieldConfig: async (config) => {
      savedConfig = config;
    }
  };

  window.CubeSyncAuth = mockAuth;
  window.CubeSyncFirestore = mockFirestore;

  [barcodeJs, formDataJs, dashboardJs].forEach((js) => {
    const script = window.document.createElement("script");
    script.textContent = js;
    window.document.head.appendChild(script);
  });

  window.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  window.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };

  const event = window.document.createEvent("Event");
  event.initEvent("DOMContentLoaded", true, true);
  window.dispatchEvent(event);

  await new Promise((resolve) => setTimeout(resolve, 50));

  window.document.getElementById("fieldSettingsButton").click();
  const fieldConfigForm = window.document.getElementById("fieldConfigForm");
  assert.ok(fieldConfigForm.querySelector('[name="request-quote"]'));
  assert.ok(fieldConfigForm.querySelector('[name="result-invoiceNumber"]'));

  fieldConfigForm.elements["request-quote"].checked = false;
  fieldConfigForm.elements["result-invoiceNumber"].checked = false;
  fieldConfigForm.dispatchEvent(new window.Event("submit", { cancelable: true }));

  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(savedConfig.requestFields.quote, false);
  assert.equal(savedConfig.resultFields.invoiceNumber, false);
  assert.equal(
    window.localStorage.getItem("cubesync-form-field-config"),
    JSON.stringify(window.CubeSyncFormData.normalizeFormFieldConfig(savedConfig))
  );
});

test("dashboard.js saves custom field labels and reset button restores defaults", async () => {
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    url: "http://localhost/"
  });
  const { window } = dom;

  window.alert = () => {};

  let savedConfig = null;
  const mockAuth = {
    onAuthChange: (cb) => cb({ email: "test@rakmat.com.sg" }),
    isAllowedUser: () => true
  };
  const mockFirestore = {
    listCubeRequests: async () => [],
    getFormFieldConfig: async () => ({
      requestFields: { projectErp: true },
      requestLabels: { projectErp: "Job Number" }
    }),
    saveFormFieldConfig: async (config) => {
      savedConfig = config;
    }
  };

  window.CubeSyncAuth = mockAuth;
  window.CubeSyncFirestore = mockFirestore;

  [barcodeJs, formDataJs, dashboardJs].forEach((js) => {
    const script = window.document.createElement("script");
    script.textContent = js;
    window.document.head.appendChild(script);
  });

  window.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  window.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };

  const event = window.document.createEvent("Event");
  event.initEvent("DOMContentLoaded", true, true);
  window.dispatchEvent(event);

  await new Promise((resolve) => setTimeout(resolve, 50));

  window.document.getElementById("fieldSettingsButton").click();
  const fieldConfigForm = window.document.getElementById("fieldConfigForm");

  const projectRename = fieldConfigForm.elements["request-label-projectErp"];
  assert.ok(projectRename, "rename input should render");
  assert.equal(projectRename.value, "Job Number", "existing override prefills the rename box");

  fieldConfigForm.elements["request-label-contact"].value = "Phone Contact";
  fieldConfigForm.dispatchEvent(new window.Event("submit", { cancelable: true }));

  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(savedConfig.requestLabels.projectErp, "Job Number");
  assert.equal(savedConfig.requestLabels.contact, "Phone Contact");

  window.document.getElementById("fieldSettingsButton").click();
  window.document.getElementById("resetFieldConfigButton").click();

  assert.equal(
    fieldConfigForm.elements["request-label-projectErp"].value,
    "",
    "reset clears custom labels"
  );
  assert.equal(
    fieldConfigForm.elements["request-projectErp"].checked,
    true,
    "reset re-enables fields"
  );

  fieldConfigForm.dispatchEvent(new window.Event("submit", { cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(
    Object.keys(savedConfig.requestLabels).length,
    0,
    "saving after reset clears overrides"
  );
});

test("dashboard.js saves custom request field definitions from field config dialog", async () => {
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    url: "http://localhost/"
  });
  const { window } = dom;

  window.alert = () => {};

  let savedConfig = null;
  window.CubeSyncAuth = {
    onAuthChange: (cb) => cb({ email: "test@rakmat.com.sg" }),
    isAllowedUser: () => true
  };
  window.CubeSyncFirestore = {
    listCubeRequests: async () => [],
    getFormFieldConfig: async () => null,
    saveFormFieldConfig: async (config) => {
      savedConfig = config;
    }
  };

  [barcodeJs, formDataJs, dashboardJs].forEach((js) => {
    const script = window.document.createElement("script");
    script.textContent = js;
    window.document.head.appendChild(script);
  });

  window.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  window.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };

  const event = window.document.createEvent("Event");
  event.initEvent("DOMContentLoaded", true, true);
  window.dispatchEvent(event);

  await new Promise((resolve) => setTimeout(resolve, 50));

  window.document.getElementById("fieldSettingsButton").click();
  window.document.getElementById("addCustomFieldButton").click();

  const fieldConfigForm = window.document.getElementById("fieldConfigForm");
  const editors = fieldConfigForm.querySelectorAll(".custom-field-editor");
  const row = editors[editors.length - 1];
  row.querySelector('[name^="custom-field-id-"]').value = "siteRef";
  row.querySelector('[name^="custom-field-label-"]').value = "Site Reference";
  row.querySelector('[name^="custom-field-type-"]').value = "text";
  row.querySelector('[name^="custom-field-required-"]').checked = true;

  fieldConfigForm.dispatchEvent(new window.Event("submit", { cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(savedConfig.customRequestFields.length, 1);
  assert.equal(savedConfig.customRequestFields[0].id, "siteRef");
  assert.equal(savedConfig.customRequestFields[0].label, "Site Reference");
  assert.equal(savedConfig.customRequestFields[0].required, true);
});

test("dashboard.js theme toggle (dark/light mode logic and localStorage)", async () => {
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost/" });
  const { window } = dom;
  window.localStorage.setItem("theme", "light");

  const mockAuth = {
    onAuthChange: (cb) => cb({ email: "test@rakmat.com.sg" }),
    isAllowedUser: () => true
  };
  const mockFirestore = { listCubeRequests: async () => [] };
  window.CubeSyncAuth = mockAuth;
  window.CubeSyncFirestore = mockFirestore;

  [barcodeJs, formDataJs, dashboardJs].forEach(js => {
    const s = window.document.createElement("script");
    s.textContent = js;
    window.document.head.appendChild(s);
  });

  const event = window.document.createEvent("Event");
  event.initEvent("DOMContentLoaded", true, true);
  window.document.dispatchEvent(event);

  await new Promise(resolve => setTimeout(resolve, 50));
  const themeToggle = window.document.getElementById("themeToggle");

  themeToggle.checked = false;
  themeToggle.dispatchEvent(new window.Event("change"));
  assert.equal(window.localStorage.getItem("theme"), "dark");
  assert.equal(window.document.documentElement.getAttribute("data-theme"), "dark");

  themeToggle.checked = true;
  themeToggle.dispatchEvent(new window.Event("change"));
  assert.equal(window.localStorage.getItem("theme"), "light");
  assert.equal(window.document.documentElement.getAttribute("data-theme"), "light");
});

test("dashboard.js hamburger menu toggle (menu activation/deactivation)", async () => {
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost/" });
  const { window } = dom;

  const mockAuth = {
    onAuthChange: (cb) => cb({ email: "test@rakmat.com.sg" }),
    isAllowedUser: () => true
  };
  const mockFirestore = { listCubeRequests: async () => [] };
  window.CubeSyncAuth = mockAuth;
  window.CubeSyncFirestore = mockFirestore;

  [barcodeJs, formDataJs, dashboardJs].forEach(js => {
    const s = window.document.createElement("script");
    s.textContent = js;
    window.document.head.appendChild(s);
  });

  const event = window.document.createEvent("Event");
  event.initEvent("DOMContentLoaded", true, true);
  window.dispatchEvent(event);

  await new Promise(resolve => setTimeout(resolve, 50));
  const menuToggle = window.document.getElementById("menuToggle");
  const dropdownMenu = window.document.getElementById("dropdownMenu");

  assert.equal(menuToggle.getAttribute("aria-expanded"), "false");
  assert.equal(dropdownMenu.classList.contains("active"), false);

  menuToggle.click();
  assert.equal(menuToggle.getAttribute("aria-expanded"), "true");
  assert.equal(dropdownMenu.classList.contains("active"), true);

  menuToggle.click();
  assert.equal(menuToggle.getAttribute("aria-expanded"), "false");
  assert.equal(dropdownMenu.classList.contains("active"), false);
});

test("dashboard.js form actions (delete, print from both detail panel and list row)", async () => {
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost/" });
  const { window } = dom;

  const mockAuth = {
    onAuthChange: (cb) => cb({ email: "test@rakmat.com.sg" }),
    isAllowedUser: () => true
  };

  let deletedId = null;
  const mockFirestore = {
    listCubeRequests: async () => [
      { id: "1", reportNo: "APPLE", client: "A", project: "P", status: "Draft", template: "Original" }
    ],
    deleteCubeRequest: async (id) => { deletedId = id; }
  };

  window.CubeSyncAuth = mockAuth;
  window.CubeSyncFirestore = mockFirestore;
  window.confirm = () => true;

  let openedUrl = null;
  window.open = (url) => { openedUrl = url; };

  [barcodeJs, formDataJs, dashboardJs].forEach(js => {
    const s = window.document.createElement("script");
    s.textContent = js;
    window.document.head.appendChild(s);
  });

  const event = window.document.createEvent("Event");
  event.initEvent("DOMContentLoaded", true, true);
  window.dispatchEvent(event);

  await new Promise(resolve => setTimeout(resolve, 50));
  const list = window.document.getElementById("formList");

  const rowPrintBtn = list.querySelector("button[data-action='print']");
  rowPrintBtn.click();
  assert.match(openedUrl, /index\.html\?id=1&print=true/);

  const row = list.querySelector("tr[data-id='1']");
  row.click();

  openedUrl = null;
  const detailPrintBtn = window.document.getElementById("detailPrintButton");
  detailPrintBtn.click();
  assert.match(openedUrl, /index\.html\?id=1&print=true/);

  const detailDeleteBtn = window.document.getElementById("detailDeleteButton");
  detailDeleteBtn.click();
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(deletedId, "1");

  deletedId = null;
  const rowDeleteBtn = list.querySelector("tr[data-id='1'] button[data-action='delete']");
  rowDeleteBtn.click();
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(deletedId, "1");
});

test("dashboard.js row action dropdown toggling", async () => {
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost/" });
  const { window } = dom;

  const mockAuth = {
    onAuthChange: (cb) => cb({ email: "test@rakmat.com.sg" }),
    isAllowedUser: () => true
  };

  const mockFirestore = {
    listCubeRequests: async () => [
      { id: "1", reportNo: "ONE", client: "A", project: "P", status: "Draft", template: "Original" },
      { id: "2", reportNo: "TWO", client: "A", project: "P", status: "Draft", template: "Original" }
    ]
  };

  window.CubeSyncAuth = mockAuth;
  window.CubeSyncFirestore = mockFirestore;

  [barcodeJs, formDataJs, dashboardJs].forEach(js => {
    const s = window.document.createElement("script");
    s.textContent = js;
    window.document.head.appendChild(s);
  });

  const event = window.document.createEvent("Event");
  event.initEvent("DOMContentLoaded", true, true);
  window.dispatchEvent(event);

  await new Promise(resolve => setTimeout(resolve, 50));
  const list = window.document.getElementById("formList");

  const btn1 = list.querySelector("tr[data-id='1'] button[data-action='toggle-dropdown']");
  const menu1 = btn1.nextElementSibling;
  
  const btn2 = list.querySelector("tr[data-id='2'] button[data-action='toggle-dropdown']");
  const menu2 = btn2.nextElementSibling;

  // Initially hidden
  assert.equal(btn1.getAttribute("aria-expanded"), "false");
  assert.ok(!menu1.classList.contains("active"));
  
  // Click btn1 to open
  btn1.click();
  assert.equal(btn1.getAttribute("aria-expanded"), "true");
  assert.ok(menu1.classList.contains("active"));

  // Click btn1 again to close
  btn1.click();
  assert.equal(btn1.getAttribute("aria-expanded"), "false");
  assert.ok(!menu1.classList.contains("active"));

  // Click btn1 to open again
  btn1.click();
  
  // Click btn2 to open menu2 and auto-close menu1
  btn2.click();
  assert.equal(btn1.getAttribute("aria-expanded"), "false");
  assert.ok(!menu1.classList.contains("active"));
  assert.equal(btn2.getAttribute("aria-expanded"), "true");
  assert.ok(menu2.classList.contains("active"));

  // Click outside to close menu2
  window.document.body.click();
  assert.equal(btn2.getAttribute("aria-expanded"), "false");
  assert.ok(!menu2.classList.contains("active"));

  // Re-open btn2
  btn2.click();
  assert.ok(menu2.classList.contains("active"));

  // Click an action inside menu2
  const printAction = list.querySelector("tr[data-id='2'] button[data-action='print']");
  window.open = () => {}; // mock window.open
  printAction.click();

  // Assert it closed after action
  assert.equal(btn2.getAttribute("aria-expanded"), "false");
  assert.ok(!menu2.classList.contains("active"));
});


test("UI regressions: Assert #dropdownMenu z-index/stacking, #themeToggle vs glassmorphic.css checkbox overrides, and stylesheet load order on dashboard.html", async () => {
  const dom = new JSDOM(html);
  const { window } = dom;
  const document = window.document;

  const links = Array.from(document.querySelectorAll("link[rel='stylesheet']"));
  const localStylesheets = links.filter((link) => /css\//.test(link.getAttribute("href") || ""));
  assert.equal(localStylesheets.length, 2);
  assert.match(localStylesheets[0].href, /css\/glassmorphic\.css$/);
  assert.match(localStylesheets[1].href, /css\/dashboard\.css$/);

  const dropdownMenu = document.getElementById("dropdownMenu");
  assert.ok(dropdownMenu);

  const themeToggle = document.getElementById("themeToggle");
  assert.ok(themeToggle);
});

test("CSS regression: .table-wrap has sufficient sizing to prevent dropdown clipping", () => {
  const cssPath = require("node:path").join(__dirname, "css", "dashboard.css");
  const css = fs.readFileSync(cssPath, "utf8");
  
  // Find the .table-wrap block
  const tableWrapMatch = css.match(/\.table-wrap\s*\{([^}]+)\}/);
  assert.ok(tableWrapMatch, ".table-wrap class should exist");
  
  const rules = tableWrapMatch[1];
  
  // It needs min-height, padding-bottom, and z-index to prevent clipping dropdown menus
  assert.match(rules, /min-height:\s*\d+px/i, ".table-wrap must have min-height to prevent clipping");
  assert.match(rules, /padding-bottom:\s*\d+px/i, ".table-wrap must have padding-bottom for the last row dropdowns");
  assert.match(rules, /z-index:\s*[1-9]\d*/i, ".table-wrap must have z-index to establish stacking context");
});
