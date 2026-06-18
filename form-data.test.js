const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const {
  buildCubeRequestFromForm,
  COLLECTION_NAME,
  FORM_FIELDS,
  RESULT_FIELDS,
  normalizeCubeRequestForDashboard
} = require("./cubesync-form-data");

function formFieldNames(html) {
  return Array.from(html.matchAll(/\sname="([^"]+)"/g), (match) => match[1]);
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

function fakeForm(fields, rows) {
  return {
    dataset: { template: "Original" },
    elements: Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [key, { value }])
    ),
    querySelectorAll(selector) {
      return selector === ".results-table tbody tr" ? rows.map(fakeRow) : [];
    }
  };
}

test("original and glassmorphic forms submit the same Firestore fields", () => {
  const originalHtml = fs.readFileSync("index.html", "utf8");
  const glassHtml = fs.readFileSync("glassmorphic.html", "utf8");

  assert.deepEqual(formFieldNames(originalHtml), formFieldNames(glassHtml));

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
  ]);
  assert.deepEqual(RESULT_FIELDS, [
    "testNumber",
    "clientCubeMarking",
    "dateTested",
    "ageDays",
    "weightKg",
    "loadKn",
    "strength",
    "failureMode",
    "barcode"
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

test("form serialization stores barcode text, not generated barcode images", () => {
  const payload = buildCubeRequestFromForm(fakeForm({
    reportNo: "RAK-CUBE-42",
    client: "Acme",
    specimenSize: "150 x 150 x 150"
  }, [
    {
      testNumber: "T-001",
      clientCubeMarking: "CUBE-A",
      ageDays: "7",
      barcode: "RAK-CUBE-42-T-001",
      barcodeSvg: "<svg></svg>",
      barcodeImage: "data:image/png;base64,abc"
    }
  ]));

  assert.equal(payload.results.length, 1);
  assert.equal(payload.results[0].barcode, "RAK-CUBE-42-T-001");
  assert.equal(payload.results[0].ageDays, 7);
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
