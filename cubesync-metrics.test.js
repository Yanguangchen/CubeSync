const assert = require("node:assert/strict");
const test = require("node:test");

const { buildMetrics, resolveTimestamp } = require("./cubesync-metrics");

test("buildMetrics reports daily weekly monthly workload and operational totals", () => {
  const now = new Date("2026-06-27T12:00:00Z");
  const metrics = buildMetrics([
    {
      id: "today-1",
      submittedAt: "2026-06-27T09:00:00Z",
      erpStatus: "Success"
    },
    {
      id: "today-2",
      submittedAt: "2026-06-27T09:30:00Z",
      customFields: ["supplier"]
    },
    {
      id: "week-1",
      submittedAt: "2026-06-25T14:00:00Z",
      rpaStatus: "Failed"
    },
    {
      id: "month-1",
      submittedAt: "2026-06-03T10:00:00Z",
      status: "Archived"
    },
    {
      id: "older-1",
      submittedAt: "2026-05-20T08:00:00Z",
      rpaStatus: "Submitted to ERP"
    },
    {
      id: "undated-1",
      erpStatus: "Manual Review"
    }
  ], { now });

  assert.equal(metrics.totalRecords, 6);
  assert.equal(metrics.dailyCount, 2);
  assert.equal(metrics.weeklyCount, 3);
  assert.equal(metrics.monthlyCount, 4);
  assert.equal(metrics.processedCount, 3);
  assert.equal(metrics.manualReviewCount, 3);
  assert.equal(metrics.peakCount, 2);
  assert.deepEqual(metrics.peakPeriods.map((period) => period.label), ["9 AM"]);
  assert.equal(Number(metrics.averagePerDay.toFixed(2)), 0.13);
});

test("buildMetrics accepts normalized dashboard forms with raw records", () => {
  const metrics = buildMetrics([
    {
      id: "1",
      customFieldCount: 1,
      raw: {
        submittedAt: { seconds: Date.parse("2026-06-27T11:00:00Z") / 1000 },
        erpStatus: "Success"
      }
    }
  ], { now: "2026-06-27T12:00:00Z" });

  assert.equal(metrics.dailyCount, 1);
  assert.equal(metrics.processedCount, 1);
  assert.equal(metrics.manualReviewCount, 1);
});

test("resolveTimestamp falls back across CubeSync date fields", () => {
  assert.equal(resolveTimestamp({ updatedAt: "2026-06-27T10:00:00Z" }).toISOString(), "2026-06-27T10:00:00.000Z");
  assert.equal(resolveTimestamp({ dateOfCast: "2026-06-26" }).toISOString(), "2026-06-26T00:00:00.000Z");
  assert.equal(resolveTimestamp({ submittedAt: "not a date" }), null);
});
