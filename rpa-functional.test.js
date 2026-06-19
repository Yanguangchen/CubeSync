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

test("rpa-dashboard.js handles auth and loads queue", async () => {
  const dom = new JSDOM(rpaDashboardHtml, {
    runScripts: "dangerously",
    url: "http://localhost/"
  });
  const { window } = dom;
  stubAudio(window);
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

  window.CubeSyncAuth = mockAuth;
  window.CubeSyncFirestore = mockFirestore;

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
  const dom = new JSDOM(rpaViewHtml, {
    runScripts: "dangerously",
    url: "http://localhost/?id=rpa-view-1"
  });
  const { window } = dom;

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

test("rpa-dashboard.js date navigation defaults to today and handles button clicks", async () => {
  const dom = new JSDOM(rpaDashboardHtml, {
    runScripts: "dangerously",
    url: "http://localhost/"
  });
  const { window } = dom;
  stubAudio(window);

  const mockAuth = {
    onAuthChange: (cb) => cb({ email: "rpa@rakmat.com.sg" }),
    isAllowedUser: () => true,
    currentUser: () => ({ email: "rpa@rakmat.com.sg" })
  };

  const mockFirestore = {
    listCubeRequests: async () => []
  };

  window.CubeSyncAuth = mockAuth;
  window.CubeSyncFirestore = mockFirestore;

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

  const datePicker = window.document.getElementById("datePicker");
  const todayBtn = window.document.getElementById("todayBtn");
  const prevDay = window.document.getElementById("prevDay");

  // Should default to today's date in SGT (YYYY-MM-DD)
  const todaySGT = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());

  assert.equal(datePicker.value, todaySGT);
  assert.ok(todayBtn.classList.contains("active"));

  // Go to previous day
  prevDay.click();
  assert.notEqual(datePicker.value, todaySGT);
  assert.ok(!todayBtn.classList.contains("active"));

  // Return to today
  todayBtn.click();
  assert.equal(datePicker.value, todaySGT);
  assert.ok(todayBtn.classList.contains("active"));
});

test("rpa-dashboard.js only shows forms from the selected date", async () => {
  const dom = new JSDOM(rpaDashboardHtml, {
    runScripts: "dangerously",
    url: "http://localhost/"
  });
  const { window } = dom;
  stubAudio(window);

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

  let authCallback = null;
  window.CubeSyncAuth = {
    onAuthChange: (cb) => { authCallback = cb; cb({ email: "rpa@rakmat.com.sg" }); },
    isAllowedUser: () => true,
    currentUser: () => ({ email: "rpa@rakmat.com.sg" })
  };
  
  window.CubeSyncFirestore = {
    listCubeRequests: async () => [] // Initial empty load
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

  await new Promise(resolve => setTimeout(resolve, 50));

  const list = window.document.getElementById("queueList");
  const datePicker = window.document.getElementById("datePicker");
  const todaySGT = datePicker.value;

  const dYesterday = new Date(`${todaySGT}T12:00:00+08:00`);
  dYesterday.setDate(dYesterday.getDate() - 1);
  const yesterdaySGT = getSGTDate(dYesterday);

  const dTomorrow = new Date(`${todaySGT}T12:00:00+08:00`);
  dTomorrow.setDate(dTomorrow.getDate() + 1);
  const tomorrowSGT = getSGTDate(dTomorrow);

  // Update mock to return forms with calculated dates
  window.CubeSyncFirestore.listCubeRequests = async () => [
    { id: "today-1", reportNo: "TODAY-001", internalDate: `${todaySGT}T10:00:00+08:00` },
    { id: "yesterday-1", reportNo: "YESTERDAY-001", internalDate: `${yesterdaySGT}T10:00:00+08:00` },
    { id: "tomorrow-1", reportNo: "TOMORROW-001", internalDate: `${tomorrowSGT}T10:00:00+08:00` }
  ];

  // Trigger reload by simulating auth change
  if (authCallback) authCallback({ email: "rpa@rakmat.com.sg" });
  
  await new Promise(resolve => setTimeout(resolve, 100));

  // Initially should only show today
  assert.match(list.innerHTML, /TODAY-001/);
  assert.doesNotMatch(list.innerHTML, /YESTERDAY-001/);
  assert.doesNotMatch(list.innerHTML, /TOMORROW-001/);

  // Switch to yesterday
  const prevDay = window.document.getElementById("prevDay");
  prevDay.click();
  
  await new Promise(resolve => setTimeout(resolve, 50));

  assert.doesNotMatch(list.innerHTML, /TODAY-001/);
  assert.match(list.innerHTML, /YESTERDAY-001/);
  assert.doesNotMatch(list.innerHTML, /TOMORROW-001/);
});
