const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const {
  buildCubeRequestFromForm,
  buildCubeRequestUpdatePatch,
  COLLECTION_NAME,
  FORM_FIELDS,
  REQUIRED_FORM_FIELDS,
  RESULT_FIELDS,
  validateCubeRequestForm,
  validateCubeRequestPayload,
  normalizeCubeRequestForDashboard,
  deriveFreeTextDropdownFields,
  mergeFreeTextDropdownFields
} = require("./cubesync-form-data");

function formFieldNames(html) {
  return Array.from(html.matchAll(/\sname="([^"]+)"/g), (match) => match[1]);
}

function glassFormFieldNames(glassHtml) {
  const names = formFieldNames(glassHtml);
  const seedMatch = glassHtml.match(/data-initial-result-rows="(\d+)"/);
  if (!seedMatch) {
    return names;
  }

  const count = parseInt(seedMatch[1], 10);
  const markup = require("./cubesync-form-markup");
  for (let rowIndex = 1; rowIndex <= count; rowIndex += 1) {
    names.push(...markup.resultRowFieldNames(rowIndex));
  }
  return names;
}

function fakeRow(values) {
  return {
    querySelector(selector) {
      const match = selector.match(/name\^="([^"]+)"/);
      const field = match && match[1];
      return field && field in values ? { value: values[field] } : null;
    }
  };
}

function fakeControl(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return {
      value: value.value,
      checked: Boolean("checked" in value ? value.checked : value.value),
      dataset: value.dataset || {}
    };
  }

  return {
    value,
    checked: Boolean(value),
    dataset: {}
  };
}

function fakeForm(fields, rows) {
  return {
    dataset: { template: "Original" },
    elements: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, fakeControl(value)])),
    querySelectorAll(selector) {
      return selector === ".results-table tbody tr" ? rows.map(fakeRow) : [];
    }
  };
}

test("original and glassmorphic forms submit the same Firestore fields", () => {
  const originalHtml = fs.readFileSync("index.html", "utf8");
  const glassHtml = fs.readFileSync("glassmorphic.html", "utf8");

  assert.deepEqual(formFieldNames(originalHtml), glassFormFieldNames(glassHtml));

  for (const html of [originalHtml, glassHtml]) {
    assert.match(html, /<form id="cubeRequestForm"[^>]*data-template="/);
    assert.match(html, /cubesync-form-data\.js/);
    assert.match(html, /env\.js/);
    assert.match(html, /firestore\.js/);
    assert.match(html, /recaptcha\/api\.js\?render=explicit/);
    assert.match(html, /id="recaptchaContainer"/);
    assert.match(html, /id="saveFormButton"/);
    assert.match(html, /id="saveStatus"/);
  }
});

test("shared schema maps Firestore cube requests into dashboard records", () => {
  assert.equal(COLLECTION_NAME, "cubeRequests");
  assert.deepEqual(FORM_FIELDS, [
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
  ]);
  assert.deepEqual(REQUIRED_FORM_FIELDS, [
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
  ]);
  assert.deepEqual(RESULT_FIELDS, [
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
  ]);

  const dashboardRecord = normalizeCubeRequestForDashboard({
    reportNo: "RAK-CUBE-1",
    client: "Acme",
    project: "Tower",
    template: "Glassmorphic",
    status: "Ready",
    concreteGrade: "C35/45",
    locationRepresented: "Level 12",
    additionalInformation: "Rush job",
    updatedAt: "2026-06-17"
  }, "doc-1");

  assert.deepEqual(dashboardRecord, {
    id: "doc-1",
    reportNo: "RAK-CUBE-1",
    client: "Acme",
    project: "Tower",
    template: "Glassmorphic",
    status: "Ready",
    updatedAt: "2026-06-17",
    grade: "C35/45",
    location: "Level 12",
    notes: "Rush job",
    internalDate: "",
    projectCode: "",
    method: "",
    supplier: "",
    dateTimeSampled: "",
    slumpMeasured: undefined,
    specimenSize: "",
    slumpSpecified: undefined,
    projectErp: "",
    customerBilling: "Acme",
    projectNameReport: "Tower",
    clientReport: "Acme",
    contactPerson: "",
    enableManualCubeJob: false,
    cubeJob: "RAK-CUBE-1",
    quote: "",
    testItem: "",
    supplierDisplay: "",
    dateOfCast: "",
    gradeFreeText: "",
    personInCharge: "",
    managerInCharge: "",
    customFields: [],
    customFieldCount: 0,
    extraFields: {},
    raw: {
      reportNo: "RAK-CUBE-1",
      client: "Acme",
      project: "Tower",
      template: "Glassmorphic",
      status: "Ready",
      concreteGrade: "C35/45",
      locationRepresented: "Level 12",
      additionalInformation: "Rush job",
      updatedAt: "2026-06-17"
    }
  });
});

test("form serialization stores dropdown free text field metadata", () => {
  const payload = buildCubeRequestFromForm(fakeForm({
    projectErp: {
      value: "Typed ERP Project",
      dataset: { freeTextEntry: "true" }
    },
    supplier: {
      value: "Typed Supplier",
      dataset: { freeTextEntry: "true" }
    },
    contact: {
      value: "Typed Contact",
      dataset: { freeTextEntry: "true" }
    },
    customerBilling: "Selected Billing",
    cubeJobNumber: "RAK-CUBE-42",
    testItem: "Selected Test",
    dateOfCast: "2026-06-18",
    concreteGrade: "C35/45",
    reportGrade: "C35/45",
    supplierDisplay: "Typed Supplier",
    locationRepresented: "Level 12",
    slumpMeasured: "120",
    specimenSize: "150 X 150 X 150",
    slumpSpecified: "100",
    personInCharge: "Selected Person",
    managerInCharge: "Selected Manager"
  }, []));

  assert.deepEqual(payload.customFields, ["projectErp", "supplier"]);
});

test("validateCubeRequestForm requires every request field except test results", () => {
  const completeFields = {
    projectErp: "ERP-001",
    customerBilling: "Acme Billing",
    projectNameOnReport: "Tower",
    clientNameOnReport: "Acme",
    contact: "Jane",
    enableManualCubeJobNumber: false,
    cubeJobNumber: "RAK-CUBE-1",
    quote: "",
    testItem: "Cube",
    concreteGrade: "C35/45",
    reportGrade: "C35/45",
    supplier: "Supplier A",
    supplierDisplay: "Supplier A Display",
    locationRepresented: "Level 12",
    additionalInformation: "",
    dateOfCast: "2026-06-18",
    slumpMeasured: "120",
    specimenSize: "150 x 150 x 150",
    slumpSpecified: "100",
    personInCharge: "Jane",
    managerInCharge: "John"
  };

  const validForm = fakeForm(completeFields, []);
  const validResult = validateCubeRequestForm(validForm);

  assert.equal(validResult.valid, true);
  assert.equal(validResult.message, "");

  const invalidForm = fakeForm({ ...completeFields, customerBilling: "", contact: "" }, []);
  const invalidResult = validateCubeRequestForm(invalidForm);

  assert.equal(invalidResult.valid, false);
  assert.deepEqual(invalidResult.missingFieldKeys, ["customerBilling", "contact"]);
  assert.match(invalidResult.message, /Customer \(Billing\)/);
  assert.match(invalidResult.message, /Contact/);
});

test("validateCubeRequestPayload rejects empty numeric request fields", () => {
  const payload = {
    customerBilling: "Acme Billing",
    contact: "Jane",
    concreteGrade: "C35/45",
    reportGrade: "C35/45",
    supplier: "Supplier A",
    supplierDisplay: "Supplier A Display",
    locationRepresented: "Level 12",
    dateOfCast: "2026-06-18",
    slumpMeasured: null,
    specimenSize: "150 x 150 x 150",
    slumpSpecified: "",
    personInCharge: "Jane",
    managerInCharge: "John"
  };

  const result = validateCubeRequestPayload(payload);

  assert.equal(result.valid, false);
  assert.deepEqual(result.missingFieldKeys, ["slumpMeasured", "slumpSpecified"]);
});

test("form serialization stores barcode text, not generated barcode images", () => {
  const payload = buildCubeRequestFromForm(fakeForm({
    customerBilling: "Acme",
    cubeJobNumber: "RAK-CUBE-42",
    projectNameOnReport: "Tower",
    testItem: "Cube",
    dateOfCast: "2026-06-18",
    specimenSize: "150 x 150 x 150"
  }, [
    {
      specimenRef: "CUBE-A",
      age: "7",
      barcode: "RAK-CUBE-42-T-001",
      barcodeSvg: "<svg></svg>",
      barcodeImage: "data:image/png;base64,abc"
    }
  ]));

  assert.equal(payload.results.length, 1);
  assert.equal(payload.results[0].barcode, "RAK-CUBE-42-T-001");
  assert.equal(payload.results[0].age, 7);
  assert.equal(payload.reportNo, "RAK-CUBE-42");
  assert.equal(payload.client, "Acme");
  assert.equal(payload.project, "Tower");
  assert.equal(payload.method, "Cube");
  assert.equal(payload.internalDate, "2026-06-18");
  assert.equal("barcodeSvg" in payload.results[0], false);
  assert.equal("barcodeImage" in payload.results[0], false);
  assert.equal(JSON.stringify(payload).includes("<svg"), false);
  assert.equal(JSON.stringify(payload).includes("data:image"), false);
});

test("shared schema handles alternative field names and various date types", () => {
  const data = {
    reportNumber: "ALT-001",
    client: "Alt Client",
    project: "Alt Project",
    grade: "C40",
    location: "Site A",
    notes: "Alt Notes",
    internalDate: "2026-01-01T12:00:00Z"
  };

  const record = normalizeCubeRequestForDashboard(data, "alt-1");

  assert.equal(record.reportNo, "ALT-001");
  assert.equal(record.grade, "C40");
  assert.equal(record.location, "Site A");
  assert.equal(record.notes, "Alt Notes");
  assert.equal(record.updatedAt, "2026-01-01");

  // Test Date object
  const dateRecord = normalizeCubeRequestForDashboard({
    internalDate: new Date("2026-02-02")
  }, "date-1");
  assert.equal(dateRecord.updatedAt, "2026-02-02");

  // Test Firebase-style Timestamp
  const tsRecord = normalizeCubeRequestForDashboard({
    internalDate: { toDate: () => new Date("2026-03-03") }
  }, "ts-1");
  assert.equal(tsRecord.updatedAt, "2026-03-03");
});

test("buildCubeRequestUpdatePatch only sends changed fields", () => {
  const existing = {
    status: "Draft",
    template: "Original",
    customerBilling: "Acme",
    client: "Acme",
    customFields: ["supplier"],
    slumpMeasured: 50,
    results: []
  };

  const statusOnly = buildCubeRequestUpdatePatch(existing, {
    ...existing,
    status: "Ready"
  });

  assert.deepEqual(statusOnly, { status: "Ready" });

  const unchanged = buildCubeRequestUpdatePatch(existing, { ...existing });
  assert.deepEqual(unchanged, {});

  const normalizedNumber = buildCubeRequestUpdatePatch(existing, {
    ...existing,
    slumpMeasured: "50"
  });
  assert.deepEqual(normalizedNumber, {});

  const customFieldsCleanup = buildCubeRequestUpdatePatch(existing, {
    ...existing,
    customFields: ["supplier", "not-a-dropdown-field"]
  });
  assert.deepEqual(customFieldsCleanup, {});
});

test("deriveFreeTextDropdownFields flags values missing from the option list", () => {
  const optionsByField = {
    supplier: ["ABC Concrete", "XYZ Ready Mix"],
    projectErp: ["ERP-001", "ERP-002"],
    concreteGrade: ["C32/40", "C40/50"]
  };

  const data = {
    supplier: "Some New Supplier",   // not in options -> free text
    projectErp: "ERP-001",            // matches an option -> not flagged
    concreteGrade: "c32/40",          // case-insensitive match -> not flagged
    personInCharge: "Jane"            // no option list provided -> skipped
  };

  const derived = deriveFreeTextDropdownFields(data, optionsByField);
  assert.deepEqual(derived, ["supplier"]);
});

test("deriveFreeTextDropdownFields uses canonical field fallbacks", () => {
  const optionsByField = { projectErp: ["ERP-001"] };
  // projectCode is the legacy alias for projectErp.
  const data = { projectCode: "Typed Project" };

  assert.deepEqual(deriveFreeTextDropdownFields(data, optionsByField), ["projectErp"]);
});

test("deriveFreeTextDropdownFields skips fields without a known option list", () => {
  const data = { supplier: "Anything", testItem: "Cube Test" };
  assert.deepEqual(deriveFreeTextDropdownFields(data, {}), []);
  assert.deepEqual(deriveFreeTextDropdownFields(data, { supplier: [] }), []);
});

test("mergeFreeTextDropdownFields combines and de-duplicates flag sources", () => {
  const merged = mergeFreeTextDropdownFields(["supplier"], ["supplier", "projectErp"], ["bogus"]);
  assert.deepEqual(merged, ["supplier", "projectErp"]);
});
