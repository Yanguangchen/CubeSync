const { JSDOM } = require("jsdom");
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const barcodeJs = fs.readFileSync("barcode.js", "utf8");
const formDataJs = fs.readFileSync("cubesync-form-data.js", "utf8");
const filtersJs = fs.readFileSync("cubesync-dashboard-filters.js", "utf8");
const heatmapJs = fs.readFileSync("cubesync-heatmap.js", "utf8");
const notificationsJs = fs.readFileSync("cubesync-notifications.js", "utf8");
const dashboardJs = fs.readFileSync("dashboard.js", "utf8");
const html = fs.readFileSync("dashboard.html", "utf8");

// Install a Notification stub on the jsdom window (jsdom ships none). Returns
// the array of notifications the constructor was asked to create.
function installNotification(window, permission) {
  const created = [];
  function Notification(title, options) {
    created.push({ title, options });
  }
  Notification.permission = permission;
  Notification.requestPermission = async () => {
    Notification.permission = "granted";
    return "granted";
  };
  window.Notification = Notification;
  return created;
}

function installServiceWorker(window, registration) {
  Object.defineProperty(window.navigator, "serviceWorker", {
    value: { ready: Promise.resolve(registration), register: () => Promise.resolve(registration) },
    configurable: true
  });
}

function bootDashboard(records, configure) {
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost/" });
  const { window } = dom;
  window.alert = () => {};
  window.confirm = () => true;

  if (typeof configure === "function") {
    configure(window);
  }

  window.CubeSyncAuth = {
    onAuthChange: (cb) => cb({ email: "test@rakmat.com.sg" }),
    isAllowedUser: () => true,
    currentUser: () => ({ email: "test@rakmat.com.sg" })
  };
  window.CubeSyncFirestore = {
    listCubeRequests: async () => records,
    updateCubeRequest: async () => {},
    deleteCubeRequest: async () => {}
  };

  [barcodeJs, formDataJs, filtersJs, heatmapJs, notificationsJs, dashboardJs].forEach((js) => {
    const script = window.document.createElement("script");
    script.textContent = js;
    window.document.head.appendChild(script);
  });

  const event = window.document.createEvent("Event");
  event.initEvent("DOMContentLoaded", true, true);
  window.document.dispatchEvent(event);

  return window;
}

function settle() {
  return new Promise((resolve) => setTimeout(resolve, 50));
}

const SAMPLE = [{ id: "1", reportNo: "REPORT-1", client: "Acme", project: "Tower", status: "Ready" }];

test("notify button reflects granted permission", async () => {
  const window = bootDashboard(SAMPLE, (win) => installNotification(win, "granted"));
  await settle();

  const button = window.document.getElementById("notifyButton");
  assert.equal(button.hidden, false);
  assert.match(button.textContent, /Alerts on/);
  assert.equal(button.getAttribute("aria-pressed"), "true");
});

test("notify button is hidden when notifications are unsupported", async () => {
  const window = bootDashboard(SAMPLE, (win) => { delete win.Notification; });
  await settle();

  const button = window.document.getElementById("notifyButton");
  assert.equal(button.hidden, true);
});

test("notify button shows a blocked state when permission is denied", async () => {
  const window = bootDashboard(SAMPLE, (win) => installNotification(win, "denied"));
  await settle();

  const button = window.document.getElementById("notifyButton");
  assert.equal(button.hidden, false);
  assert.match(button.textContent, /blocked/i);
  assert.equal(button.disabled, true);
});

test("clicking the notify button requests permission and updates its label", async () => {
  const window = bootDashboard(SAMPLE, (win) => installNotification(win, "default"));
  await settle();

  const button = window.document.getElementById("notifyButton");
  assert.match(button.textContent, /Enable alerts/);

  button.click();
  await settle();

  assert.match(button.textContent, /Alerts on/);
  assert.equal(window.Notification.permission, "granted");
});

test("first load primes silently — no notification for the existing backlog", async () => {
  const shown = [];
  const registration = {
    showNotification: (title, options) => { shown.push({ title, options }); return Promise.resolve(); }
  };
  let created;
  bootDashboard(SAMPLE, (win) => {
    created = installNotification(win, "granted");
    installServiceWorker(win, registration);
  });
  await settle();
  await settle();

  assert.equal(shown.length, 0, "service worker showNotification must not fire on the first load");
  assert.equal(created.length, 0, "Notification constructor must not fire on the first load");
});
