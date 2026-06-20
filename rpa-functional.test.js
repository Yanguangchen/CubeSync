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
const DASHBOARD_SCRIPTS = [barcodeJs, formDataJs, exportJs, rpaDashboardJs];
const VIEW_SCRIPTS = [barcodeJs, formDataJs, rpaViewJs];

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

async function bootView({ url = "http://localhost/?id=rpa-view-1", firestore } = {}) {
  const dom = new JSDOM(rpaViewHtml, {
    runScripts: "dangerously",
    url
  });
  const { window } = dom;

  window.CubeSyncFirestore = firestore;

  loadScripts(window, VIEW_SCRIPTS);
  dispatchDomContentLoaded(window);
  await waitForAsync();

  return { dom, window };
}

function getTodaySgt() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function getSGTDate(date) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = formatter.formatToParts(date);
  const day = parts.find((part) => part.type === "day").value;
  const month = parts.find((part) => part.type === "month").value;
  const year = parts.find((part) => part.type === "year").value;
  return `${year}-${month}-${day}`;
}

test("rpa-dashboard.js handles auth and loads queue", async () => {
  const mockFirestore = {
    listCubeRequests: async () => [
      {
        id: "rpa-1",
        reportNo: "RPA-001",
        client: "Client RPA",
        project: "Project RPA",
        status: "Ready",
        internalDate: new Date().toISOString(),
        results: [
          {
            setNo: 1,
            specimenRef: "T-001",
            barcode: "BC-RPA-001",
            dateOfTest: "2026-06-17",
            age: 7
          }
        ]
      },
      {
        id: "rpa-2",
        reportNo: "RPA-OLD",
        client: "Old Client",
        project: "Old Project",
        status: "Ready",
        internalDate: "2020-01-01T00:00:00+08:00",
        results: [
          {
            specimenRef: "T-OLD",
            barcode: "BC-OLD-001"
          }
        ]
      },
      {
        id: "rpa-disabled",
        reportNo: "RPA-DISABLED",
        client: "Disabled Client",
        project: "Disabled Project",
        status: "Ready",
        internalDate: new Date().toISOString(),
        rpaStatus: "Disabled",
        results: [
          {
            specimenRef: "T-DISABLED",
            barcode: "BC-DISABLED-001"
          }
        ]
      }
    ]
  };

  const { window } = await bootDashboard({ firestore: mockFirestore });

  const list = window.document.getElementById("queueList");
  assert.match(list.innerHTML, /RPA-001/);
  assert.match(list.innerHTML, /Client RPA/);
  assert.match(list.innerHTML, /RPA-DISABLED/);
  assert.match(list.innerHTML, /Disabled Client/);
  assert.doesNotMatch(list.innerHTML, /RPA-OLD/);

  let exported = null;
  window.CubeSyncExport.downloadFilesAsZip = (files, filename) => {
    exported = { files, filename };
  };

  const exportButton = window.document.getElementById("exportAllButton");
  assert.equal(exportButton.disabled, false);
  exportButton.click();

  assert.match(exported.filename, /^cubesync-rpa-test-data-\d{4}-\d{2}-\d{2}\.zip$/);
  assert.deepEqual(exported.files.map((file) => file.name), [
    "001-RPA-001.csv",
    "002-RPA-OLD.csv"
  ]);
  assert.match(
    exported.files[0].content,
    /1,,T-001,BC-RPA-001,,,,,7,2026-06-17,/
  );
  assert.match(exported.files[1].content, /,,T-OLD,BC-OLD-001,/);
  assert.doesNotMatch(JSON.stringify(exported.files), /RPA-DISABLED/);
  assert.doesNotMatch(JSON.stringify(exported.files), /BC-DISABLED-001/);
});

test("rpa-view.js renders form data and barcodes", async () => {
  const mockFirestore = {
    getCubeRequest: async (id) => ({
      id,
      reportNo: "VIEW-001",
      clientNameOnReport: "View Client",
      concreteGrade: "C50",
      results: [
        { specimenRef: "1", barcode: "BC-001" }
      ]
    })
  };

  const { window } = await bootView({ firestore: mockFirestore });

  const reportNo = window.document.getElementById("reportNoDisplay");
  assert.equal(reportNo.textContent, "VIEW-001");

  const grid = window.document.getElementById("formFieldsGrid");
  assert.match(grid.innerHTML, /View Client/);
  assert.match(grid.innerHTML, /C50/);

  const results = window.document.getElementById("resultsBody");
  assert.match(results.innerHTML, /BC-001/);
  assert.match(results.innerHTML, /<svg/); // Barcode rendered
});

test("rpa-dashboard.js date navigation defaults to today and handles button clicks", async () => {
  const mockFirestore = {
    listCubeRequests: async () => []
  };

  const { window } = await bootDashboard({ firestore: mockFirestore });

  const datePicker = window.document.getElementById("datePicker");
  const todayBtn = window.document.getElementById("todayBtn");
  const prevDay = window.document.getElementById("prevDay");

  const todaySGT = getTodaySgt();

  assert.equal(datePicker.value, todaySGT);
  assert.ok(todayBtn.classList.contains("active"));

  prevDay.click();
  assert.notEqual(datePicker.value, todaySGT);
  assert.ok(!todayBtn.classList.contains("active"));

  todayBtn.click();
  assert.equal(datePicker.value, todaySGT);
  assert.ok(todayBtn.classList.contains("active"));
});

test("rpa-dashboard.js only shows forms from the selected date", async () => {
  let authCallback = null;
  const firestore = {
    listCubeRequests: async () => []
  };

  const { window } = await bootDashboard({
    firestore,
    auth: createAllowedAuth((cb) => {
      authCallback = cb;
      cb({ email: "rpa@rakmat.com.sg" });
    })
  });

  const list = window.document.getElementById("queueList");
  const datePicker = window.document.getElementById("datePicker");
  const todaySGT = datePicker.value;

  const dYesterday = new Date(`${todaySGT}T12:00:00+08:00`);
  dYesterday.setDate(dYesterday.getDate() - 1);
  const yesterdaySGT = getSGTDate(dYesterday);

  const dTomorrow = new Date(`${todaySGT}T12:00:00+08:00`);
  dTomorrow.setDate(dTomorrow.getDate() + 1);
  const tomorrowSGT = getSGTDate(dTomorrow);

  firestore.listCubeRequests = async () => [
    { id: "today-1", reportNo: "TODAY-001", status: "Ready", internalDate: `${todaySGT}T10:00:00+08:00` },
    { id: "yesterday-1", reportNo: "YESTERDAY-001", status: "Ready", internalDate: `${yesterdaySGT}T10:00:00+08:00` },
    { id: "tomorrow-1", reportNo: "TOMORROW-001", status: "Ready", internalDate: `${tomorrowSGT}T10:00:00+08:00` }
  ];

  if (authCallback) authCallback({ email: "rpa@rakmat.com.sg" });
  await waitForAsync(100);

  assert.match(list.innerHTML, /TODAY-001/);
  assert.doesNotMatch(list.innerHTML, /YESTERDAY-001/);
  assert.doesNotMatch(list.innerHTML, /TOMORROW-001/);

  const prevDay = window.document.getElementById("prevDay");
  prevDay.click();
  await waitForAsync();

  assert.doesNotMatch(list.innerHTML, /TODAY-001/);
  assert.match(list.innerHTML, /YESTERDAY-001/);
  assert.doesNotMatch(list.innerHTML, /TOMORROW-001/);
});

test("rpa-dashboard.js daily queue groups forms by submission/creation date, not cast date (internalDate)", async () => {
  const fiveDaysAgo = new Date();
  fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
  const fiveDaysAgoSGT = getSGTDate(fiveDaysAgo);

  const firestore = {
    listCubeRequests: async () => [
      {
        id: "past-cast-but-submitted-today",
        reportNo: "TODAY-SUBMITTED",
        client: "Client SGT",
        project: "Project SGT",
        status: "Ready",
        internalDate: fiveDaysAgoSGT, // Cast date was 5 days ago
        createdAt: new Date().toISOString(), // Created/submitted today
        results: []
      }
    ]
  };

  const { window } = await bootDashboard({ firestore });
  const list = window.document.getElementById("queueList");

  // Since it was created/submitted today, it should show up in today's daily queue
  assert.match(list.innerHTML, /TODAY-SUBMITTED/);
});
