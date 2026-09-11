/**
 * Remember request-form details in a browser cookie and restore them on load.
 *
 * Saves the CONCRETE CUBE TEST REQUEST FORM header fields only — never the
 * TEST RESULTS table. Per-submission fields (date of cast, cube job number,
 * the locked test item) are also omitted so a returning visit still gets a
 * fresh cast date and job number.
 *
 * Exposes `window.CubeSyncFormPrefs`.
 */
(function (root, factory) {
  const exported = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = exported;
  } else {
    root.CubeSyncFormPrefs = exported;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const COOKIE_NAME = "cubesyncFormPrefs";
  const PREFS_VERSION = 1;
  const MAX_COOKIE_BYTES = 3500;
  const COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;
  const EXCLUDED_FIELDS = new Set([
    "dateOfCast",
    "cubeJobNumber",
    "enableManualCubeJobNumber",
    "testItem"
  ]);
  const CUSTOM_FIELD_ID_PATTERN = /^[a-z][a-zA-Z0-9_]{0,31}$/;

  function cookieDocument(doc) {
    return doc || (typeof document !== "undefined" ? document : null);
  }

  function isSecureDocument(doc) {
    try {
      const loc = (doc && doc.defaultView && doc.defaultView.location) ||
        (typeof globalThis !== "undefined" && globalThis.location) ||
        null;
      return Boolean(loc && loc.protocol === "https:");
    } catch {
      return false;
    }
  }

  function readCookieValue(doc, name) {
    const source = cookieDocument(doc);
    if (!source || typeof source.cookie !== "string" || !source.cookie) {
      return "";
    }

    const prefix = `${name}=`;
    const parts = source.cookie.split("; ");
    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i];
      if (part.slice(0, prefix.length) === prefix) {
        try {
          return decodeURIComponent(part.slice(prefix.length));
        } catch {
          return "";
        }
      }
    }
    return "";
  }

  function writeCookieValue(doc, name, value, maxAgeSeconds) {
    const source = cookieDocument(doc);
    if (!source) {
      return false;
    }

    const encoded = encodeURIComponent(value);
    const parts = [
      `${name}=${encoded}`,
      "Path=/",
      `Max-Age=${maxAgeSeconds}`,
      "SameSite=Lax"
    ];
    if (isSecureDocument(source)) {
      parts.push("Secure");
    }

    try {
      source.cookie = parts.join("; ");
    } catch {
      return false;
    }

    if (maxAgeSeconds <= 0) {
      return readCookieValue(source, name) === "";
    }

    return readCookieValue(source, name) === value;
  }

  function isSkippableControl(control) {
    if (!control) {
      return true;
    }
    if (control.disabled) {
      return true;
    }
    if (control.readOnly) {
      return true;
    }
    if (control.dataset && control.dataset.configDisabled === "true") {
      return true;
    }
    return false;
  }

  function isEmptyPreferenceValue(value) {
    if (value === false || value == null) {
      return true;
    }
    if (typeof value === "number") {
      return !Number.isFinite(value);
    }
    return String(value).trim() === "";
  }

  function collectFormPreferences(form, formData) {
    const prefs = {
      v: PREFS_VERSION,
      fields: {},
      extraFields: {},
      customFields: []
    };

    if (!form || !formData || typeof formData.buildCubeRequestFromForm !== "function") {
      return prefs;
    }

    const payload = formData.buildCubeRequestFromForm(form);
    const fields = Array.isArray(formData.FORM_FIELDS) ? formData.FORM_FIELDS : [];

    fields.forEach(function (field) {
      if (EXCLUDED_FIELDS.has(field)) {
        return;
      }
      const value = payload[field];
      if (isEmptyPreferenceValue(value)) {
        return;
      }
      prefs.fields[field] = value;
    });

    const extraFields = payload.extraFields && typeof payload.extraFields === "object" &&
      !Array.isArray(payload.extraFields)
      ? payload.extraFields
      : {};
    Object.keys(extraFields).forEach(function (id) {
      if (!CUSTOM_FIELD_ID_PATTERN.test(id)) {
        return;
      }
      const value = extraFields[id];
      if (!isEmptyPreferenceValue(value)) {
        prefs.extraFields[id] = value;
      }
    });

    if (Array.isArray(payload.customFields)) {
      prefs.customFields = payload.customFields.filter(function (field) {
        return typeof field === "string" && field && !EXCLUDED_FIELDS.has(field);
      });
    }

    return prefs;
  }

  function normalizePreferences(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return null;
    }

    if (Number(raw.v) !== PREFS_VERSION) {
      return null;
    }

    const fields = {};
    const sourceFields = raw.fields && typeof raw.fields === "object" && !Array.isArray(raw.fields)
      ? raw.fields
      : {};
    Object.keys(sourceFields).forEach(function (field) {
      if (EXCLUDED_FIELDS.has(field) || field === "results") {
        return;
      }
      const value = sourceFields[field];
      if (isEmptyPreferenceValue(value)) {
        return;
      }
      fields[field] = value;
    });

    const extraFields = {};
    const sourceExtra = raw.extraFields && typeof raw.extraFields === "object" &&
      !Array.isArray(raw.extraFields)
      ? raw.extraFields
      : {};
    Object.keys(sourceExtra).forEach(function (id) {
      if (!CUSTOM_FIELD_ID_PATTERN.test(id) || EXCLUDED_FIELDS.has(id)) {
        return;
      }
      const value = sourceExtra[id];
      if (!isEmptyPreferenceValue(value)) {
        extraFields[id] = value;
      }
    });

    const customFields = Array.isArray(raw.customFields)
      ? raw.customFields.filter(function (field) {
        return typeof field === "string" && field && !EXCLUDED_FIELDS.has(field);
      })
      : [];

    return { v: PREFS_VERSION, fields, extraFields, customFields };
  }

  function parsePreferences(text) {
    if (!text) {
      return null;
    }

    try {
      return normalizePreferences(JSON.parse(text));
    } catch {
      return null;
    }
  }

  function encodedSize(prefs) {
    return encodeURIComponent(JSON.stringify(prefs)).length;
  }

  function shrinkPreferences(prefs) {
    const candidates = [prefs];
    if (prefs.extraFields && Object.keys(prefs.extraFields).length) {
      candidates.push({
        v: prefs.v,
        fields: prefs.fields,
        extraFields: {},
        customFields: prefs.customFields
      });
    }
    if (prefs.customFields && prefs.customFields.length) {
      candidates.push({
        v: prefs.v,
        fields: prefs.fields,
        extraFields: {},
        customFields: []
      });
    }

    for (let i = 0; i < candidates.length; i += 1) {
      if (encodedSize(candidates[i]) <= MAX_COOKIE_BYTES) {
        return candidates[i];
      }
    }

    return null;
  }

  function applyControlValue(control, value) {
    if (control.type === "checkbox") {
      control.checked = Boolean(value);
      return;
    }

    if (control.type === "number" && typeof value === "number") {
      control.value = Number.isFinite(value) ? String(value) : "";
      return;
    }

    control.value = value == null ? "" : String(value);
  }

  function controlHasValue(control) {
    if (!control) {
      return false;
    }
    if (control.type === "checkbox") {
      return Boolean(control.checked);
    }
    return String(control.value || "").trim() !== "";
  }

  function applyFormPreferences(form, prefs, formData, options) {
    const normalized = normalizePreferences(prefs);
    if (!form || !normalized) {
      return false;
    }

    const onlyEmpty = Boolean(options && options.onlyEmpty);
    const allowedFields = new Set(Array.isArray(formData && formData.FORM_FIELDS) ? formData.FORM_FIELDS : []);
    let applied = false;

    Object.keys(normalized.fields).forEach(function (field) {
      if (EXCLUDED_FIELDS.has(field)) {
        return;
      }
      if (allowedFields.size && !allowedFields.has(field)) {
        return;
      }

      const control = form.elements[field];
      if (isSkippableControl(control)) {
        return;
      }
      if (onlyEmpty && controlHasValue(control)) {
        return;
      }

      applyControlValue(control, normalized.fields[field]);
      applied = true;
    });

    Object.keys(normalized.extraFields).forEach(function (id) {
      const control = form.querySelector(`[data-custom-field-id="${id}"]`);
      if (isSkippableControl(control)) {
        return;
      }
      if (onlyEmpty && controlHasValue(control)) {
        return;
      }
      applyControlValue(control, normalized.extraFields[id]);
      applied = true;
    });

    if (formData && typeof formData.applyFreeTextFlags === "function" && normalized.customFields.length) {
      formData.applyFreeTextFlags(form, normalized.customFields);
    }

    return applied;
  }

  function readFormPreferenceCookie(doc) {
    return parsePreferences(readCookieValue(doc, COOKIE_NAME));
  }

  function writeFormPreferenceCookie(doc, prefs) {
    const normalized = normalizePreferences(prefs);
    if (!normalized) {
      return { ok: false, message: "Could not remember details in this browser" };
    }

    const compact = shrinkPreferences(normalized);
    if (!compact) {
      return { ok: false, message: "Saved details are too large to remember in this browser" };
    }

    const payload = JSON.stringify(compact);
    if (!writeCookieValue(doc, COOKIE_NAME, payload, COOKIE_MAX_AGE_SECONDS)) {
      return { ok: false, message: "Could not remember details in this browser" };
    }

    return { ok: true, prefs: compact };
  }

  function clearFormPreferenceCookie(doc) {
    writeCookieValue(doc, COOKIE_NAME, "", 0);
    return !readFormPreferenceCookie(doc);
  }

  function hasStoredPreferences(doc) {
    const prefs = readFormPreferenceCookie(doc);
    if (!prefs) {
      return false;
    }
    return Object.keys(prefs.fields).length > 0 ||
      Object.keys(prefs.extraFields).length > 0 ||
      prefs.customFields.length > 0;
  }

  function saveFormPreferences(form, formData, doc) {
    try {
      return writeFormPreferenceCookie(doc, collectFormPreferences(form, formData));
    } catch {
      return { ok: false, message: "Could not remember details in this browser" };
    }
  }

  function loadFormPreferences(form, formData, doc, options) {
    const prefs = readFormPreferenceCookie(doc);
    if (!prefs) {
      return false;
    }
    return applyFormPreferences(form, prefs, formData, options);
  }

  return {
    COOKIE_NAME,
    PREFS_VERSION,
    MAX_COOKIE_BYTES,
    COOKIE_MAX_AGE_SECONDS,
    EXCLUDED_FIELDS,
    collectFormPreferences,
    normalizePreferences,
    applyFormPreferences,
    readFormPreferenceCookie,
    writeFormPreferenceCookie,
    clearFormPreferenceCookie,
    hasStoredPreferences,
    saveFormPreferences,
    loadFormPreferences
  };
});
