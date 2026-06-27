const test = require("node:test");
const assert = require("node:assert/strict");

const {
  HEATMAP_MODES,
  toDate,
  resolveTimestamp,
  bucketLabels,
  buildHeatmap
} = require("./cubesync-heatmap");

// Build a form whose chosen timestamp field is a local Date. Using the local
// Date constructor keeps hour/day/month assertions deterministic regardless of
// the machine timezone the tests run in.
function formAt(date, field) {
  const key = field || "submittedAt";
  return { id: "x", [key]: date };
}

/* ----------------------------------------------------------------------- *
 * toDate — coerce assorted timestamp shapes into a Date (or null)
 * ----------------------------------------------------------------------- */

test("toDate passes through a Date instance", () => {
  const d = new Date(2026, 5, 24, 9, 30);
  assert.equal(toDate(d).getTime(), d.getTime());
});

test("toDate accepts a Date created in another realm (cross-realm safe)", () => {
  const vm = require("node:vm");
  const foreignDate = vm.runInNewContext("new Date(2026, 5, 24, 9, 30)");
  assert.ok(!(foreignDate instanceof Date), "precondition: foreign Date is not instanceof local Date");
  const parsed = toDate(foreignDate);
  assert.ok(parsed, "expected the foreign Date to be recognised");
  assert.equal(parsed.getHours(), 9);
});

test("toDate reads epoch milliseconds", () => {
  const d = new Date(2026, 5, 24, 9, 30);
  assert.equal(toDate(d.getTime()).getTime(), d.getTime());
});

test("toDate reads a Firestore Timestamp via toMillis()", () => {
  const d = new Date(2026, 5, 24, 9, 30);
  const ts = { toMillis: () => d.getTime() };
  assert.equal(toDate(ts).getTime(), d.getTime());
});

test("toDate reads a Firestore Timestamp via toDate()", () => {
  const d = new Date(2026, 5, 24, 9, 30);
  const ts = { toDate: () => d };
  assert.equal(toDate(ts).getTime(), d.getTime());
});

test("toDate reads a Firestore Timestamp via seconds", () => {
  const d = new Date(2026, 5, 24, 9, 30, 0);
  const ts = { seconds: Math.floor(d.getTime() / 1000) };
  assert.equal(toDate(ts).getTime(), Math.floor(d.getTime() / 1000) * 1000);
});

test("toDate parses an ISO date-time string", () => {
  const parsed = toDate("2026-06-24T09:30:00");
  assert.equal(parsed.getFullYear(), 2026);
  assert.equal(parsed.getMonth(), 5);
  assert.equal(parsed.getDate(), 24);
});

test("toDate returns null for empty, null or unparseable values", () => {
  assert.equal(toDate(null), null);
  assert.equal(toDate(undefined), null);
  assert.equal(toDate(""), null);
  assert.equal(toDate("not a date"), null);
  assert.equal(toDate({}), null);
  assert.equal(toDate(NaN), null);
  assert.equal(toDate(true), null); // non-object/number/string types
  assert.equal(toDate(Symbol("x")), null);
});

/* ----------------------------------------------------------------------- *
 * resolveTimestamp — pick the right field off a form
 * ----------------------------------------------------------------------- */

test("resolveTimestamp uses the explicit field when provided", () => {
  const d = new Date(2026, 5, 24, 9, 30);
  const form = { submittedAt: new Date(2020, 0, 1), updatedAt: d };
  assert.equal(resolveTimestamp(form, "updatedAt").getTime(), d.getTime());
});

test("resolveTimestamp falls back submittedAt -> createdAt -> updatedAt", () => {
  const sub = new Date(2026, 0, 1);
  const cre = new Date(2025, 0, 1);
  const upd = new Date(2024, 0, 1);
  assert.equal(resolveTimestamp({ submittedAt: sub, createdAt: cre, updatedAt: upd }).getTime(), sub.getTime());
  assert.equal(resolveTimestamp({ createdAt: cre, updatedAt: upd }).getTime(), cre.getTime());
  assert.equal(resolveTimestamp({ updatedAt: upd }).getTime(), upd.getTime());
});

test("resolveTimestamp returns null when no timestamp field resolves", () => {
  assert.equal(resolveTimestamp({ id: "x" }), null);
  assert.equal(resolveTimestamp(null), null);
});

/* ----------------------------------------------------------------------- *
 * bucketLabels — fixed-length label sets per mode
 * ----------------------------------------------------------------------- */

test("bucketLabels returns 24 hour labels for daily mode", () => {
  const labels = bucketLabels(HEATMAP_MODES.DAILY);
  assert.equal(labels.length, 24);
  assert.equal(labels[0], "12 AM");
  assert.equal(labels[9], "9 AM");
  assert.equal(labels[12], "12 PM");
  assert.equal(labels[13], "1 PM");
  assert.equal(labels[23], "11 PM");
});

test("bucketLabels returns 7 weekday labels (Sunday first) for weekly mode", () => {
  const labels = bucketLabels(HEATMAP_MODES.WEEKLY);
  assert.deepEqual(labels, [
    "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"
  ]);
});

test("bucketLabels returns 12 month labels for yearly mode", () => {
  const labels = bucketLabels(HEATMAP_MODES.YEARLY);
  assert.equal(labels.length, 12);
  assert.equal(labels[0], "January");
  assert.equal(labels[11], "December");
});

/* ----------------------------------------------------------------------- *
 * buildHeatmap — shape & defaults
 * ----------------------------------------------------------------------- */

test("buildHeatmap defaults to weekly mode with 7 buckets", () => {
  const result = buildHeatmap([]);
  assert.equal(result.mode, HEATMAP_MODES.WEEKLY);
  assert.equal(result.buckets.length, 7);
});

test("buildHeatmap falls back to weekly for an unknown mode", () => {
  const result = buildHeatmap([], { mode: "nonsense" });
  assert.equal(result.mode, HEATMAP_MODES.WEEKLY);
  assert.equal(result.buckets.length, 7);
});

test("buildHeatmap returns zeroed buckets, zero total and null busiest for empty input", () => {
  const result = buildHeatmap([], { mode: HEATMAP_MODES.DAILY });
  assert.equal(result.total, 0);
  assert.equal(result.max, 0);
  assert.equal(result.busiest, null);
  assert.equal(result.buckets.length, 24);
  assert.ok(result.buckets.every((b) => b.count === 0 && b.intensity === 0));
  assert.equal(result.buckets[0].label, "12 AM");
  assert.equal(result.buckets[0].key, 0);
});

test("buildHeatmap tolerates non-array input", () => {
  const result = buildHeatmap(null, { mode: HEATMAP_MODES.WEEKLY });
  assert.equal(result.total, 0);
  assert.equal(result.buckets.length, 7);
});

/* ----------------------------------------------------------------------- *
 * buildHeatmap — daily (time of day)
 * ----------------------------------------------------------------------- */

test("buildHeatmap buckets submissions by hour of day", () => {
  const forms = [
    formAt(new Date(2026, 5, 24, 9, 15)),
    formAt(new Date(2026, 5, 25, 9, 45)),
    formAt(new Date(2026, 5, 26, 14, 0))
  ];

  const result = buildHeatmap(forms, { mode: HEATMAP_MODES.DAILY });
  assert.equal(result.buckets[9].count, 2);
  assert.equal(result.buckets[14].count, 1);
  assert.equal(result.total, 3);
  assert.equal(result.max, 2);
});

/* ----------------------------------------------------------------------- *
 * buildHeatmap — weekly (day of week)
 * ----------------------------------------------------------------------- */

test("buildHeatmap buckets submissions by day of week", () => {
  // 2026-06-24 is a Wednesday (getDay() === 3); 2026-06-22 is a Monday.
  const forms = [
    formAt(new Date(2026, 5, 24, 10, 0)),
    formAt(new Date(2026, 5, 22, 10, 0)),
    formAt(new Date(2026, 5, 22, 16, 0))
  ];

  const result = buildHeatmap(forms, { mode: HEATMAP_MODES.WEEKLY });
  assert.equal(result.buckets[3].label, "Wednesday");
  assert.equal(result.buckets[3].count, 1);
  assert.equal(result.buckets[1].label, "Monday");
  assert.equal(result.buckets[1].count, 2);
});

/* ----------------------------------------------------------------------- *
 * buildHeatmap — yearly (month of year)
 * ----------------------------------------------------------------------- */

test("buildHeatmap buckets submissions by month of year", () => {
  const forms = [
    formAt(new Date(2026, 0, 5, 10, 0)),
    formAt(new Date(2026, 0, 20, 10, 0)),
    formAt(new Date(2026, 11, 1, 10, 0))
  ];

  const result = buildHeatmap(forms, { mode: HEATMAP_MODES.YEARLY });
  assert.equal(result.buckets[0].label, "January");
  assert.equal(result.buckets[0].count, 2);
  assert.equal(result.buckets[11].label, "December");
  assert.equal(result.buckets[11].count, 1);
});

/* ----------------------------------------------------------------------- *
 * buildHeatmap — intensity, busiest, robustness
 * ----------------------------------------------------------------------- */

test("buildHeatmap normalizes intensity to the busiest bucket (0..1)", () => {
  const forms = [
    formAt(new Date(2026, 5, 22, 10, 0)),
    formAt(new Date(2026, 5, 22, 11, 0)),
    formAt(new Date(2026, 5, 22, 12, 0)),
    formAt(new Date(2026, 5, 24, 10, 0))
  ];

  const result = buildHeatmap(forms, { mode: HEATMAP_MODES.WEEKLY });
  assert.equal(result.max, 3);
  assert.equal(result.buckets[1].intensity, 1); // Monday, 3 of 3
  assert.equal(result.buckets[3].intensity, 1 / 3); // Wednesday, 1 of 3
  assert.equal(result.buckets[0].intensity, 0); // Sunday, none
});

test("buildHeatmap reports the busiest bucket label and count", () => {
  const forms = [
    formAt(new Date(2026, 5, 22, 10, 0)),
    formAt(new Date(2026, 5, 22, 11, 0)),
    formAt(new Date(2026, 5, 24, 10, 0))
  ];

  const result = buildHeatmap(forms, { mode: HEATMAP_MODES.WEEKLY });
  assert.deepEqual(result.busiest, { key: 1, label: "Monday", count: 2 });
});

test("buildHeatmap ignores forms whose timestamp cannot be parsed", () => {
  const forms = [
    formAt(new Date(2026, 5, 22, 10, 0)),
    { id: "bad", submittedAt: "not a date" },
    { id: "missing" }
  ];

  const result = buildHeatmap(forms, { mode: HEATMAP_MODES.WEEKLY });
  assert.equal(result.total, 1);
});

test("buildHeatmap honours an explicit field option", () => {
  const forms = [
    { id: "1", submittedAt: new Date(2020, 0, 1, 0, 0), updatedAt: new Date(2026, 5, 24, 14, 0) }
  ];

  const result = buildHeatmap(forms, { mode: HEATMAP_MODES.DAILY, field: "updatedAt" });
  assert.equal(result.buckets[14].count, 1);
  assert.equal(result.total, 1);
});

test("buildHeatmap accepts Firestore-style timestamps end to end", () => {
  const wednesday = new Date(2026, 5, 24, 9, 0);
  const forms = [{ id: "1", submittedAt: { toMillis: () => wednesday.getTime() } }];

  const result = buildHeatmap(forms, { mode: HEATMAP_MODES.WEEKLY });
  assert.equal(result.buckets[3].count, 1);
});

test("buildHeatmap does not mutate the input array", () => {
  const forms = [formAt(new Date(2026, 5, 24, 9, 0))];
  const snapshot = forms.slice();
  buildHeatmap(forms, { mode: HEATMAP_MODES.DAILY });
  assert.deepEqual(forms, snapshot);
});
