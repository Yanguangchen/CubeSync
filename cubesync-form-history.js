/**
 * Keep copies of successfully submitted cube requests in this browser so the
 * public form can show them again with no sign-in and no server CRUD.
 *
 * Cookies cannot hold a full request (header + results table) — they are
 * capped near 4 KB and are sent on every HTTP request. This module uses
 * localStorage instead (same-origin, not sent to the lab).
 *
 * Exposes `window.CubeSyncFormHistory`.
 */
(function (root, factory) {
  const exported = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = exported;
  } else {
    root.CubeSyncFormHistory = exported;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const STORAGE_KEY = "cubesyncFormHistory";
  const HISTORY_VERSION = 1;
  const MAX_ENTRIES = 25;
  const MAX_BYTES = 400 * 1024;
  const BLOCKED_KEYS = new Set(["recaptchaToken", "recaptcha", "id"]);

  function storageFor(storage) {
    if (storage && typeof storage.getItem === "function" && typeof storage.setItem === "function") {
      return storage;
    }

    try {
      const win = typeof globalThis !== "undefined" ? globalThis.window : null;
      if (win && win.localStorage) {
        return win.localStorage;
      }
    } catch {
      // Ignore blocked access.
    }

    try {
      if (typeof globalThis !== "undefined" && globalThis.localStorage) {
        return globalThis.localStorage;
      }
    } catch {
      return null;
    }

    return null;
  }

  function textValue(value) {
    if (value == null || value === false) {
      return "";
    }
    return String(value).trim();
  }

  function clonePayload(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return null;
    }

    let raw;
    try {
      raw = JSON.parse(JSON.stringify(payload));
    } catch {
      return null;
    }

    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return null;
    }

    BLOCKED_KEYS.forEach(function (key) {
      delete raw[key];
    });

    if (!Array.isArray(raw.results)) {
      raw.results = [];
    } else {
      raw.results = raw.results.slice(0, 50);
    }

    if (!Array.isArray(raw.customFields)) {
      raw.customFields = [];
    }

    if (!raw.extraFields || typeof raw.extraFields !== "object" || Array.isArray(raw.extraFields)) {
      delete raw.extraFields;
    }

    return raw;
  }

  function summarize(payload) {
    const source = payload && typeof payload === "object" ? payload : {};
    return {
      customerBilling: textValue(source.customerBilling || source.client),
      cubeJobNumber: textValue(source.cubeJobNumber || source.reportNo),
      dateOfCast: textValue(source.dateOfCast),
      locationRepresented: textValue(source.locationRepresented),
      projectNameOnReport: textValue(source.projectNameOnReport || source.project),
      contact: textValue(source.contact)
    };
  }

  function encodedSize(history) {
    try {
      return JSON.stringify(history).length;
    } catch {
      return Number.POSITIVE_INFINITY;
    }
  }

  function normalizeEntry(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return null;
    }
    if (Number(raw.v) !== HISTORY_VERSION) {
      return null;
    }

    const payload = clonePayload(raw.payload);
    if (!payload) {
      return null;
    }

    const id = textValue(raw.id);
    if (!id) {
      return null;
    }

    const submittedAt = textValue(raw.submittedAt);
    const summarySource = raw.summary && typeof raw.summary === "object" && !Array.isArray(raw.summary)
      ? raw.summary
      : payload;

    return {
      v: HISTORY_VERSION,
      id,
      submittedAt: submittedAt || "",
      summary: summarize(summarySource),
      payload
    };
  }

  function emptyHistory() {
    return { v: HISTORY_VERSION, entries: [] };
  }

  function normalizeHistory(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return emptyHistory();
    }
    if (Number(raw.v) !== HISTORY_VERSION) {
      return emptyHistory();
    }

    const entries = Array.isArray(raw.entries)
      ? raw.entries.map(normalizeEntry).filter(Boolean)
      : [];

    return { v: HISTORY_VERSION, entries };
  }

  function readHistory(storage) {
    const store = storageFor(storage);
    if (!store) {
      return emptyHistory();
    }

    let text = "";
    try {
      text = store.getItem(STORAGE_KEY) || "";
    } catch {
      return emptyHistory();
    }

    if (!text) {
      return emptyHistory();
    }

    try {
      return normalizeHistory(JSON.parse(text));
    } catch {
      return emptyHistory();
    }
  }

  function writeHistory(storage, history) {
    const store = storageFor(storage);
    if (!store) {
      return false;
    }

    const normalized = normalizeHistory(history);
    try {
      store.setItem(STORAGE_KEY, JSON.stringify(normalized));
      return true;
    } catch {
      return false;
    }
  }

  function clearHistory(storage) {
    const store = storageFor(storage);
    if (!store) {
      return true;
    }
    try {
      store.removeItem(STORAGE_KEY);
    } catch {
      return false;
    }
    return readHistory(store).entries.length === 0;
  }

  function listSubmissions(storage) {
    return readHistory(storage).entries.slice();
  }

  function hasSubmissions(storage) {
    return listSubmissions(storage).length > 0;
  }

  function getById(id, storage) {
    const matchId = textValue(id);
    if (!matchId) {
      return null;
    }
    const entries = listSubmissions(storage);
    for (let i = 0; i < entries.length; i += 1) {
      if (entries[i].id === matchId) {
        return entries[i];
      }
    }
    return null;
  }

  function formatEntryLabel(entry) {
    const normalized = normalizeEntry(entry);
    if (!normalized) {
      return "";
    }

    const parts = [];
    if (normalized.submittedAt) {
      const parsed = new Date(normalized.submittedAt);
      if (!Number.isNaN(parsed.getTime())) {
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        parts.push(
          parsed.getUTCDate() + " " + months[parsed.getUTCMonth()] + " " + parsed.getUTCFullYear()
        );
      }
    }

    const summary = normalized.summary;
    [summary.customerBilling, summary.cubeJobNumber, summary.locationRepresented].forEach(function (part) {
      if (part) {
        parts.push(part);
      }
    });

    return parts.join(" · ");
  }

  function saveSubmission(payload, id, storage, now) {
    const cloned = clonePayload(payload);
    if (!cloned) {
      return { ok: false, message: "Could not keep a copy on this device" };
    }

    const submittedAt = now instanceof Date
      ? now.toISOString()
      : (now ? new Date(now).toISOString() : new Date().toISOString());

    if (submittedAt === "Invalid Date") {
      return { ok: false, message: "Could not keep a copy on this device" };
    }

    const entry = {
      v: HISTORY_VERSION,
      id: textValue(id) || ("local-" + Date.now()),
      submittedAt,
      summary: summarize(cloned),
      payload: cloned
    };

    const history = readHistory(storage);
    history.entries = history.entries.filter(function (existing) {
      return existing.id !== entry.id;
    });
    history.entries.unshift(entry);

    while (history.entries.length > MAX_ENTRIES || encodedSize(history) > MAX_BYTES) {
      if (history.entries.length <= 1) {
        break;
      }
      history.entries.pop();
    }

    if (encodedSize(history) > MAX_BYTES) {
      return { ok: false, message: "Could not keep a copy on this device" };
    }

    if (!writeHistory(storage, history)) {
      return { ok: false, message: "Could not keep a copy on this device" };
    }

    return { ok: true, entry };
  }

  return {
    STORAGE_KEY,
    HISTORY_VERSION,
    MAX_ENTRIES,
    MAX_BYTES,
    clonePayload,
    summarize,
    readHistory,
    writeHistory,
    clearHistory,
    listSubmissions,
    hasSubmissions,
    getById,
    formatEntryLabel,
    saveSubmission
  };
});
