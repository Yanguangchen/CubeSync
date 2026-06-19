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
            testNumber: "T-001",
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
        specimenSize: "150x150", slumpSpecified: 20
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
  assert.equal(editForm.elements.internalDate.value, "2026-06-19");
  assert.equal(editForm.elements.projectCode.value, "PC1");
  assert.equal(editForm.elements.method.value, "M1");
  assert.equal(editForm.elements.supplier.value, "S1");
  assert.equal(editForm.elements.dateTimeSampled.value, "2026-06-19T10:00");
  assert.equal(editForm.elements.slumpMeasured.value, "10");
  assert.equal(editForm.elements.specimenSize.value, "150x150");
  assert.equal(editForm.elements.slumpSpecified.value, "20");

  // Modify some fields
  editForm.elements.internalDate.value = "2026-06-20";
  editForm.elements.slumpMeasured.value = "15";

  // Submit form
  editForm.dispatchEvent(new window.Event("submit", { cancelable: true }));
  await new Promise(resolve => setTimeout(resolve, 50));

  assert.equal(updatedData.internalDate, "2026-06-20");
  assert.equal(updatedData.slumpMeasured, 15);
});
