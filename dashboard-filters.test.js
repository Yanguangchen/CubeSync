const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseDateKey,
  currentIsoDate,
  collectFilterOptions,
  applyDashboardFilters
} = require("./cubesync-dashboard-filters");

function form(overrides) {
  return Object.assign(
    {
      id: "x",
      reportNo: "R",
      client: "",
      project: "",
      grade: "",
      status: "Ready",
      updatedAt: "",
      raw: {}
    },
    overrides
  );
}

/* ----------------------------------------------------------------------- *
 * parseDateKey
 * ----------------------------------------------------------------------- */

test("parseDateKey reads ISO (YYYY-MM-DD) dates into a comparable key", () => {
  assert.equal(parseDateKey("2026-06-24"), 20260624);
  assert.equal(parseDateKey("2026/06/24"), 20260624);
});

test("parseDateKey reads day-first (DD/MM/YYYY) dates into a comparable key", () => {
  assert.equal(parseDateKey("24/06/2026"), 20260624);
  assert.equal(parseDateKey("24-06-2026"), 20260624);
});

test("parseDateKey returns NaN for empty or unparseable values", () => {
  assert.ok(Number.isNaN(parseDateKey("")));
  assert.ok(Number.isNaN(parseDateKey(null)));
  assert.ok(Number.isNaN(parseDateKey("not a date")));
});

/* ----------------------------------------------------------------------- *
 * collectFilterOptions
 * ----------------------------------------------------------------------- */

test("collectFilterOptions returns distinct, trimmed, sorted client and project values", () => {
  const forms = [
    form({ client: "Beta Co", project: "Tower" }),
    form({ client: "Alpha Co", project: "Bridge" }),
    form({ client: "  Beta Co  ", project: "Tower" })
  ];

  const options = collectFilterOptions(forms);
  assert.deepEqual(options.clients, ["Alpha Co", "Beta Co"]);
  assert.deepEqual(options.projects, ["Bridge", "Tower"]);
});

test("collectFilterOptions de-duplicates case-insensitively and drops blanks", () => {
  const forms = [
    form({ client: "Acme", project: "" }),
    form({ client: "acme", project: "  " }),
    form({ client: "", project: "Site A" })
  ];

  const options = collectFilterOptions(forms);
  assert.equal(options.clients.length, 1);
  assert.equal(options.clients[0], "Acme");
  assert.deepEqual(options.projects, ["Site A"]);
});

test("collectFilterOptions tolerates non-array input", () => {
  assert.deepEqual(collectFilterOptions(null), { clients: [], projects: [] });
});

/* ----------------------------------------------------------------------- *
 * applyDashboardFilters — filtering
 * ----------------------------------------------------------------------- */

test("applyDashboardFilters filters by client (case-insensitive exact match)", () => {
  const forms = [
    form({ id: "1", client: "Alpha Co" }),
    form({ id: "2", client: "Beta Co" })
  ];

  const result = applyDashboardFilters(forms, { client: "alpha co" });
  assert.deepEqual(result.map((f) => f.id), ["1"]);
});

test("applyDashboardFilters filters by project", () => {
  const forms = [
    form({ id: "1", project: "Tower" }),
    form({ id: "2", project: "Bridge" })
  ];

  const result = applyDashboardFilters(forms, { project: "Bridge" });
  assert.deepEqual(result.map((f) => f.id), ["2"]);
});

test("applyDashboardFilters treats 'all' and empty as no filter", () => {
  const forms = [form({ id: "1", client: "A" }), form({ id: "2", client: "B" })];
  assert.equal(applyDashboardFilters(forms, { client: "all" }).length, 2);
  assert.equal(applyDashboardFilters(forms, { client: "" }).length, 2);
  assert.equal(applyDashboardFilters(forms, {}).length, 2);
});

test("applyDashboardFilters combines client, project, status and search", () => {
  const forms = [
    form({ id: "1", client: "Alpha", project: "Tower", status: "Ready", reportNo: "R-1" }),
    form({ id: "2", client: "Alpha", project: "Bridge", status: "Ready", reportNo: "R-2" }),
    form({ id: "3", client: "Alpha", project: "Tower", status: "Draft", reportNo: "R-3" })
  ];

  const result = applyDashboardFilters(forms, {
    client: "Alpha",
    project: "Tower",
    status: "Ready",
    search: "r-1"
  });
  assert.deepEqual(result.map((f) => f.id), ["1"]);
});

test("applyDashboardFilters search still matches barcodes in raw.results", () => {
  const forms = [
    form({ id: "1", raw: { results: [{ barcode: "REPORT-001-T-009" }] } }),
    form({ id: "2", raw: { results: [{ barcode: "OTHER-123" }] } })
  ];

  const result = applyDashboardFilters(forms, { search: "t-009" });
  assert.deepEqual(result.map((f) => f.id), ["1"]);
});

/* ----------------------------------------------------------------------- *
 * applyDashboardFilters — sorting
 * ----------------------------------------------------------------------- */

test("applyDashboardFilters sorts by date newest-first by default", () => {
  const forms = [
    form({ id: "old", updatedAt: "2026-01-01" }),
    form({ id: "new", updatedAt: "2026-12-31" }),
    form({ id: "mid", updatedAt: "2026-06-15" })
  ];

  const result = applyDashboardFilters(forms, {});
  assert.deepEqual(result.map((f) => f.id), ["new", "mid", "old"]);
});

test("applyDashboardFilters sorts ascending when sort=date-asc", () => {
  const forms = [
    form({ id: "new", updatedAt: "2026-12-31" }),
    form({ id: "old", updatedAt: "2026-01-01" })
  ];

  const result = applyDashboardFilters(forms, { sort: "date-asc" });
  assert.deepEqual(result.map((f) => f.id), ["old", "new"]);
});

test("applyDashboardFilters sorts mixed date formats correctly", () => {
  const forms = [
    form({ id: "a", updatedAt: "01/01/2026" }),
    form({ id: "b", updatedAt: "2026-06-15" })
  ];

  const result = applyDashboardFilters(forms, { sort: "date-desc" });
  assert.deepEqual(result.map((f) => f.id), ["b", "a"]);
});

test("applyDashboardFilters sorts undated forms last (newest-first)", () => {
  const forms = [
    form({ id: "none", updatedAt: "" }),
    form({ id: "dated", updatedAt: "2026-06-15" })
  ];

  const result = applyDashboardFilters(forms, { sort: "date-desc" });
  assert.deepEqual(result.map((f) => f.id), ["dated", "none"]);
});

/* ----------------------------------------------------------------------- *
 * applyDashboardFilters — today only
 * ----------------------------------------------------------------------- */

test("currentIsoDate formats a date as YYYY-MM-DD", () => {
  assert.equal(currentIsoDate(new Date(2026, 5, 24)), "2026-06-24");
  assert.equal(currentIsoDate(new Date(2026, 0, 5)), "2026-01-05");
});

test("applyDashboardFilters keeps only forms dated today when todayOnly is set", () => {
  const forms = [
    form({ id: "today", updatedAt: "2026-06-24" }),
    form({ id: "yesterday", updatedAt: "2026-06-23" }),
    form({ id: "today-2", updatedAt: "2026-06-24" })
  ];

  const result = applyDashboardFilters(forms, { todayOnly: true, today: "2026-06-24" });
  assert.deepEqual(result.map((f) => f.id).sort(), ["today", "today-2"]);
});

test("applyDashboardFilters matches today across mixed date formats", () => {
  const forms = [
    form({ id: "iso", updatedAt: "2026-06-24" }),
    form({ id: "dayfirst", updatedAt: "24/06/2026" }),
    form({ id: "other", updatedAt: "01/06/2026" })
  ];

  const result = applyDashboardFilters(forms, { todayOnly: true, today: "24/06/2026" });
  assert.deepEqual(result.map((f) => f.id).sort(), ["dayfirst", "iso"]);
});

test("applyDashboardFilters ignores the today filter when todayOnly is false", () => {
  const forms = [
    form({ id: "today", updatedAt: "2026-06-24" }),
    form({ id: "old", updatedAt: "2020-01-01" })
  ];

  assert.equal(applyDashboardFilters(forms, { todayOnly: false, today: "2026-06-24" }).length, 2);
});

test("applyDashboardFilters todayOnly composes with other facets", () => {
  const forms = [
    form({ id: "1", client: "Alpha", updatedAt: "2026-06-24" }),
    form({ id: "2", client: "Beta", updatedAt: "2026-06-24" }),
    form({ id: "3", client: "Alpha", updatedAt: "2026-06-23" })
  ];

  const result = applyDashboardFilters(forms, {
    todayOnly: true,
    today: "2026-06-24",
    client: "Alpha"
  });
  assert.deepEqual(result.map((f) => f.id), ["1"]);
});

test("applyDashboardFilters does not mutate the input array", () => {
  const forms = [
    form({ id: "old", updatedAt: "2026-01-01" }),
    form({ id: "new", updatedAt: "2026-12-31" })
  ];
  const snapshot = forms.map((f) => f.id);

  applyDashboardFilters(forms, { sort: "date-desc" });
  assert.deepEqual(forms.map((f) => f.id), snapshot);
});
