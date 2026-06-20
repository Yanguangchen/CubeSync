const { JSDOM } = require("jsdom");
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const barcodeJs = fs.readFileSync("barcode.js", "utf8");
const formDataJs = fs.readFileSync("cubesync-form-data.js", "utf8");
const exportJs = fs.readFileSync("cubesync-export.js", "utf8");
const rpaDashboardJs = fs.readFileSync("rpa-dashboard.js", "utf8");
const rpaViewJs = fs.readFileSync("rpa-view.js", "utf8");
const rpaDashboardHtml = fs.readFileSync("rpa-dashboard.html", "utf8");
const rpaViewHtml = fs.readFileSync("rpa-view.html", "utf8");

function stubAudio(window) {
  window.HTMLMediaElement.prototype.play = () => Promise.resolve();
}

test("rpa-dashboard.js handles unauthorized user", async () => {
  const dom = new JSDOM(rpaDashboardHtml, {
    runScripts: "dangerously",
    url: "http://localhost/"
  });
  const { window } = dom;
  stubAudio(window);

  let signedOut = false;
  const mockAuth = {
    onAuthChange: (cb) => cb({ email: "unauthorized@gmail.com" }),
    isAllowedUser: () => false,
    currentUser: () => ({ email: "unauthorized@gmail.com" }),
    signOutUser: async () => { signedOut = true; }
  };

  window.CubeSyncAuth = mockAuth;
  window.CubeSyncFirestore = { listCubeRequests: async () => [] };

  const scripts = [barcodeJs, formDataJs, exportJs, rpaDashboardJs];
  scripts.forEach(js => {
    const s = window.document.createElement("script");
    s.textContent = js;
    window.document.head.appendChild(s);
  });

  const event = window.document.createEvent("Event");
  event.initEvent("DOMContentLoaded", true, true);
  window.document.dispatchEvent(event);

  await new Promise(resolve => setTimeout(resolve, 50));

  const authGate = window.document.getElementById("authGate");
  const dashboardShell = window.document.getElementById("dashboardShell");
  
  assert.strictEqual(authGate.classList.contains("is-hidden"), false, "Auth gate should be visible");
  assert.strictEqual(dashboardShell.classList.contains("is-hidden"), true, "Dashboard should be hidden");
  assert.match(authGate.innerHTML, /unauthorized@gmail.com/);
  assert.strictEqual(signedOut, true, "Should have signed out the unauthorized user");
});

test("rpa-dashboard.js handles Firestore load error", async () => {
  const dom = new JSDOM(rpaDashboardHtml, {
    runScripts: "dangerously",
    url: "http://localhost/"
  });
  const { window } = dom;
  stubAudio(window);

  window.CubeSyncAuth = {
    onAuthChange: (cb) => cb({ email: "rpa@rakmat.com.sg" }),
    isAllowedUser: () => true,
    currentUser: () => ({ email: "rpa@rakmat.com.sg" })
  };
  window.CubeSyncFirestore = {
    listCubeRequests: async () => { throw new Error("Firestore Timeout"); }
  };

  const scripts = [barcodeJs, formDataJs, exportJs, rpaDashboardJs];
  scripts.forEach(js => {
    const s = window.document.createElement("script");
    s.textContent = js;
    window.document.head.appendChild(s);
  });

  const event = window.document.createEvent("Event");
  event.initEvent("DOMContentLoaded", true, true);
  window.document.dispatchEvent(event);

  await new Promise(resolve => setTimeout(resolve, 100));

  const list = window.document.getElementById("queueList");
  assert.match(list.innerHTML, /Firestore Timeout/);
});

test("rpa-dashboard.js updates ERP status", async () => {
  const dom = new JSDOM(rpaDashboardHtml, {
    runScripts: "dangerously",
    url: "http://localhost/"
  });
  const { window } = dom;
  stubAudio(window);

  window.CubeSyncAuth = {
    onAuthChange: (cb) => cb({ email: "rpa@rakmat.com.sg" }),
    isAllowedUser: () => true,
    currentUser: () => ({ email: "rpa@rakmat.com.sg" })
  };

  let updatedId = null;
  let updatedData = null;
  window.CubeSyncFirestore = {
    listCubeRequests: async () => [
      { id: "test-1", reportNo: "TEST-1", client: "Client", internalDate: new Date().toISOString() }
    ],
    updateCubeRequest: async (id, data) => {
      updatedId = id;
      updatedData = data;
    }
  };

  const scripts = [barcodeJs, formDataJs, exportJs, rpaDashboardJs];
  scripts.forEach(js => {
    const s = window.document.createElement("script");
    s.textContent = js;
    window.document.head.appendChild(s);
  });

  const event = window.document.createEvent("Event");
  event.initEvent("DOMContentLoaded", true, true);
  window.document.dispatchEvent(event);

  await new Promise(resolve => setTimeout(resolve, 100));

  const selector = window.document.querySelector("select[data-action='update-erp']");
  assert.ok(selector, "ERP selector should exist");
  
  selector.value = "Success";
  const changeEvent = window.document.createEvent("HTMLEvents");
  changeEvent.initEvent("change", true, true);
  selector.dispatchEvent(changeEvent);

  await new Promise(resolve => setTimeout(resolve, 50));

  assert.strictEqual(updatedId, "test-1");
  assert.strictEqual(updatedData.erpStatus, "Success");
  assert.strictEqual(updatedData.rpaStatus, "Submitted to ERP");
});

test("rpa-view.js handles missing record", async () => {
  const dom = new JSDOM(rpaViewHtml, {
    runScripts: "dangerously",
    url: "http://localhost/?id=missing-id"
  });
  const { window } = dom;

  window.CubeSyncFirestore = {
    getCubeRequest: async () => null
  };

  const scripts = [barcodeJs, formDataJs, rpaViewJs];
  scripts.forEach(js => {
    const s = window.document.createElement("script");
    s.textContent = js;
    window.document.head.appendChild(s);
  });

  const event = window.document.createEvent("Event");
  event.initEvent("DOMContentLoaded", true, true);
  window.document.dispatchEvent(event);

  await new Promise(resolve => setTimeout(resolve, 100));

  const message = window.document.getElementById("viewMessage");
  assert.match(message.textContent, /Form not found in Firestore/);
});

test("rpa-view.js toggles disable status", async () => {
  const dom = new JSDOM(rpaViewHtml, {
    runScripts: "dangerously",
    url: "http://localhost/?id=toggle-id"
  });
  const { window } = dom;

  let updatedData = null;
  window.CubeSyncFirestore = {
    getCubeRequest: async (id) => ({
      id,
      reportNo: "TOGGLE-1",
      rpaStatus: "Ready for Bot"
    }),
    updateCubeRequest: async (id, data) => {
      updatedData = data;
    }
  };

  const scripts = [barcodeJs, formDataJs, rpaViewJs];
  scripts.forEach(js => {
    const s = window.document.createElement("script");
    s.textContent = js;
    window.document.head.appendChild(s);
  });

  const event = window.document.createEvent("Event");
  event.initEvent("DOMContentLoaded", true, true);
  window.document.dispatchEvent(event);

  await new Promise(resolve => setTimeout(resolve, 100));

  const btnDisable = window.document.getElementById("btnDisable");
  assert.strictEqual(btnDisable.textContent, "Disable RPA");
  
  btnDisable.click();

  await new Promise(resolve => setTimeout(resolve, 50));

  assert.strictEqual(updatedData.rpaStatus, "Disabled");
  assert.strictEqual(btnDisable.textContent, "Enable RPA");
});

