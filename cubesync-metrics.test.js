const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildMetrics,
  resolveTimestamp,
  buildActivityLeaderboard,
  buildDailyCompletions
} = require("./cubesync-metrics");

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
  assert.equal(metrics.todayFreeTextFieldCount, 1);
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
  assert.equal(metrics.todayFreeTextFieldCount, 1);
});

test("buildMetrics totals free-text fields only across today's submissions", () => {
  const metrics = buildMetrics([
    {
      submittedAt: "2026-06-27T08:00:00Z",
      customFields: ["supplier", "projectErp"]
    },
    {
      submittedAt: "2026-06-27T09:00:00Z",
      customFields: ["supplier"],
      customFieldCount: 3
    },
    {
      submittedAt: "2026-06-26T09:00:00Z",
      customFields: ["supplier", "projectErp", "specimenSize"]
    }
  ], { now: "2026-06-27T12:00:00Z" });

  assert.equal(metrics.todayFreeTextFieldCount, 5);
});

test("buildMetrics flags cube job number collisions across requests", () => {
  const metrics = buildMetrics([
    { id: "a", cubeJobNumber: "CJ-100" },
    { id: "b", cubeJobNumber: "CJ-100" },
    { id: "c", cubeJobNumber: "cj-100" },
    { id: "d", cubeJobNumber: "CJ-200" },
    { id: "e", cubeJobNumber: "CJ-300" },
    { id: "f", cubeJobNumber: "CJ-300" },
    { id: "g", cubeJobNumber: "" },
    { id: "h" }
  ]);

  const collisions = metrics.cubeJobCollisions;
  assert.equal(collisions.collisionCount, 2);
  assert.equal(collisions.affectedRecords, 5);
  assert.equal(collisions.groups[0].jobNumber, "CJ-100");
  assert.equal(collisions.groups[0].count, 3);
  assert.deepEqual(collisions.groups[0].ids, ["a", "b", "c"]);
  assert.equal(collisions.groups[1].jobNumber, "CJ-300");
  assert.equal(collisions.groups[1].count, 2);
});

test("buildMetrics reports no cube job collisions when numbers are unique", () => {
  const metrics = buildMetrics([
    { id: "a", cubeJobNumber: "CJ-1" },
    { id: "b", cubeJobNumber: "CJ-2" },
    { id: "c" }
  ]);

  assert.equal(metrics.cubeJobCollisions.collisionCount, 0);
  assert.equal(metrics.cubeJobCollisions.affectedRecords, 0);
  assert.deepEqual(metrics.cubeJobCollisions.groups, []);
});

test("buildMetrics detects cube job collisions across the legacy reportNo alias", () => {
  const metrics = buildMetrics([
    { id: "a", cubeJobNumber: "CJ-9" },
    { id: "b", reportNo: "CJ-9" }
  ]);

  assert.equal(metrics.cubeJobCollisions.collisionCount, 1);
  assert.equal(metrics.cubeJobCollisions.groups[0].count, 2);
});

function historyEntry(overrides) {
  return Object.assign({
    requestId: "req-1",
    editedByEmail: "alice@rakmat.com.sg",
    editedByName: "Alice",
    createdAt: "2026-07-10T09:00:00Z",
    changes: [{ field: "quote", newValue: "Q-1" }]
  }, overrides);
}

function readyChange() {
  return { field: "status", previousValue: "Draft", newValue: "Ready" };
}

test("buildActivityLeaderboard ranks users by edit sessions and Ready promotions", () => {
  const entries = [
    historyEntry({ requestId: "a", editedByEmail: "alice@rakmat.com.sg" }),
    historyEntry({ requestId: "b", editedByEmail: "alice@rakmat.com.sg", changes: [readyChange()] }),
    historyEntry({ requestId: "c", editedByEmail: "alice@rakmat.com.sg", changes: [{ field: "contact", newValue: "x" }, readyChange()] }),
    historyEntry({ requestId: "d", editedByEmail: "bob@rakmat.com.sg", editedByName: "Bob" }),
    historyEntry({ requestId: "e", editedByEmail: "BOB@rakmat.com.sg", editedByName: "Bob", changes: [readyChange()] })
  ];

  const board = buildActivityLeaderboard(entries);

  assert.equal(board.users.length, 2);
  assert.equal(board.users[0].email, "alice@rakmat.com.sg");
  assert.equal(board.users[0].name, "Alice");
  assert.equal(board.users[0].editSessions, 3);
  assert.equal(board.users[0].readyCount, 2);
  assert.equal(board.users[0].fieldChanges, 4);
  // Case-insensitive email grouping merges BOB@ and bob@.
  assert.equal(board.users[1].editSessions, 2);
  assert.equal(board.users[1].readyCount, 1);
  assert.equal(board.totalSessions, 5);
  assert.equal(board.totalReadyPromotions, 3);
});

test("buildActivityLeaderboard falls back to name for entries without an email", () => {
  const board = buildActivityLeaderboard([
    historyEntry({ editedByEmail: "", editedByName: "Legacy User" }),
    historyEntry({ editedByEmail: "", editedByName: "" })
  ]);

  const names = board.users.map((user) => user.name);
  assert.ok(names.includes("Legacy User"));
  assert.ok(names.includes("Unknown user"));
});

test("buildActivityLeaderboard tracks each user's last activity timestamp", () => {
  const board = buildActivityLeaderboard([
    historyEntry({ createdAt: "2026-07-01T09:00:00Z" }),
    historyEntry({ createdAt: "2026-07-11T09:00:00Z" }),
    historyEntry({ createdAt: "2026-07-05T09:00:00Z" })
  ]);

  assert.equal(board.users[0].lastActivity.toISOString(), "2026-07-11T09:00:00.000Z");
});

test("buildDailyCompletions counts Ready promotions per day over the window", () => {
  const now = new Date("2026-07-12T15:00:00Z");
  const result = buildDailyCompletions([
    historyEntry({ requestId: "a", createdAt: "2026-07-12T08:00:00Z", changes: [readyChange()] }),
    historyEntry({ requestId: "b", createdAt: "2026-07-12T09:00:00Z", changes: [readyChange()] }),
    historyEntry({ requestId: "c", createdAt: "2026-07-10T09:00:00Z", changes: [readyChange()] }),
    // Plain edit without a Ready promotion must not count.
    historyEntry({ requestId: "d", createdAt: "2026-07-12T10:00:00Z" }),
    // Outside the window.
    historyEntry({ requestId: "e", createdAt: "2026-01-01T10:00:00Z", changes: [readyChange()] })
  ], { now, days: 28 });

  assert.equal(result.days.length, 28);
  assert.equal(result.days[result.days.length - 1].count, 2);
  assert.equal(result.total, 3);
  assert.equal(result.todayCount, 2);
  assert.equal(result.busiest.count, 2);
});

test("buildDailyCompletions counts a re-promoted request once per day", () => {
  const now = new Date("2026-07-12T15:00:00Z");
  const result = buildDailyCompletions([
    historyEntry({ requestId: "a", createdAt: "2026-07-12T08:00:00Z", changes: [readyChange()] }),
    historyEntry({ requestId: "a", createdAt: "2026-07-12T11:00:00Z", changes: [readyChange()] }),
    historyEntry({ requestId: "a", createdAt: "2026-07-11T11:00:00Z", changes: [readyChange()] })
  ], { now });

  assert.equal(result.todayCount, 1);
  assert.equal(result.total, 2);
});

test("buildMetrics flags cube job collisions that involve a form dated today", () => {
  const now = new Date("2026-07-12T15:00:00Z");
  const metrics = buildMetrics([
    { id: "a", cubeJobNumber: "CJ-1", submittedAt: "2026-07-12T09:00:00Z" },
    { id: "b", cubeJobNumber: "CJ-1", submittedAt: "2026-07-01T09:00:00Z" },
    { id: "c", cubeJobNumber: "CJ-2", submittedAt: "2026-07-01T09:00:00Z" },
    { id: "d", cubeJobNumber: "CJ-2", submittedAt: "2026-07-02T09:00:00Z" }
  ], { now });

  const collisions = metrics.cubeJobCollisions;
  assert.equal(collisions.collisionCount, 2);
  assert.equal(collisions.todayCollisionCount, 1);
  assert.equal(collisions.groups.find((group) => group.jobNumber === "CJ-1").involvesToday, true);
  assert.equal(collisions.groups.find((group) => group.jobNumber === "CJ-2").involvesToday, false);
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
