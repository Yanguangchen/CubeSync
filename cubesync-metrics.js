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

  function buildMetrics(records, options) {
    const opts = options || {};
    const now = toDate(opts.now) || new Date();
    const forms = Array.isArray(records) ? records : [];
    const dated = [];
    const hourlyCounts = new Array(24).fill(0);

    let dailyCount = 0;
    let weeklyCount = 0;
    let monthlyCount = 0;
    let processedCount = 0;
    let manualReviewCount = 0;

    forms.forEach((form) => {
      const record = form && form.raw ? Object.assign({}, form.raw, form) : form;
      if (!record || typeof record !== "object") return;

      if (isProcessed(record)) processedCount += 1;
      if (requiresManualReview(record)) manualReviewCount += 1;

      const date = resolveTimestamp(record, opts.fields);
      if (!date) return;
      dated.push(date);
      hourlyCounts[date.getHours()] += 1;
      if (isSameDay(date, now)) dailyCount += 1;
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
      manualReviewCount
    };
  }

  return {
    toDate,
    resolveTimestamp,
    buildMetrics
  };
});
