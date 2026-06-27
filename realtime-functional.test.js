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

// A controllable real-time store: it captures the watch callback so the test
// can push fresh snapshots, and counts unsubscribes.
function realtimeStore(initial) {
  const ref = { records: initial.slice(), cb: null, errCb: null, unsubscribed: 0 };
  return {
    ref,
    store: {
      watchCubeRequests(cb, errCb) {
        ref.cb = cb;
        ref.errCb = errCb;
        cb(ref.records);
        return () => { ref.unsubscribed += 1; ref.cb = null; };
      },
      listCubeRequests: async () => ref.records,
      updateCubeRequest: async () => {},
      deleteCubeRequest: async () => {}
    },
    push(records) {
      ref.records = records.slice();
      if (ref.cb) {
        ref.cb(ref.records);
      }
    },
    fail(error) {
      if (ref.errCb) {
        ref.errCb(error);
      }
    }
  };
}

function installNotification(window, permission) {
  const created = [];
  function Notification(title, options) { created.push({ title, options }); }
  Notification.permission = permission;
  Notification.requestPermission = async () => { Notification.permission = "granted"; return "granted"; };
  window.Notification = Notification;
  return created;
}

function bootDashboard(store, configure) {
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost/" });
  const { window } = dom;
  window.alert = () => {};
  window.confirm = () => true;

  let authCb = null;
  window.CubeSyncAuth = {
    onAuthChange: (cb) => { authCb = cb; cb({ email: "test@rakmat.com.sg" }); },
    isAllowedUser: () => true,
    currentUser: () => ({ email: "test@rakmat.com.sg" }),
    signOutUser: async () => {}
  };
  window.CubeSyncFirestore = store;

  if (typeof configure === "function") {
    configure(window);
  }

  [barcodeJs, formDataJs, filtersJs, heatmapJs, notificationsJs, dashboardJs].forEach((js) => {
    const script = window.document.createElement("script");
    script.textContent = js;
    window.document.head.appendChild(script);
  });

  const event = window.document.createEvent("Event");
  event.initEvent("DOMContentLoaded", true, true);
  window.document.dispatchEvent(event);

  return { window, signOut: () => authCb && authCb(null) };
}

function settle() {
  return new Promise((resolve) => setTimeout(resolve, 50));
}

test("dashboard renders the initial real-time snapshot", async () => {
  const rt = realtimeStore([{ id: "1", reportNo: "REPORT-1", client: "Acme", project: "P", status: "Ready" }]);
  const { window } = bootDashboard(rt.store);
  await settle();

  const list = window.document.getElementById("formList");
  assert.match(list.innerHTML, /REPORT-1/);
  assert.equal(rt.ref.cb !== null, true, "subscription is active");
});

test("a live snapshot adds a row without any reload action", async () => {
  const rt = realtimeStore([{ id: "1", reportNo: "REPORT-1", status: "Ready" }]);
  const { window } = bootDashboard(rt.store);
  await settle();

  const list = window.document.getElementById("formList");
  assert.doesNotMatch(list.innerHTML, /REPORT-2/);

  rt.push([
    { id: "1", reportNo: "REPORT-1", status: "Ready" },
    { id: "2", reportNo: "REPORT-2", status: "Ready" }
  ]);
  await settle();

  assert.match(list.innerHTML, /REPORT-2/);
});

test("a live new submission fires a system notification end to end", async () => {
  const shown = [];
  const registration = {
    showNotification: (title, options) => { shown.push({ title, options }); return Promise.resolve(); }
  };
  const rt = realtimeStore([{ id: "1", reportNo: "REPORT-1", status: "Ready" }]);
  bootDashboard(rt.store, (win) => {
    installNotification(win, "granted");
    Object.defineProperty(win.navigator, "serviceWorker", {
      value: { ready: Promise.resolve(registration), register: () => Promise.resolve(registration) },
      configurable: true
    });
  });
  await settle();
  await settle();

  assert.equal(shown.length, 0, "first snapshot primes silently");

  rt.push([
    { id: "1", reportNo: "REPORT-1", status: "Ready" },
    { id: "2", reportNo: "REPORT-2", client: "Beta", project: "Tower", status: "Ready" }
  ]);
  await settle();
  await settle();

  assert.equal(shown.length, 1, "new submission raises one notification");
  assert.match(shown[0].title, /New cube request submitted/);
  assert.match(shown[0].options.body, /REPORT-2/);
});

test("a live status change fires the matching lifecycle notification", async () => {
  const shown = [];
  const registration = {
    showNotification: (title, options) => { shown.push({ title, options }); return Promise.resolve(); }
  };
  const rt = realtimeStore([
    { id: "1", reportNo: "REPORT-1", status: "Ready", rpaStatus: "Ready for Bot", erpStatus: "Pending" }
  ]);
  bootDashboard(rt.store, (win) => {
    installNotification(win, "granted");
    Object.defineProperty(win.navigator, "serviceWorker", {
      value: { ready: Promise.resolve(registration), register: () => Promise.resolve(registration) },
      configurable: true
    });
  });
  await settle();
  await settle();

  assert.equal(shown.length, 0, "first snapshot primes silently");

  // The RPA bot finishes and submits the record to the ERP.
  rt.push([
    { id: "1", reportNo: "REPORT-1", status: "Ready", rpaStatus: "Submitted to ERP", erpStatus: "Success" }
  ]);
  await settle();
  await settle();

  const titles = shown.map((s) => s.title);
  assert.ok(titles.includes("RPA automation completed"), "RPA completion alert fired");
  assert.ok(titles.includes("Record successfully processed"), "ERP success alert fired");
});

test("signing out unsubscribes the listener", async () => {
  const rt = realtimeStore([{ id: "1", reportNo: "REPORT-1", status: "Ready" }]);
  const { signOut } = bootDashboard(rt.store);
  await settle();

  assert.equal(rt.ref.unsubscribed, 0);
  signOut();
  await settle();

  assert.equal(rt.ref.unsubscribed, 1, "listener torn down on sign-out");
});

test("a listener error surfaces the Firestore error state", async () => {
  const rt = realtimeStore([{ id: "1", reportNo: "REPORT-1", status: "Ready" }]);
  const { window } = bootDashboard(rt.store);
  await settle();

  rt.fail(new Error("permission-denied"));
  await settle();

  assert.match(window.document.getElementById("detailTitle").textContent, /Firestore error/);
});

test("falls back to a one-shot load when watchCubeRequests is absent", async () => {
  // Legacy store shape: only listCubeRequests.
  let listed = 0;
  const legacyStore = {
    listCubeRequests: async () => { listed += 1; return [{ id: "1", reportNo: "LEGACY-1", status: "Ready" }]; },
    updateCubeRequest: async () => {},
    deleteCubeRequest: async () => {}
  };
  const { window } = bootDashboard(legacyStore);
  await settle();

  assert.ok(listed >= 1, "one-shot loader used as fallback");
  assert.match(window.document.getElementById("formList").innerHTML, /LEGACY-1/);
});
