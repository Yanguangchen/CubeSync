(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.CubeSyncMetrics = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DAY_MS = 24 * 60 * 60 * 1000;
  const DEFAULT_FIELDS = ["submittedAt", "createdAt", "updatedAt", "dateOfCast", "internalDate"];

  function toDate(value) {
    if (value == null) return null;
    if (value instanceof Date || Object.prototype.toString.call(value) === "[object Date]") {
      return Number.isNaN(value.getTime()) ? null : value;
    }
    if (typeof value === "number") {
      if (!Number.isFinite(value)) return null;
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    if (typeof value === "object") {
      if (typeof value.toMillis === "function") return toDate(value.toMillis());
      if (typeof value.toDate === "function") return toDate(value.toDate());
      if (typeof value.seconds === "number") return toDate(value.seconds * 1000);
      return null;
    }
    if (typeof value === "string") {
      const text = value.trim();
      if (!text) return null;
      const parsed = new Date(text);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    return null;
  }

  function resolveTimestamp(record, fields) {
    if (!record || typeof record !== "object") return null;
    const candidates = Array.isArray(fields) && fields.length ? fields : DEFAULT_FIELDS;
    for (let i = 0; i < candidates.length; i += 1) {
      const date = toDate(record[candidates[i]]);
      if (date) return date;
    }
    return null;
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function startOfWeek(date) {
    const day = startOfDay(date);
    day.setDate(day.getDate() - day.getDay());
    return day;
  }

  function isSameDay(date, reference) {
    return startOfDay(date).getTime() === startOfDay(reference).getTime();
  }

  function isSameWeek(date, reference) {
    return startOfWeek(date).getTime() === startOfWeek(reference).getTime();
  }

  function isSameMonth(date, reference) {
    return date.getFullYear() === reference.getFullYear() && date.getMonth() === reference.getMonth();
  }

  function hourLabel(hour) {
    const period = hour < 12 ? "AM" : "PM";
    const display = hour % 12 || 12;
    return display + " " + period;
  }

  function dayLabel(day) {
    return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day] || "—";
  }

  function isoDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  function addDays(date, days) {
    const copy = startOfDay(date);
    copy.setDate(copy.getDate() + days);
    return copy;
  }

  function linearRegressionSlope(values) {
    if (!Array.isArray(values) || values.length < 2) return 0;
    const n = values.length;
    const meanX = (n - 1) / 2;
    const meanY = values.reduce((sum, value) => sum + value, 0) / n;
    let numerator = 0;
    let denominator = 0;
    values.forEach((value, index) => {
      const dx = index - meanX;
      numerator += dx * (value - meanY);
      denominator += dx * dx;
    });
    return denominator ? numerator / denominator : 0;
  }

  function average(numbers) {
    if (!Array.isArray(numbers) || numbers.length === 0) return 0;
    return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
  }

  function buildWorkloadInsightFromDates(dates, now) {
    const today = startOfDay(now);
    const countsByDay = new Map();
    dates.forEach((date) => {
      const day = startOfDay(date);
      const key = isoDateKey(day);
      countsByDay.set(key, (countsByDay.get(key) || 0) + 1);
    });

    const recentDays = [];
    for (let offset = 27; offset >= 0; offset -= 1) {
      const day = addDays(today, -offset);
      recentDays.push({ date: day, label: isoDateKey(day).slice(5), count: countsByDay.get(isoDateKey(day)) || 0 });
    }

    const recentWeekdayCounts = [0, 0, 0, 0, 0, 0, 0];
    const recentWeekdayOccurrences = [0, 0, 0, 0, 0, 0, 0];
    recentDays.forEach((day) => {
      const weekday = day.date.getDay();
      recentWeekdayCounts[weekday] += day.count;
      recentWeekdayOccurrences[weekday] += 1;
    });

    const previousDays = recentDays.slice(0, -1);
    const todayCount = countsByDay.get(isoDateKey(today)) || 0;
    const recentAverage = average(previousDays.map((day) => day.count));
    const regressionWindow = recentDays.slice(-14).map((day) => day.count);
    const trendSlope = linearRegressionSlope(regressionWindow);
    const trend = trendSlope > 0.05 ? "rising" : trendSlope < -0.05 ? "falling" : "steady";

    const weekdayAverages = recentWeekdayCounts.map((count, day) => ({
      day,
      label: dayLabel(day),
      average: recentWeekdayOccurrences[day] ? count / recentWeekdayOccurrences[day] : 0,
      count,
      occurrences: recentWeekdayOccurrences[day]
    }));
    const busyPeriods = weekdayAverages
      .filter((item) => item.occurrences > 0)
      .sort((a, b) => b.average - a.average)
      .slice(0, 2);
    const quietPeriods = weekdayAverages
      .filter((item) => item.occurrences > 0)
      .sort((a, b) => a.average - b.average)
      .slice(0, 2);

    const upcoming = [];
    for (let offset = 1; offset <= 7; offset += 1) {
      const date = addDays(today, offset);
      const weekdayAverage = weekdayAverages[date.getDay()].average || recentAverage;
      const projected = Math.max(0, weekdayAverage + (trendSlope * offset));
      upcoming.push({
        date: isoDateKey(date),
        label: dayLabel(date.getDay()),
        expected: projected
      });
    }

    let activitySignal = "normal";
    if (todayCount >= 3 && todayCount >= Math.max(recentAverage * 1.5, recentAverage + 2)) {
      activitySignal = "high";
    } else if (recentAverage >= 1 && todayCount <= recentAverage * 0.5) {
      activitySignal = "low";
    }

    const expectedTomorrow = upcoming.length ? upcoming[0].expected : Math.max(0, recentAverage + trendSlope);
    const busiestUpcoming = upcoming.reduce((best, item) => item.expected > best.expected ? item : best, upcoming[0] || { label: "—", expected: 0 });

    return {
      todayCount,
      recentAverage,
      trend,
      trendSlope,
      expectedTomorrow,
      activitySignal,
      busyPeriods,
      quietPeriods,
      upcoming,
      busiestUpcoming,
      chart: recentDays
    };
  }

  function statusText(value) {
    return String(value == null ? "" : value).trim().toLowerCase();
  }

  function isProcessed(record) {
    const erpStatus = statusText(record.erpStatus);
    const rpaStatus = statusText(record.rpaStatus);
    const status = statusText(record.status);
    return erpStatus === "success" ||
      rpaStatus === "submitted to erp" ||
      status === "archived";
  }

  function requiresManualReview(record) {
    const erpStatus = statusText(record.erpStatus);
    const rpaStatus = statusText(record.rpaStatus);
    const customFields = Array.isArray(record.customFields) ? record.customFields : [];
    const customFieldCount = Number(record.customFieldCount || 0);
    return customFields.length > 0 || customFieldCount > 0 ||
      erpStatus === "error" || erpStatus === "manual review" ||
      rpaStatus === "failed";
  }

  function freeTextFieldCount(record) {
    const customFields = Array.isArray(record.customFields) ? record.customFields.length : 0;
    const storedCount = Number(record.customFieldCount || 0);
    return Math.max(customFields, Number.isFinite(storedCount) ? storedCount : 0);
  }

  // The cube job number is stored on `cubeJobNumber`, with the legacy `reportNo`
  // alias on older documents. Return the first non-empty, trimmed value.
  function cubeJobNumberValue(record) {
    const primary = record.cubeJobNumber == null ? "" : String(record.cubeJobNumber).trim();
    if (primary) return primary;
    return record.reportNo == null ? "" : String(record.reportNo).trim();
  }

  // A collision is the same cube job number appearing on more than one request.
  // Grouping is case-insensitive so "AB-1" and "ab-1" are treated as the same
  // number; the first-seen spelling is kept for display. Groups also note when
  // any colliding record is dated today, so the dashboard can call out
  // collisions introduced by today's submissions.
  function buildCubeJobCollisions(entries) {
    const groups = new Map();
    entries.forEach((entry) => {
      const value = cubeJobNumberValue(entry);
      if (!value) return;
      const key = value.toLowerCase();
      const existing = groups.get(key);
      if (existing) {
        existing.count += 1;
        existing.ids.push(entry.id);
        existing.involvesToday = existing.involvesToday || entry.isToday === true;
      } else {
        groups.set(key, {
          jobNumber: value,
          count: 1,
          ids: [entry.id],
          involvesToday: entry.isToday === true
        });
      }
    });

    const collisions = [];
    let affectedRecords = 0;
    let todayCollisionCount = 0;
    groups.forEach((group) => {
      if (group.count > 1) {
        collisions.push({
          jobNumber: group.jobNumber,
          count: group.count,
          ids: group.ids,
          involvesToday: group.involvesToday
        });
        affectedRecords += group.count;
        if (group.involvesToday) todayCollisionCount += 1;
      }
    });
    collisions.sort((a, b) => b.count - a.count || a.jobNumber.localeCompare(b.jobNumber));

    return {
      collisionCount: collisions.length,
      affectedRecords: affectedRecords,
      todayCollisionCount: todayCollisionCount,
      groups: collisions
    };
  }

  // Edit-history entries record who saved a change (dashboard.js writes
  // editedByEmail/editedByName) and embed the changed fields. A "Ready
  // promotion" is a history entry whose changes include status → Ready.
  function isReadyPromotionEntry(entry) {
    const changes = entry && Array.isArray(entry.changes) ? entry.changes : [];
    return changes.some((change) => change && change.field === "status" &&
      statusText(change.newValue) === "ready");
  }

  function leaderboardUserKey(entry) {
    const email = statusText(entry.editedByEmail);
    if (email) return email;
    const name = String(entry.editedByName == null ? "" : entry.editedByName).trim();
    return name ? "name:" + name.toLowerCase() : "unknown";
  }

  // Aggregate edit-history entries into a per-user activity leaderboard:
  // edit sessions, individual field changes, Ready promotions, last activity.
  function buildActivityLeaderboard(historyEntries) {
    const entries = Array.isArray(historyEntries) ? historyEntries : [];
    const users = new Map();
    let totalReadyPromotions = 0;

    entries.forEach((entry) => {
      if (!entry || typeof entry !== "object") return;
      const key = leaderboardUserKey(entry);
      let user = users.get(key);
      if (!user) {
        user = {
          name: "",
          email: String(entry.editedByEmail == null ? "" : entry.editedByEmail).trim().toLowerCase(),
          editSessions: 0,
          fieldChanges: 0,
          readyCount: 0,
          lastActivity: null
        };
        users.set(key, user);
      }

      const name = String(entry.editedByName == null ? "" : entry.editedByName).trim();
      if (name && !user.name) user.name = name;

      user.editSessions += 1;
      user.fieldChanges += Array.isArray(entry.changes) ? entry.changes.length : 0;
      if (isReadyPromotionEntry(entry)) {
        user.readyCount += 1;
        totalReadyPromotions += 1;
      }

      const at = toDate(entry.createdAt);
      if (at && (!user.lastActivity || at > user.lastActivity)) {
        user.lastActivity = at;
      }
    });

    const list = Array.from(users.values());
    list.forEach((user) => {
      if (!user.name) user.name = user.email || "Unknown user";
    });
    list.sort((a, b) =>
      b.editSessions - a.editSessions ||
      b.readyCount - a.readyCount ||
      a.name.localeCompare(b.name));

    return {
      users: list,
      totalSessions: entries.length,
      totalReadyPromotions: totalReadyPromotions
    };
  }

  // Daily count of forms set to Ready over the trailing window, derived from
  // Ready-promotion history entries. A request re-promoted on the same day
  // counts once for that day.
  function buildDailyCompletions(historyEntries, options) {
    const opts = options || {};
    const now = toDate(opts.now) || new Date();
    const windowDays = Number.isInteger(opts.days) && opts.days > 0 ? opts.days : 28;
    const entries = Array.isArray(historyEntries) ? historyEntries : [];

    const countsByDay = new Map();
    const seen = new Set();
    entries.forEach((entry) => {
      if (!isReadyPromotionEntry(entry)) return;
      const at = toDate(entry.createdAt);
      if (!at) return;
      const dayKey = isoDateKey(startOfDay(at));
      if (entry.requestId) {
        const dedupeKey = String(entry.requestId) + "|" + dayKey;
        if (seen.has(dedupeKey)) return;
        seen.add(dedupeKey);
      }
      countsByDay.set(dayKey, (countsByDay.get(dayKey) || 0) + 1);
    });

    const today = startOfDay(now);
    const days = [];
    let total = 0;
    let busiest = null;
    for (let offset = windowDays - 1; offset >= 0; offset -= 1) {
      const date = addDays(today, -offset);
      const key = isoDateKey(date);
      const count = countsByDay.get(key) || 0;
      const day = { date: key, label: key.slice(5), weekday: dayLabel(date.getDay()), count: count };
      days.push(day);
      total += count;
      if (count > 0 && (!busiest || count > busiest.count)) busiest = day;
    }

    return {
      days: days,
      total: total,
      todayCount: countsByDay.get(isoDateKey(today)) || 0,
      busiest: busiest
    };
  }

  function buildMetrics(records, options) {
    const opts = options || {};
    const now = toDate(opts.now) || new Date();
    const forms = Array.isArray(records) ? records : [];
    const dated = [];
    const cubeJobEntries = [];
    const hourlyCounts = new Array(24).fill(0);

    let dailyCount = 0;
    let weeklyCount = 0;
    let monthlyCount = 0;
    let processedCount = 0;
    let manualReviewCount = 0;
    let todayFreeTextFieldCount = 0;

    forms.forEach((form) => {
      const record = form && form.raw ? Object.assign({}, form.raw, form) : form;
      if (!record || typeof record !== "object") return;

      if (isProcessed(record)) processedCount += 1;
      if (requiresManualReview(record)) manualReviewCount += 1;
      const cubeJobEntry = {
        id: record.id != null ? record.id : form && form.id,
        cubeJobNumber: record.cubeJobNumber,
        reportNo: record.reportNo,
        isToday: false
      };
      cubeJobEntries.push(cubeJobEntry);

      const date = resolveTimestamp(record, opts.fields);
      if (!date) return;
      dated.push(date);
      hourlyCounts[date.getHours()] += 1;
      if (isSameDay(date, now)) {
        cubeJobEntry.isToday = true;
        dailyCount += 1;
        todayFreeTextFieldCount += freeTextFieldCount(record);
      }
      if (isSameWeek(date, now)) weeklyCount += 1;
      if (isSameMonth(date, now)) monthlyCount += 1;
    });

    let averagePerDay = 0;
    if (dated.length) {
      const dayKeys = dated.map((date) => startOfDay(date).getTime());
      const min = Math.min(...dayKeys);
      const max = Math.max(...dayKeys);
      const spanDays = Math.max(1, Math.floor((max - min) / DAY_MS) + 1);
      averagePerDay = dated.length / spanDays;
    }

    const peakCount = hourlyCounts.reduce((acc, count) => Math.max(acc, count), 0);
    const peakPeriods = peakCount > 0
      ? hourlyCounts.map((count, hour) => ({ hour, label: hourLabel(hour), count }))
        .filter((bucket) => bucket.count === peakCount)
      : [];

    return {
      totalRecords: forms.length,
      dailyCount,
      weeklyCount,
      monthlyCount,
      averagePerDay,
      peakPeriods,
      peakCount,
      processedCount,
      manualReviewCount,
      todayFreeTextFieldCount,
      cubeJobCollisions: buildCubeJobCollisions(cubeJobEntries),
      workloadInsight: buildWorkloadInsightFromDates(dated, now)
    };
  }

  return {
    toDate,
    resolveTimestamp,
    buildMetrics,
    buildActivityLeaderboard,
    buildDailyCompletions
  };
});
