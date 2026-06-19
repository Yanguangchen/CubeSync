(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.CubeSyncFormData = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const COLLECTION_NAME = "cubeRequests";
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

  function validateCubeRequestPayload(payload) {
    const missingFieldKeys = REQUIRED_FORM_FIELDS.filter((field) => !isRequestFieldFilled(field, payload[field]));
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

  function validateCubeRequestForm(form) {
    const payload = FORM_FIELDS.reduce((request, field) => {
      request[field] = readFormValue(form, field);
      return request;
    }, {});

    return validateCubeRequestPayload(payload);
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
    FORM_FIELDS,
    REQUIRED_FORM_FIELDS,
    RESULT_FIELDS,
    REQUEST_FIELD_LABELS,
    isRequestFieldFilled,
    validateCubeRequestForm,
    validateCubeRequestPayload,
    buildCubeRequestFromForm,
    dashboardEditToCubeRequest,
    getCubeRequestFormValue,
    normalizeCubeRequestForDashboard
  };
});
