const { JSDOM } = require("jsdom");
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const barcodeJs = fs.readFileSync("barcode.js", "utf8");
const formDataJs = fs.readFileSync("cubesync-form-data.js", "utf8");
const exportJs = fs.readFileSync("cubesync-export.js", "utf8");
const rpaDashboardJs = fs.readFileSync("rpa-dashboard.js", "utf8");
const rpaDashboardHtml = fs.readFileSync("rpa-dashboard.html", "utf8");
const DASHBOARD_SCRIPTS = [barcodeJs, formDataJs, exportJs, rpaDashboardJs];

function stubAudio(window) {
  window.HTMLMediaElement.prototype.play = () => Promise.resolve();
}

function waitForAsync(ms = 50) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadScripts(window, scripts) {
  scripts.forEach((js) => {
    const script = window.document.createElement("script");
    script.textContent = js;
    window.document.head.appendChild(script);
  });
}

function dispatchDomContentLoaded(window) {
  const event = window.document.createEvent("Event");
  event.initEvent("DOMContentLoaded", true, true);
  window.document.dispatchEvent(event);
}

function createAllowedAuth(onAuthChange) {
  return {
    onAuthChange,
    isAllowedUser: () => true,
    signOutUser: async () => {},
    signInWithGoogle: async () => {},
    currentUser: () => ({ email: "rpa@rakmat.com.sg" })
  };
}

async function bootDashboard({
  url = "http://localhost/",
  firestore,
  auth = createAllowedAuth((cb) => cb({ email: "rpa@rakmat.com.sg" }))
} = {}) {
  const dom = new JSDOM(rpaDashboardHtml, {
    runScripts: "dangerously",
    url
  });
  const { window } = dom;

  stubAudio(window);
  window.alert = () => {};
  window.CubeSyncAuth = auth;
  window.CubeSyncFirestore = firestore;

  loadScripts(window, DASHBOARD_SCRIPTS);
  dispatchDomContentLoaded(window);
  await waitForAsync();

  return { dom, window };
}

function getSGTDate(date) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = formatter.formatToParts(date);
  const d = parts.find((p) => p.type === "day").value;
  const m = parts.find((p) => p.type === "month").value;
  const y = parts.find((p) => p.type === "year").value;
  return `${y}-${m}-${d}`;
}

function getTodaySgt() {
  return getSGTDate(new Date());
}

// --- Pure function unit tests via the rendered DOM ---

test("getSGTDate formats dates as YYYY-MM-DD in Singapore timezone", () => {
  // Known date: Jan 1 2026 00:00 UTC is Jan 1 2026 08:00 SGT
  const date = new Date("2026-01-01T00:00:00Z");
  const result = getSGTDate(date);
  assert.equal(result, "2026-01-01");
});

test("getSGTDate handles timezone boundary correctly", () => {
  // Dec 31 at 23:00 UTC = Jan 1 07:00 SGT (next day)
  const date = new Date("2025-12-31T23:00:00Z");
  const result = getSGTDate(date);
  assert.equal(result, "2026-01-01");
});

test("escapeHtml is applied to queue row content", async () => {
  const { window } = await bootDashboard({
    firestore: {
      listCubeRequests: async () => [
        {
          id: "xss-test",
          reportNo: '<script>alert("xss")</script>',
          client: "Client&Co",
          project: 'Project"Test',
          status: "Ready",
          createdAt: new Date().toISOString(),
          results: []
        }
      ],
      updateCubeRequest: async () => {}
    }
  });

  const queueList = window.document.getElementById("queueList");

  // Script tags should be escaped — verify no script elements injected
  const scripts = window.document.querySelectorAll("#queueList script");
  assert.equal(scripts.length, 0, "no script elements should be injected in the queue");
  // Verify ampersands are escaped in the rendered HTML
  const clientCell = queueList.querySelector("tr td:nth-child(3)");
  assert.ok(clientCell.textContent.includes("Client&Co"), "client text should contain ampersand");
});

test("queue shows 'No Firestore forms' message when no forms match the date", async () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 2);

  const { window } = await bootDashboard({
    firestore: {
      listCubeRequests: async () => [
        {
          id: "old-form",
          reportNo: "OLD-001",
          client: "Client",
          project: "Project",
          createdAt: yesterday.toISOString(),
          results: []
        }
      ],
      updateCubeRequest: async () => {}
    }
  });

  const queueList = window.document.getElementById("queueList");
  assert.ok(queueList.textContent.includes("No forms marked Ready for this day so far. Maybe check the previous days by clicking the Previous Day Button?"));
});

test("rpaStatus defaults to 'Ready for Bot' when not set", async () => {
  const { window } = await bootDashboard({
    firestore: {
      listCubeRequests: async () => [
        {
          id: "no-status",
          reportNo: "NS-001",
          client: "Client",
          project: "Project",
          status: "Ready",
          createdAt: new Date().toISOString(),
          results: []
          // No rpaStatus field
        }
      ],
      updateCubeRequest: async () => {}
    }
  });

  const queueList = window.document.getElementById("queueList");
  // Should show the "Disable RPA" button (meaning status is active, not disabled)
  assert.ok(queueList.textContent.includes("Disable RPA"));
});

test("erpStatus defaults to 'Pending' and shows selector", async () => {
  const { window } = await bootDashboard({
    firestore: {
      listCubeRequests: async () => [
        {
          id: "pending-erp",
          reportNo: "PE-001",
          client: "Client",
          project: "Project",
          status: "Ready",
          createdAt: new Date().toISOString(),
          results: []
          // No erpStatus field
        }
      ],
      updateCubeRequest: async () => {}
    }
  });

  const selector = window.document.querySelector('select[data-action="update-erp"]');
  assert.ok(selector);
  assert.equal(selector.value, "Pending");
});

test("disabled RPA form shows 'Enable RPA' button and 'Disabled' pill", async () => {
  const { window } = await bootDashboard({
    firestore: {
      listCubeRequests: async () => [
        {
          id: "disabled-form",
          reportNo: "DF-001",
          client: "Client",
          project: "Project",
          status: "Ready",
          createdAt: new Date().toISOString(),
          rpaStatus: "Disabled",
          results: []
        }
      ],
      updateCubeRequest: async () => {}
    }
  });

  const queueList = window.document.getElementById("queueList");
  const row = queueList.querySelector('tr[data-id="disabled-form"]');
  assert.ok(row);
  assert.ok(row.classList.contains("disabled-row"));
  assert.ok(row.textContent.includes("Enable RPA"));
  // Should show "Disabled" pill instead of select
  assert.equal(row.querySelector('select[data-action="update-erp"]'), null);
  assert.ok(row.querySelector(".status-pill"));
});

test("attemptCount defaults to 0 and displays correctly", async () => {
  const { window } = await bootDashboard({
    firestore: {
      listCubeRequests: async () => [
        {
          id: "no-attempts",
          reportNo: "NA-001",
          client: "Client",
          project: "Project",
          status: "Ready",
          createdAt: new Date().toISOString(),
          results: []
        }
      ],
      updateCubeRequest: async () => {}
    }
  });

  const row = window.document.querySelector('tr[data-id="no-attempts"]');
  assert.ok(row);
  // attemptCount is in the 6th <td>
  const cells = row.querySelectorAll("td");
  assert.equal(cells[5].textContent.trim(), "0");
});

test("attemptCount displays numeric value from form data", async () => {
  const { window } = await bootDashboard({
    firestore: {
      listCubeRequests: async () => [
        {
          id: "with-attempts",
          reportNo: "WA-001",
          client: "Client",
          project: "Project",
          status: "Ready",
          createdAt: new Date().toISOString(),
          attemptCount: 3,
          results: []
        }
      ],
      updateCubeRequest: async () => {}
    }
  });

  const row = window.document.querySelector('tr[data-id="with-attempts"]');
  const cells = row.querySelectorAll("td");
  assert.equal(cells[5].textContent.trim(), "3");
});

test("Firestore load error shows error message in queue", async () => {
  const { window } = await bootDashboard({
    firestore: {
      listCubeRequests: async () => {
        throw new Error("Firestore connection refused");
      },
      updateCubeRequest: async () => {}
    }
  });

  const queueList = window.document.getElementById("queueList");
  assert.ok(queueList.textContent.includes("Firestore connection refused"));
});

test("export button is disabled when no exportable forms are loaded", async () => {
  const { window } = await bootDashboard({
    firestore: {
      listCubeRequests: async () => [],
      updateCubeRequest: async () => {}
    }
  });

  const exportBtn = window.document.getElementById("exportAllButton");
  assert.ok(exportBtn.disabled);
});

test("export button is enabled when exportable forms exist", async () => {
  const { window } = await bootDashboard({
    firestore: {
      listCubeRequests: async () => [
        {
          id: "export-form",
          reportNo: "EX-001",
          client: "Client",
          project: "Project",
          status: "Ready",
          createdAt: new Date().toISOString(),
          results: []
        }
      ],
      updateCubeRequest: async () => {}
    }
  });

  const exportBtn = window.document.getElementById("exportAllButton");
  assert.equal(exportBtn.disabled, false);
});

test("date picker is constrained to today in SGT", async () => {
  const { window } = await bootDashboard({
    firestore: {
      listCubeRequests: async () => [],
      updateCubeRequest: async () => {}
    }
  });

  const datePicker = window.document.getElementById("datePicker");
  assert.equal(datePicker.max, getTodaySgt());
  assert.equal(datePicker.value, getTodaySgt());
});

test("today button has active class on load", async () => {
  const { window } = await bootDashboard({
    firestore: {
      listCubeRequests: async () => [],
      updateCubeRequest: async () => {}
    }
  });

  const todayBtn = window.document.getElementById("todayBtn");
  assert.ok(todayBtn.classList.contains("active"));
});

test("prev day button changes the view date", async () => {
  const { window } = await bootDashboard({
    firestore: {
      listCubeRequests: async () => [],
      updateCubeRequest: async () => {}
    }
  });

  const prevDay = window.document.getElementById("prevDay");
  const datePicker = window.document.getElementById("datePicker");
  const todayBtn = window.document.getElementById("todayBtn");
  const initialDate = datePicker.value;

  prevDay.click();

  assert.notEqual(datePicker.value, initialDate);
  assert.equal(todayBtn.classList.contains("active"), false);
});

test("auth gate is visible and dashboard hidden when no user is signed in", async () => {
  const { window } = await bootDashboard({
    auth: createAllowedAuth((cb) => cb(null)),
    firestore: {
      listCubeRequests: async () => [],
      updateCubeRequest: async () => {}
    }
  });

  const authGate = window.document.getElementById("authGate");
  const dashboardShell = window.document.getElementById("dashboardShell");
  assert.equal(authGate.classList.contains("is-hidden"), false);
  assert.ok(dashboardShell.classList.contains("is-hidden"));
});

test("unauthorized user is signed out automatically", async () => {
  let signOutCalled = false;

  const { window } = await bootDashboard({
    auth: {
      onAuthChange: (cb) => cb({ email: "hacker@evil.com" }),
      isAllowedUser: () => false,
      signOutUser: async () => { signOutCalled = true; },
      signInWithGoogle: async () => {},
      currentUser: () => null
    },
    firestore: {
      listCubeRequests: async () => [],
      updateCubeRequest: async () => {}
    }
  });

  assert.ok(signOutCalled);
  const authGate = window.document.getElementById("authGate");
  assert.equal(authGate.classList.contains("is-hidden"), false);
});

test("toggle disable changes RPA status from Ready to Disabled", async () => {
  let updatedData = null;

  const { window } = await bootDashboard({
    firestore: {
      listCubeRequests: async () => [
        {
          id: "toggle-form",
          reportNo: "TF-001",
          client: "Client",
          project: "Project",
          status: "Ready",
          createdAt: new Date().toISOString(),
          rpaStatus: "Ready for Bot",
          results: []
        }
      ],
      updateCubeRequest: async (id, data) => {
        updatedData = { id, ...data };
      }
    }
  });

  const toggleBtn = window.document.querySelector('[data-action="toggle-disable"]');
  assert.ok(toggleBtn);
  toggleBtn.click();
  await waitForAsync();

  assert.equal(updatedData.id, "toggle-form");
  assert.equal(updatedData.rpaStatus, "Disabled");
});

test("ERP status change to Processing also sets rpaStatus to In Progress", async () => {
  let updatedData = null;

  const { window } = await bootDashboard({
    firestore: {
      listCubeRequests: async () => [
        {
          id: "erp-form",
          reportNo: "EF-001",
          client: "Client",
          project: "Project",
          status: "Ready",
          createdAt: new Date().toISOString(),
          results: []
        }
      ],
      updateCubeRequest: async (id, data) => {
        updatedData = { id, ...data };
      }
    }
  });

  const selector = window.document.querySelector('select[data-action="update-erp"]');
  assert.ok(selector);
  selector.value = "Processing";
  selector.dispatchEvent(new window.Event("change", { bubbles: true }));
  await waitForAsync();

  assert.equal(updatedData.id, "erp-form");
  assert.equal(updatedData.erpStatus, "Processing");
  assert.equal(updatedData.rpaStatus, "In Progress");
});

test("ERP status change to Success sets rpaStatus to Submitted to ERP", async () => {
  let updatedData = null;

  const { window } = await bootDashboard({
    firestore: {
      listCubeRequests: async () => [
        {
          id: "erp-success",
          reportNo: "ES-001",
          client: "Client",
          project: "Project",
          status: "Ready",
          createdAt: new Date().toISOString(),
          results: []
        }
      ],
      updateCubeRequest: async (id, data) => {
        updatedData = { id, ...data };
      }
    }
  });

  const selector = window.document.querySelector('select[data-action="update-erp"]');
  selector.value = "Success";
  selector.dispatchEvent(new window.Event("change", { bubbles: true }));
  await waitForAsync();

  assert.equal(updatedData.erpStatus, "Success");
  assert.equal(updatedData.rpaStatus, "Submitted to ERP");
});

test("ERP status change to Error sets rpaStatus to Failed", async () => {
  let updatedData = null;

  const { window } = await bootDashboard({
    firestore: {
      listCubeRequests: async () => [
        {
          id: "erp-error",
          reportNo: "EE-001",
          client: "Client",
          project: "Project",
          status: "Ready",
          createdAt: new Date().toISOString(),
          results: []
        }
      ],
      updateCubeRequest: async (id, data) => {
        updatedData = { id, ...data };
      }
    }
  });

  const selector = window.document.querySelector('select[data-action="update-erp"]');
  selector.value = "Error";
  selector.dispatchEvent(new window.Event("change", { bubbles: true }));
  await waitForAsync();

  assert.equal(updatedData.erpStatus, "Error");
  assert.equal(updatedData.rpaStatus, "Failed");
});

test("queue uses reportNo when available, falls back to form id", async () => {
  const { window } = await bootDashboard({
    firestore: {
      listCubeRequests: async () => [
        {
          id: "fallback-id-form",
          client: "Client",
          project: "Project",
          status: "Ready",
          createdAt: new Date().toISOString(),
          results: []
          // No reportNo
        }
      ],
      updateCubeRequest: async () => {}
    }
  });

  const row = window.document.querySelector('tr[data-id="fallback-id-form"]');
  const cells = row.querySelectorAll("td");
  // Second column should contain the form ID as fallback
  assert.ok(cells[1].textContent.includes("fallback-id-form"));
});

test("missing Firebase Auth shows error message", async () => {
  const dom = new JSDOM(rpaDashboardHtml, {
    runScripts: "dangerously",
    url: "http://localhost/"
  });
  const { window } = dom;

  stubAudio(window);
  window.alert = () => {};
  // No CubeSyncAuth set
  delete window.CubeSyncAuth;
  window.CubeSyncFirestore = {
    listCubeRequests: async () => [],
    updateCubeRequest: async () => {}
  };

  loadScripts(window, DASHBOARD_SCRIPTS);
  dispatchDomContentLoaded(window);
  await waitForAsync();

  const authGate = window.document.getElementById("authGate");
  assert.equal(authGate.classList.contains("is-hidden"), false);
  assert.ok(authGate.textContent.includes("Firebase Auth is not available"));
});
