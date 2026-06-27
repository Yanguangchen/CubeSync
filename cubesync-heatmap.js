(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.CubeSyncHeatmap = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // Filter modes the heatmap supports. The values double as stable keys for the
  // dashboard UI controls.
  const HEATMAP_MODES = {
    DAILY: "daily", // distribution across the 24 hours of a day
    WEEKLY: "weekly", // distribution across the 7 days of a week
    YEARLY: "yearly" // distribution across the 12 months of a year
  };

  const WEEKDAY_LABELS = [
    "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"
  ];

  const MONTH_LABELS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  // Fields tried, in order, when the caller does not name one explicitly.
  // submittedAt is the truest "submission" time; the others are fallbacks so a
  // form still lands somewhere when it was never formally submitted.
  const DEFAULT_FIELDS = ["submittedAt", "createdAt", "updatedAt"];

  function hourLabel(hour) {
    const period = hour < 12 ? "AM" : "PM";
    const base = hour % 12;
    const display = base === 0 ? 12 : base;
    return display + " " + period;
  }

  // Coerce any of the timestamp shapes seen across the app — Date, epoch millis,
  // Firestore Timestamp (toMillis/toDate/seconds), or a parseable string — into
  // a Date. Returns null for anything unusable so callers can simply skip it.
  function toDate(value) {
    if (value == null) {
      return null;
    }

    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }

    if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        return null;
      }
      const fromNumber = new Date(value);
      return Number.isNaN(fromNumber.getTime()) ? null : fromNumber;
    }

    if (typeof value === "object") {
      if (typeof value.toMillis === "function") {
        return toDate(value.toMillis());
      }
      if (typeof value.toDate === "function") {
        return toDate(value.toDate());
      }
      if (typeof value.seconds === "number") {
        return toDate(value.seconds * 1000);
      }
      return null;
    }

    if (typeof value === "string") {
      const text = value.trim();
      if (!text) {
        return null;
      }
      const parsed = new Date(text);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    return null;
  }

  // Pull a usable Date off a form. With an explicit field, only that field is
  // consulted; otherwise the DEFAULT_FIELDS fallback chain is walked.
  function resolveTimestamp(form, field) {
    if (!form || typeof form !== "object") {
      return null;
    }

    if (field) {
      return toDate(form[field]);
    }

    for (let i = 0; i < DEFAULT_FIELDS.length; i += 1) {
      const candidate = toDate(form[DEFAULT_FIELDS[i]]);
      if (candidate) {
        return candidate;
      }
    }

    return null;
  }

  function normalizeMode(mode) {
    if (mode === HEATMAP_MODES.DAILY || mode === HEATMAP_MODES.YEARLY) {
      return mode;
    }
    return HEATMAP_MODES.WEEKLY;
  }

  function bucketLabels(mode) {
    switch (normalizeMode(mode)) {
      case HEATMAP_MODES.DAILY:
        return Array.from({ length: 24 }, (_, hour) => hourLabel(hour));
      case HEATMAP_MODES.YEARLY:
        return MONTH_LABELS.slice();
      default:
        return WEEKDAY_LABELS.slice();
    }
  }

  // Map a Date onto its bucket index for the given mode.
  function bucketIndex(mode, date) {
    switch (mode) {
      case HEATMAP_MODES.DAILY:
        return date.getHours();
      case HEATMAP_MODES.YEARLY:
        return date.getMonth();
      default:
        return date.getDay();
    }
  }

  // Build a one-dimensional heatmap distribution for the chosen mode.
  //
  // options: { mode, field }
  //   mode  - one of HEATMAP_MODES (defaults to weekly; unknown falls back too)
  //   field - timestamp field to read (defaults to the submittedAt fallback chain)
  //
  // Returns { mode, buckets, total, max, busiest } where each bucket is
  // { key, label, count, intensity } and intensity is count / max (0..1).
  function buildHeatmap(forms, options) {
    const opts = options || {};
    const mode = normalizeMode(opts.mode);
    const field = opts.field || null;
    const labels = bucketLabels(mode);

    const counts = new Array(labels.length).fill(0);
    let total = 0;

    const list = Array.isArray(forms) ? forms : [];
    list.forEach((form) => {
      const date = resolveTimestamp(form, field);
      if (!date) {
        return;
      }
      const index = bucketIndex(mode, date);
      if (index >= 0 && index < counts.length) {
        counts[index] += 1;
        total += 1;
      }
    });

    const max = counts.reduce((acc, value) => (value > acc ? value : acc), 0);

    const buckets = counts.map((count, index) => ({
      key: index,
      label: labels[index],
      count: count,
      intensity: max > 0 ? count / max : 0
    }));

    let busiest = null;
    if (max > 0) {
      // First bucket that reaches the max — stable, earliest-wins on ties.
      const index = counts.indexOf(max);
      busiest = { key: index, label: labels[index], count: max };
    }

    return {
      mode: mode,
      buckets: buckets,
      total: total,
      max: max,
      busiest: busiest
    };
  }

  return {
    HEATMAP_MODES: HEATMAP_MODES,
    toDate: toDate,
    resolveTimestamp: resolveTimestamp,
    bucketLabels: bucketLabels,
    buildHeatmap: buildHeatmap
  };
});
