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
  // Peak label reflects local timezone, so derive it from the timestamp rather than hardcoding "9 AM".
  const peakHour = new Date("2026-06-27T09:00:00Z").getHours();
  const expectedPeakLabel = (peakHour % 12 || 12) + " " + (peakHour < 12 ? "AM" : "PM");
  assert.deepEqual(metrics.peakPeriods.map((period) => period.label), [expectedPeakLabel]);
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

test("buildMetrics adds predictive workload insight from historical trends", () => {
  const now = new Date("2026-06-27T12:00:00Z");
  const records = [];
  ["2026-06-21", "2026-06-22", "2026-06-23", "2026-06-24", "2026-06-25", "2026-06-26"].forEach((date, index) => {
    for (let count = 0; count <= index; count += 1) {
      records.push({ id: date + "-" + count, submittedAt: date + "T09:00:00Z" });
    }
  });
  for (let count = 0; count < 8; count += 1) {
    records.push({ id: "today-" + count, submittedAt: "2026-06-27T10:00:00Z" });
  }

  const metrics = buildMetrics(records, { now });
  const insight = metrics.workloadInsight;

  assert.equal(insight.todayCount, 8);
  assert.equal(insight.activitySignal, "high");
  assert.equal(insight.trend, "rising");
  assert.equal(insight.upcoming.length, 7);
  assert.equal(insight.chart.length, 28);
  assert.ok(insight.expectedTomorrow > 0);
  assert.ok(insight.busyPeriods.length > 0);
  assert.ok(insight.busyPeriods[0].average >= insight.quietPeriods[0].average);
});
