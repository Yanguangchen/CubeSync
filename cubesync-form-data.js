(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.CubeSyncFormData = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const COLLECTION_NAME = "cubeRequests";
  const SETTINGS_COLLECTION = "settings";
  const FORM_FIELD_CONFIG_DOC_ID = "formFieldConfig";
  const FORM_FIELD_CONFIG_STORAGE_KEY = "cubesync-form-field-config";
  const FORM_FIELDS = [
    "projectErp",
    "customerBilling",
    "projectNameOnReport",
    "clientNameOnReport",
    "contact",
    "enableManualCubeJobNumber",
    "cubeJobNumber",
    "quote",
    "testItem",
    "concreteGrade",
    "reportGrade",
    "supplier",
    "supplierDisplay",
    "locationRepresented",
    "additionalInformation",
    "dateOfCast",
    "slumpMeasured",
    "specimenSize",
    "slumpSpecified",
    "personInCharge",
    "managerInCharge"
  ];
  const REQUIRED_FORM_FIELDS = [
    "customerBilling",
    "contact",
    "supplier",
    "supplierDisplay",
    "locationRepresented",
    "dateOfCast",
    "concreteGrade",
    "reportGrade",
    "specimenSize",
    "slumpMeasured",
    "slumpSpecified",
    "personInCharge",
    "managerInCharge"
  ];
  const RESULT_FIELDS = [
    "setNo",
    "size",
    "specimenRef",
    "barcode",
    "specifiedSlump",
    "meanSlump",
    "resultGrade",
    "resultDateOfCast",
    "age",
    "dateOfTest",
    "invoiceNumber"
  ];
  const DROPDOWN_OPTION_FIELDS = [
    "projectErp",
    "customerBilling",
    "supplier",
    "concreteGrade",
    "personInCharge",
    "managerInCharge",
    "testItem",
    "specimenSize"
  ];
  const RESULT_FIELD_LABELS = {
    setNo: "Set No",
    size: "Size",
    specimenRef: "Specimen Ref #",
    barcode: "Barcode",
    specifiedSlump: "Specified Slump",
    meanSlump: "Mean Slump",
    resultGrade: "Concrete Grade",
    resultDateOfCast: "Date Of Cast",
    age: "Age",
    dateOfTest: "Date Of Test",
    invoiceNumber: "Invoice Number"
  };
  const NUMBER_FIELDS = new Set([
    "slumpMeasured",
    "slumpSpecified",
    "setNo",
    "meanSlump",
    "age"
  ]);
  const CHECKBOX_FIELDS = new Set([
    "enableManualCubeJobNumber"
  ]);
  const REQUEST_FIELD_LABELS = {
    projectErp: "Project (ERP)",
    customerBilling: "Customer (Billing)",
    projectNameOnReport: "Project Name on Report",
    clientNameOnReport: "Client Name on Report",
    contact: "Contact",
    enableManualCubeJobNumber: "Enable Manual Cube Job #",
    cubeJobNumber: "Cube Job #",
    quote: "Quote",
    testItem: "Test Item",
    supplier: "Supplier Of Concrete",
    supplierDisplay: "Supplier Of Concrete Display",
    locationRepresented: "Location",
    additionalInformation: "Additional Info",
    dateOfCast: "Date of cast",
    concreteGrade: "Concrete Grade",
    reportGrade: "Report Grade",
    specimenSize: "Size",
    slumpMeasured: "Mean Slump",
    slumpSpecified: "Specified Slump",
    personInCharge: "Person In Charge",
    managerInCharge: "Manager In Charge"
  };
  const FORM_FIELD_FALLBACKS = {
    projectErp: ["projectErp", "projectCode"],
    customerBilling: ["customerBilling", "client"],
    projectNameOnReport: ["projectNameOnReport", "project"],
    clientNameOnReport: ["clientNameOnReport", "client"],
    cubeJobNumber: ["cubeJobNumber", "reportNo"],
    testItem: ["testItem", "method"],
    supplierDisplay: ["supplierDisplay", "supplier"],
    dateOfCast: ["dateOfCast", "dateTimeSampled", "internalDate"],
    reportGrade: ["reportGrade", "concreteGrade", "grade"]
  };
  const CUSTOM_FIELD_TYPES = ["text", "number", "date", "checkbox", "textarea"];
  const MAX_CUSTOM_REQUEST_FIELDS = 25;
  const CUSTOM_FIELD_ID_PATTERN = /^[a-z][a-zA-Z0-9_]{0,31}$/;
  const RESERVED_FIELD_IDS = new Set([
    ...FORM_FIELDS,
    ...RESULT_FIELDS,
    "customFields",
    "extraFields",
    "results",
    "template",
    "status",
    "id",
    "createdAt",
    "updatedAt",
    "erpStatus",
    "rpaStatus",
    "attemptCount"
  ]);

  function normalizeText(value) {
    return String(value == null ? "" : value).trim();
  }

  function normalizeValue(field, value) {
    const text = normalizeText(value);

    if (!NUMBER_FIELDS.has(field)) {
      return text;
    }

    if (!text) {
      return null;
    }

    const number = Number(text);
    return Number.isFinite(number) ? number : null;
  }

  function readFormValue(form, field) {
    const control = form.elements[field];
    if (control && CHECKBOX_FIELDS.has(field)) {
      return Boolean(control.checked);
    }

    return control ? normalizeValue(field, control.value) : normalizeValue(field, "");
  }

  function hasRowValue(row) {
    return RESULT_FIELDS.some((field) => {
      if (field === "setNo") {
        return false;
      }
      const value = row[field];
      return value !== "" && value !== null;
    });
  }

  function collectResultRows(form) {
    return Array.from(form.querySelectorAll(".results-table tbody tr"))
      .map((row) => RESULT_FIELDS.reduce((result, field) => {
        const input = row.querySelector(`[name^="${field}"]`);
        result[field] = normalizeValue(field, input ? input.value : "");
        return result;
      }, {}))
      .filter(hasRowValue);
  }

  function normalizeCustomFields(fields) {
    if (!Array.isArray(fields)) {
      return [];
    }

    const allowed = new Set(DROPDOWN_OPTION_FIELDS);
    const customFields = [];

    fields.forEach((field) => {
      const normalized = normalizeText(field);
      if (allowed.has(normalized) && !customFields.includes(normalized)) {
        customFields.push(normalized);
      }
    });

    return customFields;
  }

  function collectCustomFields(form) {
    return normalizeCustomFields(DROPDOWN_OPTION_FIELDS.filter((field) => {
      const control = form.elements[field];
      return Boolean(
        control &&
        control.dataset &&
        control.dataset.freeTextEntry === "true" &&
        normalizeText(control.value)
      );
    }));
  }

  function applyFreeTextFlags(form, customFieldNames) {
    if (!form) {
      return;
    }

    normalizeCustomFields(customFieldNames).forEach((field) => {
      const control = form.elements[field];
      if (control && normalizeText(control.value)) {
        control.dataset.freeTextEntry = "true";
      }
    });
  }

  function isDropdownFreeTextField(customFieldNames, fieldKey) {
    return normalizeCustomFields(customFieldNames).includes(fieldKey);
  }

  // Derive free-text flags from the stored values themselves, independent of
  // the capture-time `customFields` metadata. A dropdown field whose saved
  // value is not present in its known option list is treated as free text.
  // optionsByField is a map of { fieldKey: string[] } of allowed options.
  // Fields without a non-empty option list are skipped (we can't tell), so a
  // missing option file never floods the dashboard with false positives.
  function deriveFreeTextDropdownFields(data, optionsByField) {
    if (!data || !optionsByField || typeof optionsByField !== "object") {
      return [];
    }

    const derived = DROPDOWN_OPTION_FIELDS.filter((field) => {
      const options = optionsByField[field];
      if (!Array.isArray(options) || options.length === 0) {
        return false;
      }

      const value = normalizeText(getCubeRequestFormValue(data, field));
      if (!value) {
        return false;
      }

      const target = value.toLowerCase();
      return !options.some((option) => normalizeText(option).toLowerCase() === target);
    });

    return normalizeCustomFields(derived);
  }

  function mergeFreeTextDropdownFields() {
    const merged = [];

    Array.prototype.forEach.call(arguments, (list) => {
      normalizeCustomFields(list).forEach((field) => {
        if (!merged.includes(field)) {
          merged.push(field);
        }
      });
    });

    return normalizeCustomFields(merged);
  }

  // Decide which dropdown fields to flag for human review on the dashboard.
  //
  // Preferred signal is value-based: a field is flagged only when its stored
  // value is NOT one of the known options. This avoids false positives when a
  // user typed a value that is actually a valid option (the capture-time
  // `customFields` metadata flags any typed value, even valid ones), and avoids
  // misses caused by browser-local option caches.
  //
  // When no option list is available for a field (e.g. the option file failed
  // to load), fall back to the capture-time metadata so behavior degrades
  // gracefully instead of showing nothing.
  function resolveFreeTextDropdownFields(data, optionsByField, metadataFields) {
    const metadata = normalizeCustomFields(metadataFields);
    const options = optionsByField && typeof optionsByField === "object" ? optionsByField : {};

    const flagged = DROPDOWN_OPTION_FIELDS.filter((field) => {
      const list = options[field];

      if (Array.isArray(list) && list.length > 0) {
        const value = normalizeText(getCubeRequestFormValue(data, field));
        if (!value) {
          return false;
        }

        const target = value.toLowerCase();
        return !list.some((option) => normalizeText(option).toLowerCase() === target);
      }

      return metadata.includes(field);
    });

    return normalizeCustomFields(flagged);
  }

  // For a form being promoted (e.g. set to "Ready"), return the free-text values
  // that should be added to the shared/canonical option lists, keyed by field.
  // A field is included only when it is currently flagged as free text and has a
  // non-empty value — i.e. a novel value worth promoting to a suggestion.
  function collectFlaggedDropdownValues(data, optionsByField, metadataFields) {
    const flagged = resolveFreeTextDropdownFields(data, optionsByField, metadataFields);
    const values = {};

    flagged.forEach((field) => {
      const value = normalizeText(getCubeRequestFormValue(data, field));
      if (value) {
        values[field] = value;
      }
    });

    return values;
  }

  // --- Shared dropdown option normalization ------------------------------
  // These back the get/add/save dropdown-option store in firestore.js so the
  // normalization rules are unit-testable. Trim, drop blanks, de-duplicate
  // case-insensitively (first occurrence wins, order preserved).
  function normalizeDropdownOptionList(list) {
    const seen = new Set();
    const result = [];
    (Array.isArray(list) ? list : []).forEach((entry) => {
      const value = normalizeText(entry);
      const key = value.toLowerCase();
      if (value && !seen.has(key)) {
        seen.add(key);
        result.push(value);
      }
    });
    return result;
  }

  // Read path: keep only known fields whose value is an array; normalize each.
  function readSharedDropdownOptions(data) {
    const options = {};
    if (!data || typeof data !== "object") {
      return options;
    }
    DROPDOWN_OPTION_FIELDS.forEach((field) => {
      if (Array.isArray(data[field])) {
        options[field] = normalizeDropdownOptionList(data[field]);
      }
    });
    return options;
  }

  // Append path: whitelist fields, accept a single value or an array, drop
  // fields that normalize to nothing. Returns { field: string[] }.
  function buildSharedDropdownAddValues(valuesByField) {
    const additions = {};
    if (!valuesByField || typeof valuesByField !== "object") {
      return additions;
    }
    DROPDOWN_OPTION_FIELDS.forEach((field) => {
      if (!(field in valuesByField)) {
        return;
      }
      const raw = valuesByField[field];
      const values = normalizeDropdownOptionList(Array.isArray(raw) ? raw : [raw]);
      if (values.length) {
        additions[field] = values;
      }
    });
    return additions;
  }

  // Replace path: whitelist fields with array values; normalize each list.
  function buildSharedDropdownSaveValues(optionsByField) {
    const clean = {};
    if (!optionsByField || typeof optionsByField !== "object") {
      return clean;
    }
    DROPDOWN_OPTION_FIELDS.forEach((field) => {
      if (Array.isArray(optionsByField[field])) {
        clean[field] = normalizeDropdownOptionList(optionsByField[field]);
      }
    });
    return clean;
  }

  function isRequestFieldFilled(field, value) {
    if (NUMBER_FIELDS.has(field)) {
      return typeof value === "number" && Number.isFinite(value);
    }

    return normalizeText(value) !== "";
  }

  function defaultFormFieldConfig() {
    return {
      requestFields: Object.fromEntries(FORM_FIELDS.map((field) => [field, true])),
      resultFields: Object.fromEntries(RESULT_FIELDS.map((field) => [field, true])),
      requestLabels: {},
      resultLabels: {},
      customRequestFields: []
    };
  }

  function isValidCustomFieldId(id) {
    return typeof id === "string" &&
      CUSTOM_FIELD_ID_PATTERN.test(id) &&
      !RESERVED_FIELD_IDS.has(id);
  }

  function slugifyCustomFieldId(label) {
    const slug = normalizeText(label)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 32);

    if (!slug || !/^[a-z]/.test(slug)) {
      return "";
    }

    return slug;
  }

  function normalizeCustomFieldDefinition(raw) {
    if (!raw || typeof raw !== "object") {
      return null;
    }

    let id = normalizeText(raw.id);
    const label = normalizeText(raw.label);
    if (!id && label) {
      id = slugifyCustomFieldId(label);
    }

    if (!isValidCustomFieldId(id) || !label) {
      return null;
    }

    const type = CUSTOM_FIELD_TYPES.includes(raw.type) ? raw.type : "text";
    const formLabel = normalizeText(raw.formLabel);

    return {
      id,
      label,
      type,
      required: Boolean(raw.required),
      enabled: raw.enabled !== false,
      formLabel: formLabel || ""
    };
  }

  function normalizeCustomRequestFields(raw) {
    if (!Array.isArray(raw)) {
      return [];
    }

    const seen = new Set();
    const fields = [];

    raw.forEach((item) => {
      const def = normalizeCustomFieldDefinition(item);
      if (!def || seen.has(def.id)) {
        return;
      }

      seen.add(def.id);
      fields.push(def);
    });

    return fields.slice(0, MAX_CUSTOM_REQUEST_FIELDS);
  }

  function customFieldInputName(id) {
    return `custom__${id}`;
  }

  function getCustomFieldFormLabel(def) {
    return normalizeText(def.formLabel) || def.label || def.id;
  }

  function getCustomRequestFields(config) {
    return normalizeFormFieldConfig(config).customRequestFields;
  }

  function getEnabledCustomRequestFields(config) {
    return getCustomRequestFields(config).filter((def) => def.enabled !== false);
  }

  function normalizeLabelOverrides(rawLabels, fields, defaultLabels) {
    const labels = {};
    if (!rawLabels || typeof rawLabels !== "object") {
      return labels;
    }

    fields.forEach((field) => {
      const value = rawLabels[field];
      if (typeof value !== "string") {
        return;
      }

      const trimmed = value.trim();
      if (trimmed && trimmed !== (defaultLabels[field] || field)) {
        labels[field] = trimmed;
      }
    });

    return labels;
  }

  function normalizeFormFieldConfig(raw) {
    const defaults = defaultFormFieldConfig();
    if (!raw || typeof raw !== "object") {
      return defaults;
    }

    const requestFields = { ...defaults.requestFields };
    const resultFields = { ...defaults.resultFields };

    if (raw.requestFields && typeof raw.requestFields === "object") {
      FORM_FIELDS.forEach((field) => {
        if (typeof raw.requestFields[field] === "boolean") {
          requestFields[field] = raw.requestFields[field];
        }
      });
    }

    if (raw.resultFields && typeof raw.resultFields === "object") {
      RESULT_FIELDS.forEach((field) => {
        if (typeof raw.resultFields[field] === "boolean") {
          resultFields[field] = raw.resultFields[field];
        }
      });
    }

    return {
      requestFields,
      resultFields,
      requestLabels: normalizeLabelOverrides(raw.requestLabels, FORM_FIELDS, REQUEST_FIELD_LABELS),
      resultLabels: normalizeLabelOverrides(raw.resultLabels, RESULT_FIELDS, RESULT_FIELD_LABELS),
      customRequestFields: normalizeCustomRequestFields(raw.customRequestFields)
    };
  }

  function getRequestFieldLabel(config, field) {
    const normalized = normalizeFormFieldConfig(config);
    return normalized.requestLabels[field] || REQUEST_FIELD_LABELS[field] || field;
  }

  function getResultFieldLabel(config, field) {
    const normalized = normalizeFormFieldConfig(config);
    return normalized.resultLabels[field] || RESULT_FIELD_LABELS[field] || field;
  }

  function getActiveRequiredFormFields(config) {
    const normalized = normalizeFormFieldConfig(config);
    return REQUIRED_FORM_FIELDS.filter((field) => normalized.requestFields[field] !== false);
  }

  function isRequestFieldEnabled(config, field) {
    return normalizeFormFieldConfig(config).requestFields[field] !== false;
  }

  function isResultFieldEnabled(config, field) {
    return normalizeFormFieldConfig(config).resultFields[field] !== false;
  }

  function findRequestFieldRow(form, field) {
    const control = form.elements[field];
    if (!control || typeof control.closest !== "function") {
      return null;
    }

    return control.closest(".field-row, .toggle-row, label");
  }

  function getRequestFieldStep(form, field) {
    const control = form.elements[field];
    if (!control || typeof control.closest !== "function") {
      return null;
    }

    const step = control.closest(".form-step");
    if (!step || !step.dataset.step) {
      return null;
    }

    return parseInt(step.dataset.step, 10);
  }

  function syncNativeFormConstraints(form, options) {
    if (!form) {
      return;
    }

    const activeStep = options && options.activeStep;
    const normalized = normalizeFormFieldConfig(options && options.config);
    const activeRequired = getActiveRequiredFormFields(options && options.config);

    FORM_FIELDS.forEach((field) => {
      const control = form.elements[field];
      if (!control || control.type === "checkbox") {
        return;
      }

      const enabled = normalized.requestFields[field] !== false;
      const fieldStep = getRequestFieldStep(form, field);
      const onActiveStep = activeStep == null || fieldStep == null || fieldStep === activeStep;
      const shouldRequire = enabled && activeRequired.includes(field) && onActiveStep;

      if (shouldRequire) {
        control.setAttribute("required", "");
      } else {
        control.removeAttribute("required");
      }
    });
  }

  function applyRequestFieldState(form, field, enabled) {
    const row = findRequestFieldRow(form, field);
    const control = form.elements[field];

    if (row) {
      row.hidden = !enabled;
      row.classList.toggle("field-disabled", !enabled);
    }

    if (!control) {
      return;
    }

    if (!enabled) {
      control.disabled = true;
      control.dataset.configDisabled = "true";
      control.removeAttribute("required");
      if (control.type === "checkbox") {
        control.checked = false;
      } else if (control.type !== "hidden") {
        control.value = "";
      }
      return;
    }

    delete control.dataset.configDisabled;
    if (control.type === "checkbox") {
      control.disabled = false;
      return;
    }

    control.disabled = false;
  }

  function applyResultColumnState(table, columnIndex, enabled) {
    const headerCell = table.querySelector(`thead th:nth-child(${columnIndex + 1})`);
    if (headerCell) {
      headerCell.hidden = !enabled;
      headerCell.classList.toggle("field-disabled", !enabled);
    }

    table.querySelectorAll("tbody tr").forEach((row) => {
      const cell = row.cells[columnIndex];
      if (!cell) {
        return;
      }

      cell.hidden = !enabled;
      cell.classList.toggle("field-disabled", !enabled);
      cell.querySelectorAll("input, select, textarea, button").forEach((input) => {
        input.disabled = !enabled;
        if (!enabled) {
          input.dataset.configDisabled = "true";
        } else {
          delete input.dataset.configDisabled;
        }
      });
    });
  }

  function applyResultFieldState(table, field, enabled) {
    const markedCells = table.querySelectorAll(`[data-result-field="${field}"]`);
    if (markedCells.length) {
      markedCells.forEach((cell) => {
        cell.hidden = !enabled;
        cell.classList.toggle("field-disabled", !enabled);
        cell.querySelectorAll("input, select, textarea, button").forEach((input) => {
          input.disabled = !enabled;
          if (!enabled) {
            input.dataset.configDisabled = "true";
          } else {
            delete input.dataset.configDisabled;
          }
        });
      });
      return;
    }

    const index = RESULT_FIELDS.indexOf(field);
    if (index >= 0) {
      applyResultColumnState(table, index, enabled);
    }
  }

  function findRequestFieldLabelSpan(form, field) {
    const control = form.elements[field];
    if (!control || typeof control.closest !== "function") {
      return null;
    }

    const row = control.closest("label, .field-row");
    if (!row || typeof row.querySelector !== "function") {
      return null;
    }

    return row.querySelector("span");
  }

  function decoratedLabel(baseText, existingText) {
    const existing = String(existingText == null ? "" : existingText);
    const suffix = `${/\*/.test(existing) ? " *" : ""}${/:/.test(existing) ? " :" : ""}`;
    return `${baseText}${suffix}`;
  }

  function applyRequestFieldLabel(form, field, customLabel) {
    const span = findRequestFieldLabelSpan(form, field);
    if (!span) {
      return;
    }

    span.textContent = decoratedLabel(customLabel, span.textContent);
  }

  function applyResultFieldLabel(form, field, customLabel) {
    const header = form.querySelector(`thead th[data-result-field="${field}"]`);
    if (header) {
      header.textContent = customLabel;
    }

    form.querySelectorAll(`td[data-result-field="${field}"]`).forEach((cell) => {
      if (cell.hasAttribute("data-label")) {
        cell.setAttribute("data-label", customLabel);
      }
    });
  }

  function readCustomFieldControlValue(control, type) {
    if (!control) {
      return type === "checkbox" ? false : "";
    }

    if (type === "checkbox") {
      return Boolean(control.checked);
    }

    if (type === "number") {
      return normalizeValue("slumpMeasured", control.value);
    }

    return normalizeText(control.value);
  }

  function isCustomFieldValueFilled(type, value) {
    if (type === "checkbox") {
      return Boolean(value);
    }

    if (type === "number") {
      return typeof value === "number" && Number.isFinite(value);
    }

    return normalizeText(value) !== "";
  }

  function formatCustomFieldDisplayValue(def, value) {
    if (def.type === "checkbox") {
      return value ? "Yes" : "No";
    }

    if (value == null || value === "") {
      return "";
    }

    return String(value);
  }

  function customRequestFieldHtml(def) {
    const formLabel = getCustomFieldFormLabel(def);
    const requiredMark = def.required ? " *" : "";
    const inputName = customFieldInputName(def.id);
    const hidden = def.enabled === false ? " hidden" : "";
    const disabled = def.enabled === false ? " disabled" : "";
    const requiredAttr = def.required && def.enabled !== false ? " required" : "";
    const commonAttrs = ` name="${inputName}" data-custom-field-id="${def.id}" data-custom-field-type="${def.type}"${requiredAttr}${disabled}`;

    if (def.type === "checkbox") {
      return `
        <label class="field-row toggle-row custom-field-row" data-custom-field-row="${def.id}"${hidden}>
          <span>${formLabel}${requiredMark} :</span>
          <input type="checkbox"${commonAttrs}>
        </label>
      `;
    }

    if (def.type === "textarea") {
      return `
        <label class="field-row custom-field-row" data-custom-field-row="${def.id}"${hidden}>
          <span>${formLabel}${requiredMark} :</span>
          <textarea${commonAttrs}></textarea>
        </label>
      `;
    }

    const inputType = def.type === "number" || def.type === "date" ? def.type : "text";
    const extraAttrs = def.type === "number" ? ' min="0" step="1"' : "";

    return `
      <label class="field-row custom-field-row" data-custom-field-row="${def.id}"${hidden}>
        <span>${formLabel}${requiredMark} :</span>
        <input type="${inputType}"${commonAttrs}${extraAttrs}>
      </label>
    `;
  }

  function applyCustomRequestFields(form, config, values) {
    const container = form.querySelector("#customRequestFields, .custom-request-fields");
    if (!container) {
      return;
    }

    const normalized = normalizeFormFieldConfig(config);
    const valueMap = values && typeof values === "object" ? values : {};

    container.innerHTML = normalized.customRequestFields
      .map((def) => customRequestFieldHtml(def))
      .join("");

    normalized.customRequestFields.forEach((def) => {
      const control = form.querySelector(`[data-custom-field-id="${def.id}"]`);
      if (!control) {
        return;
      }

      const value = valueMap[def.id];
      if (def.type === "checkbox") {
        control.checked = Boolean(value);
      } else if (value != null && value !== "") {
        control.value = def.type === "date" ? String(value).slice(0, 10) : value;
      }

      if (def.enabled === false) {
        control.disabled = true;
        const row = control.closest(".custom-field-row");
        if (row) {
          row.hidden = true;
        }
        control.removeAttribute("required");
      }
    });
  }

  function collectExtraFields(form) {
    const extraFields = {};

    form.querySelectorAll("[data-custom-field-id]").forEach((control) => {
      const id = control.dataset.customFieldId;
      if (!id) {
        return;
      }

      extraFields[id] = readCustomFieldControlValue(control, control.dataset.customFieldType || "text");
    });

    return extraFields;
  }

  function normalizeStoredExtraFieldValue(def, value) {
    if (def.type === "checkbox") {
      return Boolean(value);
    }

    if (def.type === "number") {
      return normalizeValue("slumpMeasured", value);
    }

    return normalizeText(value);
  }

  function normalizeExtraFields(raw, config) {
    const defs = getCustomRequestFields(config);
    if (!defs.length) {
      return {};
    }

    const allowed = new Set(defs.map((def) => def.id));
    const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const extraFields = {};

    allowed.forEach((id) => {
      if (!(id in source)) {
        return;
      }

      const def = defs.find((item) => item.id === id);
      if (!def) {
        return;
      }

      extraFields[id] = normalizeStoredExtraFieldValue(def, source[id]);
    });

    return extraFields;
  }

  function validateExtraFields(extraFields, config) {
    const defs = getEnabledCustomRequestFields(config).filter((def) => def.required);
    const values = extraFields && typeof extraFields === "object" ? extraFields : {};
    const missingFieldKeys = defs
      .filter((def) => !isCustomFieldValueFilled(def.type, values[def.id]))
      .map((def) => def.id);
    const missingFields = missingFieldKeys.map((id) => {
      const def = defs.find((item) => item.id === id);
      return def ? def.label : id;
    });

    return {
      valid: missingFieldKeys.length === 0,
      missingFieldKeys,
      missingFields,
      message: missingFieldKeys.length
        ? `Please fill in all request details before submitting: ${missingFields.join(", ")}`
        : ""
    };
  }

  function getExtraFieldValue(data, id) {
    if (!data || !data.extraFields || typeof data.extraFields !== "object") {
      return "";
    }

    return data.extraFields[id];
  }

  function applyFieldLabels(form, config) {
    if (!form) {
      return normalizeFormFieldConfig(config);
    }

    const normalized = normalizeFormFieldConfig(config);

    FORM_FIELDS.forEach((field) => {
      const customLabel = normalized.requestLabels[field];
      if (customLabel) {
        applyRequestFieldLabel(form, field, customLabel);
      }
    });

    RESULT_FIELDS.forEach((field) => {
      const customLabel = normalized.resultLabels[field];
      if (customLabel) {
        applyResultFieldLabel(form, field, customLabel);
      }
    });

    return normalized;
  }

  function applyFormFieldConfig(form, config, options) {
    if (!form) {
      return normalizeFormFieldConfig(config);
    }

    const normalized = normalizeFormFieldConfig(config);

    FORM_FIELDS.forEach((field) => {
      applyRequestFieldState(form, field, normalized.requestFields[field] !== false);
    });

    const table = form.querySelector(".results-table");
    if (table) {
      RESULT_FIELDS.forEach((field) => {
        applyResultFieldState(table, field, normalized.resultFields[field] !== false);
      });
    }

    applyFieldLabels(form, normalized);
    applyCustomRequestFields(form, normalized, options && options.extraFieldValues);

    syncNativeFormConstraints(form, {
      config: normalized,
      activeStep: options && options.activeStep
    });

    return normalized;
  }

  function syncFormFieldConfig(form, config, options) {
    return applyFormFieldConfig(form, config, options);
  }

  function readLabelOverride(editorForm, inputName, defaultLabel) {
    const control = editorForm.elements[inputName];
    if (!control || typeof control.value !== "string") {
      return "";
    }

    const trimmed = control.value.trim();
    if (!trimmed || trimmed === defaultLabel) {
      return "";
    }

    return trimmed;
  }

  function readFormFieldConfigFromEditor(editorForm) {
    const config = defaultFormFieldConfig();

    FORM_FIELDS.forEach((field) => {
      const control = editorForm.elements[`request-${field}`];
      if (control) {
        config.requestFields[field] = Boolean(control.checked);
      }

      const customLabel = readLabelOverride(
        editorForm,
        `request-label-${field}`,
        REQUEST_FIELD_LABELS[field] || field
      );
      if (customLabel) {
        config.requestLabels[field] = customLabel;
      }
    });

    RESULT_FIELDS.forEach((field) => {
      const control = editorForm.elements[`result-${field}`];
      if (control) {
        config.resultFields[field] = Boolean(control.checked);
      }

      const customLabel = readLabelOverride(
        editorForm,
        `result-label-${field}`,
        RESULT_FIELD_LABELS[field] || field
      );
      if (customLabel) {
        config.resultLabels[field] = customLabel;
      }
    });

    const customRows = editorForm.querySelectorAll(".custom-field-editor");
    customRows.forEach((row) => {
      const idControl = row.querySelector('[name^="custom-field-id-"]');
      const labelControl = row.querySelector('[name^="custom-field-label-"]');
      const typeControl = row.querySelector('[name^="custom-field-type-"]');
      const requiredControl = row.querySelector('[name^="custom-field-required-"]');
      const enabledControl = row.querySelector('[name^="custom-field-enabled-"]');
      const formLabelControl = row.querySelector('[name^="custom-field-form-label-"]');

      const def = normalizeCustomFieldDefinition({
        id: idControl ? idControl.value : "",
        label: labelControl ? labelControl.value : "",
        type: typeControl ? typeControl.value : "text",
        required: requiredControl ? requiredControl.checked : false,
        enabled: enabledControl ? enabledControl.checked : true,
        formLabel: formLabelControl ? formLabelControl.value : ""
      });

      if (def) {
        config.customRequestFields.push(def);
      }
    });

    config.customRequestFields = normalizeCustomRequestFields(config.customRequestFields);

    return config;
  }

  function validateCubeRequestPayload(payload, config) {
    const requiredFields = config ? getActiveRequiredFormFields(config) : REQUIRED_FORM_FIELDS;
    const missingFieldKeys = requiredFields.filter((field) => !isRequestFieldFilled(field, payload[field]));
    const missingFields = missingFieldKeys.map((field) => REQUEST_FIELD_LABELS[field] || field);
    const extraValidation = config
      ? validateExtraFields(payload.extraFields || {}, config)
      : { valid: true, missingFieldKeys: [], missingFields: [], message: "" };

    const combinedMissingKeys = missingFieldKeys.concat(extraValidation.missingFieldKeys || []);
    const combinedMissingFields = missingFields.concat(extraValidation.missingFields || []);

    return {
      valid: combinedMissingKeys.length === 0,
      missingFieldKeys: combinedMissingKeys,
      missingFields: combinedMissingFields,
      message: combinedMissingKeys.length
        ? `Please fill in all request details before submitting: ${combinedMissingFields.join(", ")}`
        : ""
    };
  }

  function validateCubeRequestForm(form, config) {
    const payload = FORM_FIELDS.reduce((request, field) => {
      request[field] = readFormValue(form, field);
      return request;
    }, {});
    payload.extraFields = collectExtraFields(form);

    return validateCubeRequestPayload(payload, config);
  }

  function buildCubeRequestFromForm(form) {
    const payload = FORM_FIELDS.reduce((request, field) => {
      request[field] = readFormValue(form, field);
      return request;
    }, {});

    applyLegacyRequestAliases(payload);
    payload.template = form.dataset.template || "Original";
    payload.status = payload.status || "Draft";
    payload.results = collectResultRows(form);
    payload.customFields = collectCustomFields(form);
    payload.extraFields = collectExtraFields(form);

    if (!Object.keys(payload.extraFields).length) {
      delete payload.extraFields;
    }

    return payload;
  }

  function firstTextValue(values) {
    for (const value of values) {
      const text = normalizeText(value);
      if (text) {
        return text;
      }
    }

    return "";
  }

  function applyLegacyRequestAliases(payload) {
    payload.internalDate = firstTextValue([payload.internalDate, payload.dateOfCast]);
    payload.projectCode = firstTextValue([payload.projectCode, payload.projectErp]);
    payload.reportNo = firstTextValue([payload.reportNo, payload.cubeJobNumber]);
    payload.client = firstTextValue([payload.client, payload.customerBilling, payload.clientNameOnReport]);
    payload.method = firstTextValue([payload.method, payload.testItem]);
    payload.project = firstTextValue([payload.project, payload.projectNameOnReport, payload.projectErp]);
    payload.dateTimeSampled = firstTextValue([payload.dateTimeSampled, payload.dateOfCast]);
    return payload;
  }

  const CUBE_REQUEST_UPDATE_FIELDS = [
    "internalDate",
    "projectCode",
    "reportNo",
    "client",
    "method",
    "project",
    "concreteGrade",
    "supplier",
    "locationRepresented",
    "additionalInformation",
    "dateTimeSampled",
    "slumpMeasured",
    "specimenSize",
    "slumpSpecified",
    "projectErp",
    "customerBilling",
    "projectNameOnReport",
    "clientNameOnReport",
    "contact",
    "enableManualCubeJobNumber",
    "cubeJobNumber",
    "quote",
    "testItem",
    "supplierDisplay",
    "dateOfCast",
    "reportGrade",
    "personInCharge",
    "managerInCharge",
    "customFields",
    "extraFields",
    "erpStatus",
    "rpaStatus",
    "template",
    "status",
    "results"
  ];

  function normalizeResultRowsForUpdate(results) {
    if (!Array.isArray(results)) {
      return [];
    }

    return results
      .map((row) => RESULT_FIELDS.reduce((normalized, field) => {
        normalized[field] = normalizeValue(field, row && row[field]);
        return normalized;
      }, {}))
      .filter(hasRowValue);
  }

  function sanitizeCubeRequestUpdatePayload(payload) {
    const clean = { ...payload };

    if ("customFields" in clean) {
      clean.customFields = normalizeCustomFields(clean.customFields);
    }

    if ("status" in clean) {
      clean.status = normalizeText(clean.status) || "Draft";
    }

    if ("template" in clean) {
      clean.template = normalizeText(clean.template) || "Original";
    }

    if ("enableManualCubeJobNumber" in clean) {
      clean.enableManualCubeJobNumber = Boolean(clean.enableManualCubeJobNumber);
    }

    if ("results" in clean) {
      clean.results = normalizeResultRowsForUpdate(clean.results);
    }

    if ("extraFields" in clean) {
      if (!clean.extraFields || typeof clean.extraFields !== "object" || Array.isArray(clean.extraFields)) {
        delete clean.extraFields;
      } else if (!Object.keys(clean.extraFields).length) {
        delete clean.extraFields;
      }
    }

    return clean;
  }

  function cubeRequestFieldValuesEqual(field, left, right) {
    if (field === "results") {
      return JSON.stringify(normalizeResultRowsForUpdate(left)) ===
        JSON.stringify(normalizeResultRowsForUpdate(right));
    }

    if (field === "customFields") {
      return JSON.stringify(normalizeCustomFields(left)) ===
        JSON.stringify(normalizeCustomFields(right));
    }

    if (field === "extraFields") {
      const leftMap = left && typeof left === "object" && !Array.isArray(left) ? left : {};
      const rightMap = right && typeof right === "object" && !Array.isArray(right) ? right : {};
      return JSON.stringify(leftMap) === JSON.stringify(rightMap);
    }

    if (NUMBER_FIELDS.has(field)) {
      const leftNumber = left == null || left === "" ? null : Number(left);
      const rightNumber = right == null || right === "" ? null : Number(right);

      if (leftNumber === null && rightNumber === null) {
        return true;
      }

      return leftNumber === rightNumber &&
        Number.isFinite(leftNumber) &&
        Number.isFinite(rightNumber);
    }

    if (CHECKBOX_FIELDS.has(field)) {
      return Boolean(left) === Boolean(right);
    }

    return normalizeText(left) === normalizeText(right);
  }

  function buildCubeRequestUpdatePatch(existing, payload) {
    const sanitized = sanitizeCubeRequestUpdatePayload(payload);
    const source = existing && typeof existing === "object" ? existing : {};
    const patch = {};

    CUBE_REQUEST_UPDATE_FIELDS.forEach((field) => {
      if (!(field in sanitized)) {
        return;
      }

      if (!cubeRequestFieldValuesEqual(field, source[field], sanitized[field])) {
        patch[field] = sanitized[field];
      }
    });

    return patch;
  }

  function formatDate(value) {
    if (!value) {
      return "";
    }

    if (typeof value === "string") {
      return value.slice(0, 10);
    }

    if (typeof value.toDate === "function") {
      return value.toDate().toISOString().slice(0, 10);
    }

    if (value instanceof Date) {
      return value.toISOString().slice(0, 10);
    }

    return "";
  }

  function normalizeCubeRequestForDashboard(data, id) {
    const customFields = normalizeCustomFields(data.customFields);

    return {
      id,
      reportNo: normalizeText(data.reportNo || data.cubeJobNumber || data.reportNumber),
      client: normalizeText(data.client || data.customerBilling || data.clientNameOnReport),
      project: normalizeText(data.project || data.projectNameOnReport || data.projectErp),
      template: normalizeText(data.template) || "Original",
      status: normalizeText(data.status) || "Draft",
      updatedAt: formatDate(data.updatedAt) || formatDate(data.internalDate) || formatDate(data.dateOfCast),
      grade: normalizeText(data.concreteGrade || data.reportGrade || data.grade),
      location: normalizeText(data.locationRepresented || data.location),
      notes: normalizeText(data.additionalInformation || data.notes),
      internalDate: formatDate(data.internalDate) || formatDate(data.dateOfCast),
      projectCode: normalizeText(data.projectCode || data.projectErp),
      method: normalizeText(data.method || data.testItem),
      supplier: normalizeText(data.supplier),
      dateTimeSampled: normalizeText(data.dateTimeSampled || data.dateOfCast),
      slumpMeasured: data.slumpMeasured,
      specimenSize: normalizeText(data.specimenSize),
      slumpSpecified: data.slumpSpecified,
      projectErp: normalizeText(data.projectErp || data.projectCode),
      customerBilling: normalizeText(data.customerBilling || data.client),
      projectNameReport: normalizeText(data.projectNameOnReport || data.projectNameReport || data.project),
      clientReport: normalizeText(data.clientNameOnReport || data.clientReport || data.client),
      contactPerson: normalizeText(data.contact || data.contactPerson),
      enableManualCubeJob: Boolean(data.enableManualCubeJobNumber || data.enableManualCubeJob),
      cubeJob: normalizeText(data.cubeJobNumber || data.cubeJob || data.reportNo),
      quote: normalizeText(data.quote),
      testItem: normalizeText(data.testItem || data.method),
      supplierDisplay: normalizeText(data.supplierDisplay || data.supplier),
      dateOfCast: formatDate(data.dateOfCast) || formatDate(data.internalDate),
      gradeFreeText: normalizeText(data.reportGrade || data.gradeFreeText),
      personInCharge: normalizeText(data.personInCharge),
      managerInCharge: normalizeText(data.managerInCharge),
      customFields,
      customFieldCount: customFields.length,
      extraFields: data.extraFields && typeof data.extraFields === "object" ? data.extraFields : {},
      raw: data
    };
  }

  function dashboardEditToCubeRequest(formData) {
    const value = (...names) => {
      for (const name of names) {
        const candidate = formData.get(name);
        if (candidate !== null && candidate !== undefined && normalizeText(candidate) !== "") {
          return candidate;
        }
      }

      return "";
    };

    const request = {
      reportNo: normalizeText(value("cubeJobNumber", "reportNo")),
      status: normalizeText(value("status")) || "Draft",
      client: normalizeText(value("customerBilling", "client", "clientNameOnReport")),
      project: normalizeText(value("projectNameOnReport", "project", "projectErp")),
      concreteGrade: normalizeText(value("concreteGrade", "grade")),
      template: normalizeText(value("template")) || "Original",
      locationRepresented: normalizeText(value("locationRepresented", "location")),
      additionalInformation: normalizeText(value("additionalInformation", "notes")),
      internalDate: normalizeText(value("dateOfCast", "internalDate")),
      projectCode: normalizeText(value("projectErp", "projectCode")),
      method: normalizeText(value("testItem", "method")),
      supplier: normalizeText(value("supplier")),
      dateTimeSampled: normalizeText(value("dateOfCast", "dateTimeSampled")),
      slumpMeasured: normalizeValue("slumpMeasured", formData.get("slumpMeasured")),
      specimenSize: normalizeText(formData.get("specimenSize")),
      slumpSpecified: normalizeValue("slumpSpecified", formData.get("slumpSpecified")),
      projectErp: normalizeText(value("projectErp", "projectCode")),
      customerBilling: normalizeText(value("customerBilling", "client")),
      projectNameOnReport: normalizeText(value("projectNameOnReport", "project")),
      clientNameOnReport: normalizeText(value("clientNameOnReport", "client")),
      contact: normalizeText(value("contact")),
      enableManualCubeJobNumber: formData.get("enableManualCubeJobNumber") != null,
      cubeJobNumber: normalizeText(value("cubeJobNumber", "reportNo")),
      quote: normalizeText(value("quote")),
      testItem: normalizeText(value("testItem", "method")),
      supplierDisplay: normalizeText(value("supplierDisplay", "supplier")),
      dateOfCast: normalizeText(value("dateOfCast", "internalDate", "dateTimeSampled")),
      reportGrade: normalizeText(value("reportGrade", "grade", "concreteGrade")),
      personInCharge: normalizeText(value("personInCharge")),
      managerInCharge: normalizeText(value("managerInCharge"))
    };

    request.reportNo = request.reportNo || request.cubeJobNumber;
    request.client = request.client || request.customerBilling || request.clientNameOnReport;
    request.project = request.project || request.projectNameOnReport || request.projectErp;
    request.concreteGrade = request.concreteGrade || request.reportGrade;
    request.internalDate = request.internalDate || request.dateOfCast;
    request.projectCode = request.projectCode || request.projectErp;
    request.method = request.method || request.testItem;
    request.dateTimeSampled = request.dateTimeSampled || request.dateOfCast;
    return request;
  }

  function getCubeRequestFormValue(data, field) {
    if (!data) return "";
    if (CHECKBOX_FIELDS.has(field)) {
      return Boolean(data[field]);
    }

    const fallbackFields = FORM_FIELD_FALLBACKS[field] || [field];
    for (const fallbackField of fallbackFields) {
      const value = data[fallbackField];
      if (value !== undefined && value !== null && normalizeText(value) !== "") {
        return field === "dateOfCast" ? normalizeText(value).slice(0, 10) : value;
      }
    }

    return "";
  }

  return {
    COLLECTION_NAME,
    SETTINGS_COLLECTION,
    FORM_FIELD_CONFIG_DOC_ID,
    FORM_FIELD_CONFIG_STORAGE_KEY,
    FORM_FIELDS,
    REQUIRED_FORM_FIELDS,
    RESULT_FIELDS,
    DROPDOWN_OPTION_FIELDS,
    REQUEST_FIELD_LABELS,
    RESULT_FIELD_LABELS,
    CUSTOM_FIELD_TYPES,
    MAX_CUSTOM_REQUEST_FIELDS,
    defaultFormFieldConfig,
    normalizeFormFieldConfig,
    normalizeCustomFieldDefinition,
    normalizeCustomRequestFields,
    isValidCustomFieldId,
    customFieldInputName,
    getCustomFieldFormLabel,
    getCustomRequestFields,
    getEnabledCustomRequestFields,
    customRequestFieldHtml,
    applyCustomRequestFields,
    collectExtraFields,
    normalizeExtraFields,
    validateExtraFields,
    formatCustomFieldDisplayValue,
    getExtraFieldValue,
    getActiveRequiredFormFields,
    isRequestFieldEnabled,
    isResultFieldEnabled,
    getRequestFieldLabel,
    getResultFieldLabel,
    applyFieldLabels,
    applyFormFieldConfig,
    syncNativeFormConstraints,
    syncFormFieldConfig,
    getRequestFieldStep,
    readFormFieldConfigFromEditor,
    applyFreeTextFlags,
    isDropdownFreeTextField,
    deriveFreeTextDropdownFields,
    mergeFreeTextDropdownFields,
    resolveFreeTextDropdownFields,
    collectFlaggedDropdownValues,
    normalizeDropdownOptionList,
    readSharedDropdownOptions,
    buildSharedDropdownAddValues,
    buildSharedDropdownSaveValues,
    collectCustomFields,
    isRequestFieldFilled,
    validateCubeRequestForm,
    validateCubeRequestPayload,
    buildCubeRequestFromForm,
    dashboardEditToCubeRequest,
    getCubeRequestFormValue,
    normalizeCubeRequestForDashboard,
    CUBE_REQUEST_UPDATE_FIELDS,
    sanitizeCubeRequestUpdatePayload,
    buildCubeRequestUpdatePatch
  };
});
