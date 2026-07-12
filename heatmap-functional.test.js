const { JSDOM } = require("jsdom");
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const formDataJs = fs.readFileSync("cubesync-form-data.js", "utf8");
const heatmapJs = fs.readFileSync("cubesync-heatmap.js", "utf8");
const metricsJs = fs.readFileSync("cubesync-metrics.js", "utf8");
const metricsPageJs = fs.readFileSync("metrics-page.js", "utf8");
const html = fs.readFileSync("metrics.html", "utf8");

// June 2026: the 1st is a Monday, so the 22nd is also a Monday and the 24th a
// Wednesday. Jan 10 2026 is a Saturday. These anchor deterministic buckets.
// Mirror real Firestore data: a Timestamp is a duck-typed object exposing
// toMillis()/toDate(), not a JS Date. (A Date would also fail an
// `instanceof Date` check here because the dashboard code runs inside the
// jsdom realm, a different Date constructor than this test's.)
const ts = (date) => ({ toMillis: () => date.getTime(), toDate: () => date });

const MON_A = ts(new Date(2026, 5, 22, 9, 30)); // Monday 09:xx
const MON_B = ts(new Date(2026, 5, 22, 9, 45)); // Monday 09:xx
const WED_C = ts(new Date(2026, 5, 24, 14, 0)); // Wednesday 14:00
const SAT_D = ts(new Date(2026, 0, 10, 16, 0)); // Saturday 16:00 (January)

function bootDashboard(records, storeOverrides) {
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost/" });
  const { window } = dom;
  window.alert = () => {};
  window.confirm = () => true;

  window.CubeSyncAuth = {
    onAuthChange: (cb) => cb({ email: "test@rakmat.com.sg" }),
    isAllowedUser: () => true,
    currentUser: () => ({ email: "test@rakmat.com.sg" })
  };
  window.CubeSyncFirestore = Object.assign({
    listCubeRequests: async () => records,
    updateCubeRequest: async () => {},
    deleteCubeRequest: async () => {}
  }, storeOverrides || {});

  [formDataJs, heatmapJs, metricsJs, metricsPageJs].forEach((js) => {
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

function cellCounts(window) {
  return Array.from(window.document.querySelectorAll("#heatmapGrid .heatmap-cell .heatmap-cell-count"))
    .map((node) => Number(node.textContent));
}

function clickMode(window, mode) {
  window.document.querySelector(`[data-heatmap-mode="${mode}"]`).click();
}

const SAMPLE = [
  { id: "a", reportNo: "A", client: "Alpha", project: "P", status: "Ready", submittedAt: MON_A },
  { id: "b", reportNo: "B", client: "Alpha", project: "P", status: "Ready", submittedAt: MON_B },
  { id: "c", reportNo: "C", client: "Beta", project: "P", status: "Draft", submittedAt: WED_C },
  { id: "d", reportNo: "D", client: "Alpha", project: "P", status: "Ready", submittedAt: SAT_D }
];

/* ----------------------------------------------------------------------- *
 * Trial badge
 * ----------------------------------------------------------------------- */

test("metrics dashboard renders usage, workload, automation, review totals, and a TRIAL badge", async () => {
  const window = bootDashboard([
    { id: "1", reportNo: "REQ-1", submittedAt: MON_A, erpStatus: "Success" },
    { id: "2", reportNo: "REQ-2", submittedAt: MON_B, customFields: ["supplier"] },
    { id: "3", reportNo: "REQ-3", submittedAt: WED_C, rpaStatus: "Failed" }
  ]);
  await settle();

  const title = window.document.getElementById("metricsTitle");
  assert.match(title.textContent, /TRIAL/);
  const badge = window.document.querySelector(".metrics-panel .trial-badge");
  assert.ok(badge, "expected a .trial-badge inside the metrics panel");
  assert.equal(badge.textContent.trim(), "TRIAL");

  const metricsGrid = window.document.getElementById("metricsGrid");
  assert.match(metricsGrid.textContent, /Total records\s*3/);
  assert.match(metricsGrid.textContent, /Processed\s*1/);
  assert.match(metricsGrid.textContent, /Manual review\s*2/);
  assert.match(metricsGrid.textContent, /Peak period\s*9 AM/);
  assert.match(metricsGrid.textContent, /Expected tomorrow/);

  const insight = window.document.getElementById("workloadInsight");
  assert.match(insight.textContent, /Predictive workload insight/);
  assert.match(insight.textContent, /Expected tomorrow:/);
  assert.ok(insight.querySelector(".workload-chart"), "expected predictive workload line chart");

  const summary = window.document.getElementById("metricsSummary");
  assert.match(summary.textContent, /3 records in view/);
});

test("heatmap panel shows a TRIAL badge beside the title", async () => {
  const window = bootDashboard(SAMPLE);
  await settle();

  const title = window.document.getElementById("heatmapTitle");
  assert.match(title.textContent, /TRIAL/);
  const badge = window.document.querySelector(".heatmap-panel .trial-badge");
  assert.ok(badge, "expected a .trial-badge inside the heatmap panel");
  assert.equal(badge.textContent.trim(), "TRIAL");
});

/* ----------------------------------------------------------------------- *
 * Rendering per mode
 * ----------------------------------------------------------------------- */

test("heatmap defaults to weekly with 7 cells and the correct day counts", async () => {
  const window = bootDashboard(SAMPLE);
  await settle();

  const counts = cellCounts(window);
  assert.equal(counts.length, 7);
  assert.equal(counts[1], 2); // Monday: A + B
  assert.equal(counts[3], 1); // Wednesday: C
  assert.equal(counts[6], 1); // Saturday: D
  assert.equal(counts[0], 0); // Sunday: none

  const grid = window.document.getElementById("heatmapGrid");
  assert.ok(grid.classList.contains("heatmap-grid-weekly"));
});

test("switching to Daily renders 24 hourly cells with time-of-day counts", async () => {
  const window = bootDashboard(SAMPLE);
  await settle();

  clickMode(window, "daily");
  const counts = cellCounts(window);
  assert.equal(counts.length, 24);
  assert.equal(counts[9], 2); // 9 AM: A + B
  assert.equal(counts[14], 1); // 2 PM: C
  assert.equal(counts[16], 1); // 4 PM: D

  const grid = window.document.getElementById("heatmapGrid");
  assert.ok(grid.classList.contains("heatmap-grid-daily"));
  const labels = Array.from(window.document.querySelectorAll("#heatmapGrid .heatmap-cell-label"))
    .map((n) => n.textContent);
  assert.equal(labels[0], "12a");
  assert.equal(labels[9], "9a");
  assert.equal(labels[14], "2p");
});

test("switching to Yearly renders 12 monthly cells with month counts", async () => {
  const window = bootDashboard(SAMPLE);
  await settle();

  clickMode(window, "yearly");
  const counts = cellCounts(window);
  assert.equal(counts.length, 12);
  assert.equal(counts[0], 1); // January: D
  assert.equal(counts[5], 3); // June: A + B + C

  const grid = window.document.getElementById("heatmapGrid");
  assert.ok(grid.classList.contains("heatmap-grid-yearly"));
});

/* ----------------------------------------------------------------------- *
 * Busiest highlighting & summary
 * ----------------------------------------------------------------------- */

test("heatmap marks the busiest bucket and summarises it", async () => {
  const window = bootDashboard(SAMPLE);
  await settle();

  const busiest = window.document.querySelectorAll("#heatmapGrid .heatmap-cell.is-busiest");
  assert.equal(busiest.length, 1);
  assert.match(busiest[0].textContent, /Mon/);

  const summary = window.document.getElementById("heatmapSummary");
  assert.match(summary.textContent, /Busiest: Monday/);
  assert.match(summary.textContent, /2 of 4 submissions/);
});

test("heatmap summary reports an empty state when nothing matches", async () => {
  const window = bootDashboard([]);
  await settle();

  const summary = window.document.getElementById("heatmapSummary");
  assert.match(summary.textContent, /No submissions match/);
  assert.equal(window.document.querySelectorAll("#heatmapGrid .heatmap-cell.is-busiest").length, 0);
  assert.ok(cellCounts(window).every((count) => count === 0));
});

/* ----------------------------------------------------------------------- *
 * All records
 * ----------------------------------------------------------------------- */

test("metrics page heatmap analyses every record without dashboard filters", async () => {
  const window = bootDashboard(SAMPLE);
  await settle();

  // The dedicated metrics page has no status/today filters; the heatmap always
  // reflects the full submission history.
  const counts = cellCounts(window);
  assert.equal(counts.reduce((a, b) => a + b, 0), 4);
});

/* ----------------------------------------------------------------------- *
 * Activity leaderboard & daily completions
 * ----------------------------------------------------------------------- */

function isoHoursAgo(hours) {
  return new Date(Date.now() - (hours * 60 * 60 * 1000)).toISOString();
}

const READY_CHANGE = { field: "status", previousValue: "Draft", newValue: "Ready" };

test("activity leaderboard ranks editors and counts Ready promotions", async () => {
  const window = bootDashboard(SAMPLE, {
    listAllEditHistory: async () => [
      { id: "s1", requestId: "a", editedByEmail: "alice@rakmat.com.sg", editedByName: "Alice", createdAt: isoHoursAgo(1), changes: [READY_CHANGE] },
      { id: "s2", requestId: "b", editedByEmail: "alice@rakmat.com.sg", editedByName: "Alice", createdAt: isoHoursAgo(2), changes: [{ field: "quote", newValue: "Q" }] },
      { id: "s3", requestId: "c", editedByEmail: "bob@rakmat.com.sg", editedByName: "Bob", createdAt: isoHoursAgo(3), changes: [READY_CHANGE] }
    ]
  });
  await settle();

  const rows = Array.from(window.document.querySelectorAll("#leaderboardContent tbody tr"));
  assert.equal(rows.length, 2);
  assert.match(rows[0].textContent, /Alice/);
  assert.ok(rows[0].classList.contains("leaderboard-top"));
  assert.match(rows[1].textContent, /Bob/);

  const summary = window.document.getElementById("leaderboardSummary");
  assert.match(summary.textContent, /3 edit sessions/);
  assert.match(summary.textContent, /2 Ready promotions/);
});

test("daily completions chart counts today's Ready promotions once per request", async () => {
  const window = bootDashboard(SAMPLE, {
    listAllEditHistory: async () => [
      { id: "s1", requestId: "a", editedByEmail: "alice@rakmat.com.sg", createdAt: isoHoursAgo(1), changes: [READY_CHANGE] },
      // Re-promotion of the same request today counts once.
      { id: "s2", requestId: "a", editedByEmail: "alice@rakmat.com.sg", createdAt: isoHoursAgo(2), changes: [READY_CHANGE] },
      { id: "s3", requestId: "b", editedByEmail: "bob@rakmat.com.sg", createdAt: isoHoursAgo(3), changes: [READY_CHANGE] },
      // A plain edit is not a completion.
      { id: "s4", requestId: "c", editedByEmail: "bob@rakmat.com.sg", createdAt: isoHoursAgo(4), changes: [{ field: "quote", newValue: "Q" }] }
    ]
  });
  await settle();

  const chart = window.document.getElementById("completionsChart");
  assert.ok(chart.querySelector("svg.workload-chart"), "expected a completions line chart");

  const summary = window.document.getElementById("completionsSummary");
  assert.match(summary.textContent, /2 forms set to Ready in the last 28 days/);
  assert.match(summary.textContent, /2 today/);
});

test("activity panels explain when the collection-group rules are not deployed", async () => {
  const window = bootDashboard(SAMPLE, {
    listAllEditHistory: async () => {
      const error = new Error("Missing or insufficient permissions.");
      error.code = "permission-denied";
      throw error;
    }
  });
  await settle();

  const board = window.document.getElementById("leaderboardContent");
  assert.match(board.textContent, /Firestore rules/);
  const chart = window.document.getElementById("completionsChart");
  assert.match(chart.textContent, /Firestore rules/);
});

test("activity panels fall back gracefully when listAllEditHistory is unavailable", async () => {
  const window = bootDashboard(SAMPLE);
  await settle();

  const board = window.document.getElementById("leaderboardContent");
  assert.match(board.textContent, /require an updated firestore\.js/);
});

/* ----------------------------------------------------------------------- *
 * Mode-button state
 * ----------------------------------------------------------------------- */

test("active heatmap mode button reflects the current selection", async () => {
  const window = bootDashboard(SAMPLE);
  await settle();

  const weekly = window.document.querySelector('[data-heatmap-mode="weekly"]');
  const daily = window.document.querySelector('[data-heatmap-mode="daily"]');
  assert.ok(weekly.classList.contains("is-active"));

  daily.click();
  assert.ok(daily.classList.contains("is-active"));
  assert.equal(daily.getAttribute("aria-pressed"), "true");
  assert.ok(!weekly.classList.contains("is-active"));
  assert.equal(weekly.getAttribute("aria-pressed"), "false");
});
