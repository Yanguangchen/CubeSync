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

async function bootView({ url = "http://localhost/?id=rpa-view-1", firestore, beforeLoad } = {}) {
  const dom = new JSDOM(rpaViewHtml, {
    runScripts: "dangerously",
    url
  });
  const { window } = dom;

  window.CubeSyncFirestore = firestore;

  loadScripts(window, VIEW_SCRIPTS);
  if (beforeLoad) {
    beforeLoad(window);
  }
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

  assert.match(exported.filename, /^cubesync-rpa-\d{4}-\d{2}-\d{2}\.zip$/);
  // Only today's non-disabled form should be exported; the 2020 form is
  // filtered out by the viewed date and the Disabled form is excluded by rpaStatus.
  assert.deepEqual(exported.files.map((file) => file.name), [
    "001-RPA-001.csv"
  ]);
  assert.match(
    exported.files[0].content,
    /1,,T-001,BC-RPA-001,,,,,7,2026-06-17,/
  );
  assert.doesNotMatch(JSON.stringify(exported.files), /RPA-OLD/);
  assert.doesNotMatch(JSON.stringify(exported.files), /BC-OLD-001/);
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

test("rpa-view.js renders fallback aliases, default statuses, dates, and empty results", async () => {
  const mockFirestore = {
    getCubeRequest: async (id) => ({
      id,
      cubeJobNumber: "FALLBACK-001",
      client: "Fallback Client",
      projectCode: "ERP-FALLBACK",
      dateTimeSampled: "2026-06-24T10:00:00Z",
      submittedAt: { toDate: () => new Date("2026-06-24T02:00:00Z") },
      results: []
    })
  };

  const { window } = await bootView({ firestore: mockFirestore });

  assert.equal(window.document.getElementById("reportNoDisplay").textContent, "FALLBACK-001");
  assert.match(window.document.getElementById("submittedAtDisplay").textContent, /Submitted:/);
  assert.equal(window.document.getElementById("statusBadge").textContent, "Ready for Bot / ERP: Pending");
  assert.match(window.document.getElementById("formFieldsGrid").textContent, /Fallback Client/);
  assert.match(window.document.getElementById("formFieldsGrid").textContent, /ERP-FALLBACK/);
  assert.match(window.document.getElementById("formFieldsGrid").textContent, /FALLBACK-001/);
  assert.match(window.document.getElementById("formFieldsGrid").textContent, /6\/24\/2026|24\/0?6\/2026/);
  assert.match(window.document.getElementById("resultsBody").textContent, /No test result rows saved/);
});

test("rpa-view.js reports missing id and unavailable Firestore before fetching", async () => {
  let fetchCount = 0;
  const missingId = await bootView({
    url: "http://localhost/",
    firestore: {
      getCubeRequest: async () => {
        fetchCount += 1;
      }
    }
  });

  assert.equal(fetchCount, 0);
  assert.match(missingId.window.document.getElementById("viewMessage").textContent, /Missing Firestore document id/);

  const noFirestore = await bootView({
    firestore: undefined
  });

  assert.match(noFirestore.window.document.getElementById("viewMessage").textContent, /Firestore is not available/);
});

test("rpa-view.js escapes barcode rendering errors in result previews", async () => {
  const mockFirestore = {
    getCubeRequest: async () => ({
      reportNo: "BAD-BARCODE",
      results: [{ specimenRef: "1", barcode: "BAD-001" }]
    })
  };

  const { window } = await bootView({
    firestore: mockFirestore,
    beforeLoad(win) {
      win.CubeSyncBarcode = {
        renderBarcodeSvg() {
          throw new Error("<bad barcode>");
        }
      };
    }
  });

  const results = window.document.getElementById("resultsBody");
  assert.match(results.textContent, /<bad barcode>/);
  assert.equal(results.querySelector("bad"), null);
  assert.match(results.innerHTML, /&lt;bad barcode&gt;/);
});

test("rpa-view.js reports update failures when toggling RPA status", async () => {
  const mockFirestore = {
    getCubeRequest: async () => ({
      reportNo: "UPDATE-FAIL",
      rpaStatus: "Disabled"
    }),
    updateCubeRequest: async () => {
      throw new Error("Update denied");
    }
  };

  const { window } = await bootView({ firestore: mockFirestore });

  const btnDisable = window.document.getElementById("btnDisable");
  assert.equal(btnDisable.textContent, "Enable RPA");
  btnDisable.click();
  await waitForAsync();

  assert.match(window.document.getElementById("viewMessage").textContent, /Update denied/);
  assert.equal(window.document.getElementById("statusBadge").textContent, "Disabled / ERP: Pending");
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

// Updates are built inside the jsdom window; copy them into this realm so
// deepStrictEqual compares values rather than cross-realm prototypes.
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function multiSetRequest(extra) {
  return {
    id: "multi",
    reportNo: "MS-1",
    client: "Set Client",
    project: "Set Project",
    status: "Ready",
    createdAt: new Date().toISOString(),
    results: [
      { setNo: 1, specimenRef: "SET1-A", barcode: "BC-1A", age: 7, dateOfTest: "2026-06-25" },
      { setNo: 2, specimenRef: "SET2-A", barcode: "BC-2A", age: 28, dateOfTest: "2026-07-16" },
      { setNo: 2, specimenRef: "SET2-B", barcode: "BC-2B", age: 28, dateOfTest: "2026-07-16" }
    ],
    ...extra
  };
}

test("rpa-dashboard.js lists each set of a multi-set request as its own queue row", async () => {
  const { window } = await bootDashboard({
    firestore: {
      listCubeRequests: async () => [
        multiSetRequest({
          rpaSets: { 1: { rpaStatus: "Submitted to ERP", erpStatus: "Success" } }
        })
      ],
      updateCubeRequest: async () => {}
    }
  });

  const rows = Array.from(window.document.querySelectorAll("#queueList tr[data-id]"));
  assert.deepEqual(rows.map((row) => row.dataset.id), ["multi#set-1", "multi#set-2"]);
  assert.match(rows[0].textContent, /MS-1 · Set 1/);
  assert.match(rows[1].textContent, /MS-1 · Set 2/);
  rows.forEach((row) => assert.match(row.textContent, /Set Client/));
  assert.deepEqual(
    rows.map((row) => row.querySelector('select[data-action="update-erp"]').value),
    ["Success", "Pending"]
  );
  assert.equal(window.document.getElementById("disableAllButton").textContent, "Disable all RPA (2)");
});

test("rpa-dashboard.js changes the ERP status of one set without touching its siblings", async () => {
  const updates = [];
  const { window } = await bootDashboard({
    firestore: {
      listCubeRequests: async () => [multiSetRequest()],
      updateCubeRequest: async (id, data) => {
        updates.push({ id, data: plain(data) });
      }
    }
  });

  const selector = window.document.querySelector('select[data-id="multi#set-2"]');
  selector.value = "Processing";
  selector.dispatchEvent(new window.Event("change", { bubbles: true }));
  await waitForAsync();

  assert.deepEqual(updates, [{
    id: "multi",
    data: {
      "rpaSets.1": { rpaStatus: "Ready for Bot", erpStatus: "Pending" },
      "rpaSets.2": { rpaStatus: "In Progress", erpStatus: "Processing" },
      rpaStatus: "In Progress",
      erpStatus: "Processing"
    }
  }]);
});

// Applies Firestore-style dotted field paths so a mock store keeps what the
// dashboard wrote across reloads.
function applyDottedUpdate(record, data) {
  Object.entries(data).forEach(([path, value]) => {
    const parts = path.split(".");
    let target = record;
    parts.slice(0, -1).forEach((part) => {
      target[part] = target[part] || {};
      target = target[part];
    });
    target[parts[parts.length - 1]] = value;
  });
}

test("rpa-dashboard.js toggles and bulk-disables sets with one write per request", async () => {
  const updates = [];
  const records = {
    multi: multiSetRequest(),
    single: { id: "single", reportNo: "S-1", status: "Ready", createdAt: new Date().toISOString(), results: [] }
  };
  const { window } = await bootDashboard({
    firestore: {
      listCubeRequests: async () => Object.values(records).map(plain),
      updateCubeRequest: async (id, data) => {
        updates.push({ id, data: plain(data) });
        applyDottedUpdate(records[id], plain(data));
      }
    }
  });

  window.document.querySelector('button[data-action="toggle-disable"][data-id="multi#set-1"]').click();
  await waitForAsync();
  assert.deepEqual(updates.shift(), {
    id: "multi",
    data: {
      "rpaSets.1": { rpaStatus: "Disabled", erpStatus: "Pending" },
      "rpaSets.2": { rpaStatus: "Ready for Bot", erpStatus: "Pending" },
      rpaStatus: "Ready for Bot",
      erpStatus: "Pending"
    }
  });
  assert.match(
    window.document.querySelector('tr[data-id="multi#set-1"]').textContent,
    /Enable RPA/
  );
  assert.equal(window.document.getElementById("disableAllButton").textContent, "Disable all RPA (2)");

  window.confirm = () => true;
  window.document.getElementById("disableAllButton").click();
  await waitForAsync(100);

  assert.deepEqual(updates.sort((left, right) => left.id.localeCompare(right.id)), [
    { id: "multi", data: { "rpaSets.2.rpaStatus": "Disabled", rpaStatus: "Disabled", erpStatus: "Pending" } },
    { id: "single", data: { rpaStatus: "Disabled" } }
  ]);
});

test("rpa-dashboard.js exports one CSV per set with that set's rows and status", async () => {
  let exported = null;
  const { window } = await bootDashboard({
    firestore: {
      listCubeRequests: async () => [
        multiSetRequest({
          rpaSets: {
            1: { rpaStatus: "Submitted to ERP", erpStatus: "Success" },
            2: { rpaStatus: "Ready for Bot", erpStatus: "Pending" }
          }
        })
      ],
      updateCubeRequest: async () => {}
    }
  });

  window.CubeSyncExport.downloadFilesAsZip = (files) => {
    exported = files;
  };
  window.document.getElementById("exportAllButton").click();

  assert.equal(exported.length, 2);
  assert.match(exported[0].name, /MS-1-·-Set-1\.csv$/);
  assert.match(exported[0].content, /SET1-A/);
  assert.doesNotMatch(exported[0].content, /SET2-A/);
  assert.match(exported[0].content, /ERP status,Success/);
  assert.match(exported[1].content, /SET2-A/);
  assert.match(exported[1].content, /SET2-B/);
  assert.match(exported[1].content, /ERP status,Pending/);
});

test("rpa-view.js shows only the requested set and toggles that set's RPA status", async () => {
  const updates = [];
  const { window } = await bootView({
    url: "http://localhost/?id=multi&setNo=2",
    firestore: {
      getCubeRequest: async (id) => {
        assert.equal(id, "multi");
        return multiSetRequest({
          rpaSets: {
            1: { rpaStatus: "Submitted to ERP", erpStatus: "Success" },
            2: { rpaStatus: "Ready for Bot", erpStatus: "Pending" }
          }
        });
      },
      updateCubeRequest: async (id, data) => {
        updates.push({ id, data: plain(data) });
      }
    }
  });

  assert.equal(window.document.getElementById("reportNoDisplay").textContent, "MS-1 · Set 2");
  const results = window.document.getElementById("resultsBody");
  assert.equal(results.querySelectorAll("tr").length, 2);
  assert.match(results.innerHTML, /SET2-A/);
  assert.doesNotMatch(results.innerHTML, /SET1-A/);
  assert.equal(window.document.getElementById("statusBadge").textContent, "Ready for Bot / ERP: Pending");

  window.document.getElementById("btnDisable").click();
  await waitForAsync();

  assert.deepEqual(updates, [{
    id: "multi",
    data: { "rpaSets.2.rpaStatus": "Disabled", rpaStatus: "Submitted to ERP", erpStatus: "Success" }
  }]);
  assert.equal(window.document.getElementById("statusBadge").textContent, "Disabled / ERP: Pending");
  assert.equal(window.document.getElementById("btnDisable").textContent, "Enable RPA");
});

test("rpa-view.js reports a set that is no longer on the request", async () => {
  const { window } = await bootView({
    url: "http://localhost/?id=multi&setNo=9",
    firestore: { getCubeRequest: async () => multiSetRequest() }
  });

  assert.match(window.document.getElementById("viewMessage").textContent, /Set 9 is no longer on this request/);
});
