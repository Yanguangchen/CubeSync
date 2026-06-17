const { JSDOM } = require("jsdom");
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const barcodeJs = fs.readFileSync("barcode.js", "utf8");
const formDataJs = fs.readFileSync("cubesync-form-data.js", "utf8");
const rpaDashboardJs = fs.readFileSync("rpa-dashboard.js", "utf8");
const rpaViewJs = fs.readFileSync("rpa-view.js", "utf8");
const rpaDashboardHtml = fs.readFileSync("rpa-dashboard.html", "utf8");
const rpaViewHtml = fs.readFileSync("rpa-view.html", "utf8");

test("rpa-dashboard.js handles auth and loads queue", async () => {
  const dom = new JSDOM(rpaDashboardHtml, {
    runScripts: "dangerously",
    url: "http://localhost/"
  });
  const { window } = dom;
  window.alert = () => {};

  const mockAuth = {
    onAuthChange: (cb) => cb({ email: "rpa@rakmat.com.sg" }),
    isAllowedUser: () => true,
    currentUser: () => ({ email: "rpa@rakmat.com.sg" })
  };

  const mockFirestore = {
    listCubeRequests: async () => [
      {
        id: "rpa-1",
        reportNo: "RPA-001",
        client: "Client RPA",
        project: "Project RPA",
        internalDate: new Date().toISOString()
      }
    ]
  };

  window.CubeSyncAuth = mockAuth;
  window.CubeSyncFirestore = mockFirestore;

  const scripts = [barcodeJs, formDataJs, rpaDashboardJs];
  scripts.forEach(js => {
    const s = window.document.createElement("script");
    s.textContent = js;
    window.document.head.appendChild(s);
  });

  const event = window.document.createEvent("Event");
  event.initEvent("DOMContentLoaded", true, true);
  window.document.dispatchEvent(event);

  await new Promise(resolve => setTimeout(resolve, 50));

  const list = window.document.getElementById("queueList");
  assert.match(list.innerHTML, /RPA-001/);
  assert.match(list.innerHTML, /Client RPA/);
});

test("rpa-view.js renders form data and barcodes", async () => {
  const dom = new JSDOM(rpaViewHtml, {
    runScripts: "dangerously",
    url: "http://localhost/?id=rpa-view-1"
  });
  const { window } = dom;

  const mockFirestore = {
    getCubeRequest: async (id) => ({
      id,
      reportNo: "VIEW-001",
      client: "View Client",
      concreteGrade: "C50",
      results: [
        { testNumber: "1", barcode: "BC-001" }
      ]
    })
  };

  window.CubeSyncFirestore = mockFirestore;

  const scripts = [barcodeJs, formDataJs, rpaViewJs];
  scripts.forEach(js => {
    const s = window.document.createElement("script");
    s.textContent = js;
    window.document.head.appendChild(s);
  });

  const event = window.document.createEvent("Event");
  event.initEvent("DOMContentLoaded", true, true);
  window.document.dispatchEvent(event);

  await new Promise(resolve => setTimeout(resolve, 50));

  const reportNo = window.document.getElementById("reportNoDisplay");
  assert.equal(reportNo.textContent, "VIEW-001");

  const grid = window.document.getElementById("formFieldsGrid");
  assert.match(grid.innerHTML, /View Client/);
  assert.match(grid.innerHTML, /C50/);

  const results = window.document.getElementById("resultsBody");
  assert.match(results.innerHTML, /BC-001/);
  assert.match(results.innerHTML, /<svg/); // Barcode rendered
});
