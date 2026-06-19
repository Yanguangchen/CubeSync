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
    concreteGrade: "Grade",
    reportGrade: "Grade",
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

  function isRequestFieldFilled(field, value) {
    if (NUMBER_FIELDS.has(field)) {
      return typeof value === "number" && Number.isFinite(value);
    }

    return normalizeText(value) !== "";
  }

  function defaultFormFieldConfig() {
    return {
      requestFields: Object.fromEntries(FORM_FIELDS.map((field) => [field, true])),
      resultFields: Object.fromEntries(RESULT_FIELDS.map((field) => [field, true]))
    };
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

    return { requestFields, resultFields };
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

    syncNativeFormConstraints(form, {
      config: normalized,
      activeStep: options && options.activeStep
    });

    return normalized;
  }

  function syncFormFieldConfig(form, config, options) {
    return applyFormFieldConfig(form, config, options);
  }

  function readFormFieldConfigFromEditor(editorForm) {
    const config = defaultFormFieldConfig();

    FORM_FIELDS.forEach((field) => {
      const control = editorForm.elements[`request-${field}`];
      if (control) {
        config.requestFields[field] = Boolean(control.checked);
      }
    });

    RESULT_FIELDS.forEach((field) => {
      const control = editorForm.elements[`result-${field}`];
      if (control) {
        config.resultFields[field] = Boolean(control.checked);
      }
    });

    return config;
  }

  function validateCubeRequestPayload(payload, config) {
    const requiredFields = config ? getActiveRequiredFormFields(config) : REQUIRED_FORM_FIELDS;
    const missingFieldKeys = requiredFields.filter((field) => !isRequestFieldFilled(field, payload[field]));
    const missingFields = missingFieldKeys.map((field) => REQUEST_FIELD_LABELS[field] || field);

    return {
      valid: missingFieldKeys.length === 0,
      missingFieldKeys,
      missingFields,
      message: missingFieldKeys.length
        ? `Please fill in all request details before submitting: ${missingFields.join(", ")}`
        : ""
    };
  }

  function validateCubeRequestForm(form, config) {
    const payload = FORM_FIELDS.reduce((request, field) => {
      request[field] = readFormValue(form, field);
      return request;
    }, {});

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
      raw: data
    };
  }

  function dashboardEditToCubeRequest(formData) {
    const request = {
      reportNo: normalizeText(formData.get("reportNo")),
      status: normalizeText(formData.get("status")) || "Draft",
      client: normalizeText(formData.get("client")),
      project: normalizeText(formData.get("project")),
      concreteGrade: normalizeText(formData.get("grade")),
      template: normalizeText(formData.get("template")) || "Original",
      locationRepresented: normalizeText(formData.get("location")),
      additionalInformation: normalizeText(formData.get("notes")),
      internalDate: normalizeText(formData.get("internalDate")),
      projectCode: normalizeText(formData.get("projectCode")),
      method: normalizeText(formData.get("method")),
      supplier: normalizeText(formData.get("supplier")),
      dateTimeSampled: normalizeText(formData.get("dateTimeSampled")),
      slumpMeasured: normalizeValue("slumpMeasured", formData.get("slumpMeasured")),
      specimenSize: normalizeText(formData.get("specimenSize")),
      slumpSpecified: normalizeValue("slumpSpecified", formData.get("slumpSpecified"))
    };

    request.cubeJobNumber = request.reportNo;
    request.customerBilling = request.client;
    request.projectNameOnReport = request.project;
    request.projectErp = request.projectCode;
    request.testItem = request.method;
    request.dateOfCast = request.internalDate || request.dateTimeSampled;
    request.supplierDisplay = request.supplier;
    request.reportGrade = request.concreteGrade;
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
    REQUEST_FIELD_LABELS,
    RESULT_FIELD_LABELS,
    defaultFormFieldConfig,
    normalizeFormFieldConfig,
    getActiveRequiredFormFields,
    isRequestFieldEnabled,
    isResultFieldEnabled,
    applyFormFieldConfig,
    syncNativeFormConstraints,
    syncFormFieldConfig,
    getRequestFieldStep,
    readFormFieldConfigFromEditor,
    isRequestFieldFilled,
    validateCubeRequestForm,
    validateCubeRequestPayload,
    buildCubeRequestFromForm,
    dashboardEditToCubeRequest,
    getCubeRequestFormValue,
    normalizeCubeRequestForDashboard
  };
});
