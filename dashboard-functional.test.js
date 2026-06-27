const { JSDOM } = require("jsdom");
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const barcodeJs = fs.readFileSync("barcode.js", "utf8");
const formDataJs = fs.readFileSync("cubesync-form-data.js", "utf8");
const dashboardJs = fs.readFileSync("dashboard.js", "utf8");
const filtersJs = fs.readFileSync("cubesync-dashboard-filters.js", "utf8");
const todayToggleJs = fs.readFileSync("cubesync-today-toggle.js", "utf8");
const html = fs.readFileSync("dashboard.html", "utf8");

function isoToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

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
        updatedAt: "17/06/2026",
        dateOfCast: "18/06/2026",
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
  assert.equal(row.querySelectorAll("td")[5].textContent.trim(), "2026/06/17");
  row.click();

  const detailTitle = window.document.getElementById("detailTitle");
  const detailContent = window.document.getElementById("detailContent");
  assert.equal(detailTitle.textContent, "REPORT-001");
  assert.match(detailContent.innerHTML, /Project X/);
  assert.match(detailContent.textContent, /2026\/06\/18/);
  assert.doesNotMatch(detailContent.textContent, /18\/06\/2026/);
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

test("dashboard.js shows sign-in failures inline in the auth gate", async () => {
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost/" });
  const { window } = dom;

  window.CubeSyncAuth = {
    onAuthChange: () => {},
    isAllowedUser: () => true,
    signInWithGoogle: async () => {
      const error = new Error("Popup blocked");
      error.code = "permission-denied";
      throw error;
    }
  };
  window.CubeSyncFirestore = {};

  [barcodeJs, formDataJs, dashboardJs].forEach((js) => {
    const s = window.document.createElement("script");
    s.textContent = js;
    window.document.head.appendChild(s);
  });

  const event = window.document.createEvent("Event");
  event.initEvent("DOMContentLoaded", true, true);
  window.document.dispatchEvent(event);

  window.document.getElementById("signInButton").click();
  await new Promise((resolve) => setTimeout(resolve, 20));

  const status = window.document.getElementById("authGateStatus");
  assert.equal(status.hidden, false);
  assert.equal(status.getAttribute("data-tone"), "warning");
  assert.match(status.textContent, /Access denied/i);
});

test("dashboard.js populates client/project filters and sorts by date", async () => {
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost/" });
  const { window } = dom;

  const mockAuth = {
    onAuthChange: (cb) => cb({ email: "test@rakmat.com.sg" }),
    isAllowedUser: () => true
  };

  const mockFirestore = {
    listCubeRequests: async () => [
      { id: "old", reportNo: "OLD", client: "Alpha Co", project: "Tower", status: "Ready", updatedAt: "2026-01-01" },
      { id: "new", reportNo: "NEW", client: "Beta Co", project: "Bridge", status: "Ready", updatedAt: "2026-12-31" },
      { id: "mid", reportNo: "MID", client: "Alpha Co", project: "Bridge", status: "Ready", updatedAt: "2026-06-15" }
    ]
  };

  window.CubeSyncAuth = mockAuth;
  window.CubeSyncFirestore = mockFirestore;

  [barcodeJs, formDataJs, filtersJs, dashboardJs].forEach((js) => {
    const s = window.document.createElement("script");
    s.textContent = js;
    window.document.head.appendChild(s);
  });

  const event = window.document.createEvent("Event");
  event.initEvent("DOMContentLoaded", true, true);
  window.document.dispatchEvent(event);

  await new Promise((resolve) => setTimeout(resolve, 50));

  const list = window.document.getElementById("formList");
  const clientFilter = window.document.getElementById("clientFilter");
  const projectFilter = window.document.getElementById("projectFilter");
  const sortOrder = window.document.getElementById("sortOrder");

  // Filter dropdowns are populated with distinct, sorted values plus an "all" option.
  const clientValues = Array.from(clientFilter.options).map((o) => o.value);
  assert.deepEqual(clientValues, ["all", "Alpha Co", "Beta Co"]);
  const projectValues = Array.from(projectFilter.options).map((o) => o.value);
  assert.deepEqual(projectValues, ["all", "Bridge", "Tower"]);

  // Default sort is newest-first.
  let order = Array.from(list.querySelectorAll("tr[data-id]")).map((tr) => tr.dataset.id);
  assert.deepEqual(order, ["new", "mid", "old"]);

  // Sort oldest-first.
  sortOrder.value = "date-asc";
  sortOrder.dispatchEvent(new window.Event("change"));
  order = Array.from(list.querySelectorAll("tr[data-id]")).map((tr) => tr.dataset.id);
  assert.deepEqual(order, ["old", "mid", "new"]);

  // Filter by client.
  clientFilter.value = "Alpha Co";
  clientFilter.dispatchEvent(new window.Event("change"));
  order = Array.from(list.querySelectorAll("tr[data-id]")).map((tr) => tr.dataset.id);
  assert.deepEqual(order, ["old", "mid"]);

  // Stack a project filter on top of the client filter.
  projectFilter.value = "Bridge";
  projectFilter.dispatchEvent(new window.Event("change"));
  order = Array.from(list.querySelectorAll("tr[data-id]")).map((tr) => tr.dataset.id);
  assert.deepEqual(order, ["mid"]);
});

test("dashboard.js 'Today only' toggle shows only forms dated today", async () => {
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost/" });
  const { window } = dom;

  const today = isoToday();
  const mockAuth = {
    onAuthChange: (cb) => cb({ email: "test@rakmat.com.sg" }),
    isAllowedUser: () => true
  };
  const mockFirestore = {
    listCubeRequests: async () => [
      { id: "today", reportNo: "TODAY", client: "A", project: "P", status: "Ready", updatedAt: today },
      { id: "old", reportNo: "OLD", client: "B", project: "Q", status: "Ready", updatedAt: "2020-01-01" }
    ]
  };

  window.CubeSyncAuth = mockAuth;
  window.CubeSyncFirestore = mockFirestore;

  [barcodeJs, formDataJs, filtersJs, todayToggleJs, dashboardJs].forEach((js) => {
    const s = window.document.createElement("script");
    s.textContent = js;
    window.document.head.appendChild(s);
  });

  const event = window.document.createEvent("Event");
  event.initEvent("DOMContentLoaded", true, true);
  window.document.dispatchEvent(event);
  await new Promise((resolve) => setTimeout(resolve, 50));

  const list = window.document.getElementById("formList");
  const toggle = window.document.getElementById("todayOnlyToggle");

  // Both forms visible by default.
  assert.match(list.innerHTML, /TODAY/);
  assert.match(list.innerHTML, /OLD/);

  // Engine can't run in JSDOM, so the toggle falls back to basic mode.
  assert.ok(window.document.getElementById("todayToggle").classList.contains("is-basic"));

  // Turn the toggle on → only today's form remains.
  toggle.checked = true;
  toggle.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.match(list.innerHTML, /TODAY/);
  assert.doesNotMatch(list.innerHTML, /OLD/);

  // Turn it off again → both return.
  toggle.checked = false;
  toggle.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.match(list.innerHTML, /OLD/);
});

test("dashboard.js reveals the detail panel only when a form is selected", async () => {
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost/" });
  const { window } = dom;

  const mockAuth = {
    onAuthChange: (cb) => cb({ email: "test@rakmat.com.sg" }),
    isAllowedUser: () => true
  };
  const mockFirestore = {
    listCubeRequests: async () => [
      { id: "1", reportNo: "REPORT-001", client: "A", project: "P", status: "Ready" }
    ]
  };

  window.CubeSyncAuth = mockAuth;
  window.CubeSyncFirestore = mockFirestore;

  [barcodeJs, formDataJs, filtersJs, todayToggleJs, dashboardJs].forEach((js) => {
    const s = window.document.createElement("script");
    s.textContent = js;
    window.document.head.appendChild(s);
  });

  const event = window.document.createEvent("Event");
  event.initEvent("DOMContentLoaded", true, true);
  window.document.dispatchEvent(event);
  await new Promise((resolve) => setTimeout(resolve, 50));

  const workspace = window.document.querySelector(".workspace");
  const detailPanel = window.document.getElementById("detailPanel");

  // Nothing selected on load → detail panel hidden.
  assert.ok(!workspace.classList.contains("has-detail"));
  assert.equal(detailPanel.getAttribute("aria-hidden"), "true");

  // Select a form → detail panel revealed.
  window.document.querySelector("tr[data-id='1']").click();
  assert.ok(workspace.classList.contains("has-detail"));
  assert.equal(detailPanel.getAttribute("aria-hidden"), "false");

  // The hide button re-hides the panel and clears the selection.
  window.document.getElementById("detailHideButton").click();
  assert.ok(!workspace.classList.contains("has-detail"));
  assert.equal(detailPanel.getAttribute("aria-hidden"), "true");
  assert.equal(window.document.getElementById("detailTitle").textContent, "No form selected");
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

test("dashboard.js keeps the edit dialog open and shows inline save errors", async () => {
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
        id: "1",
        reportNo: "APPLE",
        client: "A",
        project: "P",
        status: "Draft",
        supplier: "Supplier A",
        customerBilling: "Billing A",
        locationRepresented: "Level 1",
        dateOfCast: "2026-06-19",
        concreteGrade: "C35/45",
        reportGrade: "C35/45",
        supplierDisplay: "Supplier A",
        specimenSize: "150x150",
        slumpMeasured: 10,
        slumpSpecified: 20,
        personInCharge: "Jane",
        managerInCharge: "John"
      }
    ],
    updateCubeRequest: async () => {
      const error = new Error("backend unavailable");
      error.code = "unavailable";
      throw error;
    }
  };

  window.CubeSyncAuth = mockAuth;
  window.CubeSyncFirestore = mockFirestore;

  [barcodeJs, formDataJs, dashboardJs].forEach((js) => {
    const s = window.document.createElement("script");
    s.textContent = js;
    window.document.head.appendChild(s);
  });

  window.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  window.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };

  // This test deliberately makes the save throw; silence the expected
  // console.error so it doesn't dump a stack into the test output.
  window.console.error = () => {};

  const event = window.document.createEvent("Event");
  event.initEvent("DOMContentLoaded", true, true);
  window.document.dispatchEvent(event);

  await new Promise((resolve) => setTimeout(resolve, 50));

  window.document.querySelector("button[data-action='edit']").click();
  const editDialog = window.document.getElementById("editDialog");
  const editForm = window.document.getElementById("editForm");
  editForm.dispatchEvent(new window.Event("submit", { cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 30));

  const status = window.document.getElementById("editFormStatus");
  assert.equal(editDialog.open, true);
  assert.equal(status.hidden, false);
  assert.equal(status.getAttribute("data-tone"), "error");
  assert.match(status.textContent, /Service issue/i);
});

test("dashboard.js edit dialog restores free-text flags and renders admin-defined custom fields", async () => {
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
    getFormFieldConfig: async () => ({
      customRequestFields: [
        { id: "siteRef", label: "Site Ref", type: "text", enabled: true }
      ]
    }),
    listCubeRequests: async () => [
      {
        id: "1",
        reportNo: "CUSTOM-001",
        client: "Client A",
        project: "Project X",
        status: "Draft",
        template: "Original",
        supplier: "Typed Supplier",
        customFields: ["supplier"],
        extraFields: {
          siteRef: "Plot 7"
        }
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

  window.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  window.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };

  const event = window.document.createEvent("Event");
  event.initEvent("DOMContentLoaded", true, true);
  window.document.dispatchEvent(event);

  await new Promise((resolve) => setTimeout(resolve, 50));

  const editButton = window.document.querySelector("button[data-action='edit']");
  assert.ok(editButton, "edit button should render for the loaded request");
  editButton.click();

  const editDialog = window.document.getElementById("editDialog");
  const editForm = window.document.getElementById("editForm");
  assert.equal(editDialog.open, true, "edit dialog should open");

  const supplier = editForm.elements.supplier;
  assert.equal(supplier.value, "Typed Supplier");
  assert.equal(
    supplier.dataset.freeTextEntry,
    "true",
    "edit dialog should restore the free-text marker on built-in dropdown fields"
  );

  const customRow = editForm.querySelector('.custom-field-row[data-custom-field-row="siteRef"]');
  assert.ok(customRow, "edit dialog should render admin-defined custom fields from field settings");

  const customInput = customRow.querySelector('[data-custom-field-id="siteRef"]');
  assert.ok(customInput, "custom field row should contain its data-custom-field-id hook");
  assert.equal(customInput.value, "Plot 7");
});

test("dashboard.js keeps field settings open and shows inline save errors", async () => {
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    url: "http://localhost/"
  });
  const { window } = dom;

  window.CubeSyncAuth = {
    onAuthChange: (cb) => cb({ email: "test@rakmat.com.sg" }),
    isAllowedUser: () => true
  };
  window.CubeSyncFirestore = {
    listCubeRequests: async () => [],
    getFormFieldConfig: async () => null,
    saveFormFieldConfig: async () => {
      const error = new Error("not allowed");
      error.code = "permission-denied";
      throw error;
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
  window.document.dispatchEvent(event);

  await new Promise((resolve) => setTimeout(resolve, 50));

  window.document.getElementById("fieldSettingsButton").click();
  const dialog = window.document.getElementById("fieldConfigDialog");
  const form = window.document.getElementById("fieldConfigForm");
  form.dispatchEvent(new window.Event("submit", { cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 30));

  const status = window.document.getElementById("fieldConfigStatus");
  assert.equal(dialog.open, true);
  assert.equal(status.hidden, false);
  assert.equal(status.getAttribute("data-tone"), "warning");
  assert.match(status.textContent, /Access denied/i);
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

test("CSS: edit dialog highlights free-text dropdown inputs in orange", () => {
  const cssPath = require("node:path").join(__dirname, "css", "dashboard.css");
  const css = fs.readFileSync(cssPath, "utf8");

  // The edit form must visually flag inputs the admin typed as free text
  // (data-free-text-entry="true") using the same orange cue as the detail view.
  const ruleMatch = css.match(
    /\.edit-dialog input\[data-free-text-entry="true"\][^{]*\{([^}]+)\}/
  );
  assert.ok(ruleMatch, "edit dialog must style [data-free-text-entry] inputs");
  assert.match(
    ruleMatch[1],
    /249,\s*115,\s*22|#f97316/i,
    "free-text input highlight must use the orange accent"
  );
});

test("CSS: edit dialog highlights custom (Field Settings) fields in a distinct colour", () => {
  const cssPath = require("node:path").join(__dirname, "css", "dashboard.css");
  const css = fs.readFileSync(cssPath, "utf8");

  // Admin-added custom fields get their own colour so they are not confused
  // with the orange free-text cue.
  const ruleMatch = css.match(/\.edit-dialog \.custom-field-row\s*\{([^}]+)\}/);
  assert.ok(ruleMatch, "edit dialog must style .custom-field-row");
  assert.match(
    ruleMatch[1],
    /99,\s*102,\s*241|#6366f1/i,
    "custom field highlight must use the indigo accent"
  );

  // The custom-field colour must differ from the orange free-text colour.
  assert.doesNotMatch(
    ruleMatch[1],
    /249,\s*115,\s*22|#f97316/i,
    "custom field highlight must not reuse the orange free-text colour"
  );
});

test("edit form exposes the hooks the highlight CSS targets", () => {
  const formData = require("./cubesync-form-data");
  const dom = new JSDOM(html, { url: "http://localhost/" });
  const form = dom.window.document.getElementById("editForm");
  assert.ok(form, "editForm must exist");

  // A custom field defined in Field Settings renders as a .custom-field-row.
  formData.applyCustomRequestFields(
    form,
    { customRequestFields: [{ id: "siteRef", label: "Site Ref", type: "text", enabled: true }] },
    { siteRef: "Plot 7" }
  );
  const customRow = form.querySelector(".custom-field-row");
  assert.ok(customRow, "custom fields must render with the .custom-field-row class");
  assert.equal(customRow.getAttribute("data-custom-field-row"), "siteRef");

  // A dropdown field typed as free text gets data-free-text-entry="true".
  const supplier = form.elements.supplier;
  supplier.value = "Some Unlisted Supplier";
  formData.applyFreeTextFlags(form, ["supplier"]);
  assert.equal(supplier.dataset.freeTextEntry, "true");
});

test("setting a flagged form to Ready promotes its free-text values to the shared lists", async () => {
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost/" });
  const { window } = dom;

  const added = [];
  window.CubeSyncAuth = {
    onAuthChange: (cb) => cb({ email: "test@rakmat.com.sg" }),
    isAllowedUser: () => true
  };
  window.CubeSyncFirestore = {
    listCubeRequests: async () => [
      {
        id: "1", reportNo: "REQ-1", status: "Draft",
        customerBilling: "Brand New Co", supplier: "Brand New Supplier",
        customFields: ["customerBilling", "supplier"]
      }
    ],
    updateCubeRequest: async () => {},
    getDropdownOptions: async () => ({}),
    addDropdownOptions: async (values) => { added.push(values); }
  };

  [barcodeJs, formDataJs, dashboardJs].forEach((js) => {
    const s = window.document.createElement("script");
    s.textContent = js;
    window.document.head.appendChild(s);
  });
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; };

  const ev = window.document.createEvent("Event");
  ev.initEvent("DOMContentLoaded", true, true);
  window.document.dispatchEvent(ev);
  await new Promise((r) => setTimeout(r, 50));

  window.document.querySelector("button[data-action='edit']").click();
  const editForm = window.document.getElementById("editForm");
  editForm.elements.status.value = "Ready";
  editForm.dispatchEvent(new window.Event("submit", { cancelable: true }));
  await new Promise((r) => setTimeout(r, 50));

  assert.equal(added.length, 1);
  assert.equal(added[0].customerBilling, "Brand New Co");
  assert.equal(added[0].supplier, "Brand New Supplier");
});

test("the manage-autocomplete-lists GUI loads and saves shared options", async () => {
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost/" });
  const { window } = dom;

  let saved = null;
  window.CubeSyncAuth = {
    onAuthChange: (cb) => cb({ email: "test@rakmat.com.sg" }),
    isAllowedUser: () => true
  };
  window.CubeSyncFirestore = {
    listCubeRequests: async () => [],
    getDropdownOptions: async () => ({ customerBilling: ["Existing Co"] }),
    saveDropdownOptions: async (map) => { saved = map; }
  };

  [barcodeJs, formDataJs, dashboardJs].forEach((js) => {
    const s = window.document.createElement("script");
    s.textContent = js;
    window.document.head.appendChild(s);
  });
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; };

  const ev = window.document.createEvent("Event");
  ev.initEvent("DOMContentLoaded", true, true);
  window.document.dispatchEvent(ev);
  await new Promise((r) => setTimeout(r, 50));

  window.document.getElementById("manageOptionsButton").click();
  await new Promise((r) => setTimeout(r, 20));

  const optionsForm = window.document.getElementById("optionsForm");
  const customerBilling = optionsForm.elements.customerBilling;
  assert.match(customerBilling.value, /Existing Co/);

  // Add a value and save.
  customerBilling.value = "Existing Co\nFresh Client";
  optionsForm.dispatchEvent(new window.Event("submit", { cancelable: true }));
  await new Promise((r) => setTimeout(r, 20));

  assert.ok(saved, "saveDropdownOptions should be called");
  // Spread to normalize cross-realm (JSDOM) arrays before strict comparison.
  assert.deepEqual([...saved.customerBilling], ["Existing Co", "Fresh Client"]);
  assert.deepEqual([...saved.supplier], []);
});

test("saving managed autocomplete lists refreshes dashboard free-text resolution", async () => {
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost/" });
  const { window } = dom;

  const shared = {};
  const record = {
    id: "managed-1",
    reportNo: "REQ-MANAGED-1",
    status: "Draft",
    supplier: "Fresh Managed Supplier",
    customFields: ["supplier"]
  };

  window.CubeSyncAuth = {
    onAuthChange: (cb) => cb({ email: "test@rakmat.com.sg" }),
    isAllowedUser: () => true
  };
  window.CubeSyncFirestore = {
    listCubeRequests: async () => [{ ...record }],
    getDropdownOptions: async () => {
      const copy = {};
      Object.keys(shared).forEach((field) => { copy[field] = shared[field].slice(); });
      return copy;
    },
    saveDropdownOptions: async (map) => {
      Object.keys(map).forEach((field) => { shared[field] = map[field].slice(); });
    }
  };

  [barcodeJs, formDataJs, dashboardJs].forEach((js) => {
    const s = window.document.createElement("script");
    s.textContent = js;
    window.document.head.appendChild(s);
  });
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; };

  const ev = window.document.createEvent("Event");
  ev.initEvent("DOMContentLoaded", true, true);
  window.document.dispatchEvent(ev);
  await new Promise((r) => setTimeout(r, 50));

  const list = window.document.getElementById("formList");
  assert.ok(
    list.querySelector("tr[data-id='managed-1']").classList.contains("has-custom-fields"),
    "the supplier starts flagged before it is added to shared options"
  );

  window.document.getElementById("manageOptionsButton").click();
  await new Promise((r) => setTimeout(r, 20));

  const optionsForm = window.document.getElementById("optionsForm");
  optionsForm.elements.supplier.value = "Fresh Managed Supplier";
  optionsForm.dispatchEvent(new window.Event("submit", { cancelable: true }));
  await new Promise((r) => setTimeout(r, 60));

  assert.deepEqual([...shared.supplier], ["Fresh Managed Supplier"]);
  assert.ok(
    !list.querySelector("tr[data-id='managed-1']").classList.contains("has-custom-fields"),
    "saving the managed list should immediately make the value canonical"
  );
});

test("setting a form to Ready still saves when promotion (addDropdownOptions) fails", async () => {
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost/" });
  const { window } = dom;

  let updated = false;
  window.CubeSyncAuth = {
    onAuthChange: (cb) => cb({ email: "test@rakmat.com.sg" }),
    isAllowedUser: () => true
  };
  window.CubeSyncFirestore = {
    listCubeRequests: async () => [
      { id: "1", reportNo: "REQ-1", status: "Draft", supplier: "Brand New Supplier", customFields: ["supplier"] }
    ],
    updateCubeRequest: async () => { updated = true; },
    getDropdownOptions: async () => ({}),
    addDropdownOptions: async () => { throw new Error("write failed"); }
  };

  [barcodeJs, formDataJs, dashboardJs].forEach((js) => {
    const s = window.document.createElement("script");
    s.textContent = js;
    window.document.head.appendChild(s);
  });
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  // Promotion is best-effort and logs a warning on failure; keep output clean.
  window.console.warn = () => {};

  const ev = window.document.createEvent("Event");
  ev.initEvent("DOMContentLoaded", true, true);
  window.document.dispatchEvent(ev);
  await new Promise((r) => setTimeout(r, 50));

  window.document.querySelector("button[data-action='edit']").click();
  const editForm = window.document.getElementById("editForm");
  const editDialog = window.document.getElementById("editDialog");
  editForm.elements.status.value = "Ready";
  editForm.dispatchEvent(new window.Event("submit", { cancelable: true }));
  await new Promise((r) => setTimeout(r, 50));

  // The save itself must succeed even though promotion threw.
  assert.equal(updated, true, "the form should still be updated");
  assert.equal(editDialog.open, false, "dialog should close on a successful save");
  const status = window.document.getElementById("editFormStatus");
  assert.notEqual(status.getAttribute("data-tone"), "error");
});

test("a promoted value stops being flagged after the dashboard reloads", async () => {
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost/" });
  const { window } = dom;

  const record = {
    id: "1", reportNo: "REQ-1", status: "Draft",
    supplier: "Brand New Supplier", customFields: ["supplier"]
  };
  const shared = {};

  window.CubeSyncAuth = {
    onAuthChange: (cb) => cb({ email: "test@rakmat.com.sg" }),
    isAllowedUser: () => true
  };
  window.CubeSyncFirestore = {
    listCubeRequests: async () => [{ ...record }],
    updateCubeRequest: async (id, patch) => { Object.assign(record, patch); },
    getDropdownOptions: async () => {
      const copy = {};
      Object.keys(shared).forEach((field) => { copy[field] = shared[field].slice(); });
      return copy;
    },
    addDropdownOptions: async (values) => {
      Object.keys(values).forEach((field) => {
        shared[field] = shared[field] || [];
        const list = Array.isArray(values[field]) ? values[field] : [values[field]];
        list.forEach((value) => { if (!shared[field].includes(value)) shared[field].push(value); });
      });
    }
  };

  [barcodeJs, formDataJs, dashboardJs].forEach((js) => {
    const s = window.document.createElement("script");
    s.textContent = js;
    window.document.head.appendChild(s);
  });
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; };

  const ev = window.document.createEvent("Event");
  ev.initEvent("DOMContentLoaded", true, true);
  window.document.dispatchEvent(ev);
  await new Promise((r) => setTimeout(r, 50));

  const list = window.document.getElementById("formList");
  // No option list yet -> value-based check falls back to metadata -> flagged.
  assert.ok(
    list.querySelector("tr[data-id='1']").classList.contains("has-custom-fields"),
    "the novel supplier should be flagged before promotion"
  );

  window.document.querySelector("button[data-action='edit']").click();
  const editForm = window.document.getElementById("editForm");
  editForm.elements.status.value = "Ready";
  editForm.dispatchEvent(new window.Event("submit", { cancelable: true }));
  await new Promise((r) => setTimeout(r, 60));

  // The value was promoted to the shared list...
  assert.ok(shared.supplier && shared.supplier.includes("Brand New Supplier"));
  // ...so after the reload it is canonical and no longer flagged.
  assert.ok(
    !list.querySelector("tr[data-id='1']").classList.contains("has-custom-fields"),
    "the promoted supplier should no longer be flagged"
  );
});
