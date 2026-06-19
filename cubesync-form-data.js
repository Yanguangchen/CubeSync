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
    "slumpSpecified"
  ];
  const RESULT_FIELDS = [
    "testNumber",
    "clientCubeMarking",
    "dateTested",
    "ageDays",
    "weightKg",
    "loadKn",
    "strength",
    "failureMode",
    "barcode"
  ];
  const NUMBER_FIELDS = new Set([
    "slumpMeasured",
    "slumpSpecified",
    "ageDays",
    "weightKg",
    "loadKn",
    "strength"
  ]);
  const REQUEST_FIELD_LABELS = {
    internalDate: "Date",
    projectCode: "Project code",
    reportNo: "Report no.",
    client: "Client",
    method: "Method",
    project: "Project",
    concreteGrade: "Concrete grade",
    supplier: "Supplier",
    locationRepresented: "Location represented",
    additionalInformation: "Additional information",
    dateTimeSampled: "Date & time sampled",
    slumpMeasured: "Slump measured (mm)",
    specimenSize: "Specimen size (mm)",
    slumpSpecified: "Slump specified (mm)"
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
    const missingFieldKeys = FORM_FIELDS.filter((field) => !isRequestFieldFilled(field, payload[field]));
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

    payload.template = form.dataset.template || "Original";
    payload.status = payload.status || "Draft";
    payload.results = collectResultRows(form);

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
      reportNo: normalizeText(data.reportNo || data.reportNumber),
      client: normalizeText(data.client),
      project: normalizeText(data.project),
      template: normalizeText(data.template) || "Original",
      status: normalizeText(data.status) || "Draft",
      updatedAt: formatDate(data.updatedAt) || formatDate(data.internalDate),
      grade: normalizeText(data.concreteGrade || data.grade),
      location: normalizeText(data.locationRepresented || data.location),
      notes: normalizeText(data.additionalInformation || data.notes),
      raw: data
    };
  }

  function dashboardEditToCubeRequest(formData) {
    return {
      reportNo: normalizeText(formData.get("reportNo")),
      status: normalizeText(formData.get("status")) || "Draft",
      client: normalizeText(formData.get("client")),
      project: normalizeText(formData.get("project")),
      concreteGrade: normalizeText(formData.get("grade")),
      template: normalizeText(formData.get("template")) || "Original",
      locationRepresented: normalizeText(formData.get("location")),
      additionalInformation: normalizeText(formData.get("notes"))
    };
  }

  return {
    COLLECTION_NAME,
    FORM_FIELDS,
    RESULT_FIELDS,
    REQUEST_FIELD_LABELS,
    isRequestFieldFilled,
    validateCubeRequestForm,
    validateCubeRequestPayload,
    buildCubeRequestFromForm,
    dashboardEditToCubeRequest,
    normalizeCubeRequestForDashboard
  };
});
