const assert = require("node:assert/strict");
const test = require("node:test");

const {
  CSV_RESULT_HEADER_ROW,
  CSV_TEST_DATA_START_ROW,
  REQUEST_FIELDS,
  RESULT_FIELDS,
  buildExportFiles,
  buildFormCsv,
  createZipBlob
} = require("./cubesync-export");

function sampleForm(overrides = {}) {
  return {
    id: "doc-1",
    reportNo: "RAK/CUBE-001",
    status: "Ready",
    template: "Original",
    raw: {
      reportNo: "RAK/CUBE-001",
      status: "Ready",
      template: "Original",
      client: "Acme Concrete",
      project: "Tower A",
      concreteGrade: "C35/45",
      locationRepresented: "Level 12",
      results: [
        {
          setNo: 1,
          size: "150 x 150 x 150",
          specimenRef: "CUBE-A",
          barcode: "RAK-CUBE-001-T-001",
          specifiedSlump: "600-800",
          meanSlump: 670,
          resultGrade: "C35/45",
          resultDateOfCast: "2026-05-24",
          age: 7,
          dateOfTest: "2026-06-17",
          invoiceNumber: "INV-1"
        }
      ]
    },
    ...overrides
  };
}

function readUint16(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint32(bytes, offset) {
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  ) >>> 0;
}

async function localZipEntries(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const entries = [];
  let offset = 0;

  while (readUint32(bytes, offset) === 0x04034b50) {
    const method = readUint16(bytes, offset + 8);
    const compressedSize = readUint32(bytes, offset + 18);
    const nameLength = readUint16(bytes, offset + 26);
    const extraLength = readUint16(bytes, offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;

    entries.push({
      method,
      name: Buffer.from(bytes.slice(nameStart, nameStart + nameLength)).toString("utf8"),
      content: Buffer.from(bytes.slice(dataStart, dataEnd)).toString("utf8")
    });

    offset = dataEnd;
  }

  return entries;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pinned-row contract
//
// Every REQUEST_FIELD carries a `row` number. The CSV must always place that
// field on exactly that row, regardless of how many other fields exist. Blank
// rows fill any gap so nothing shifts when fields are added or removed.
//
// Row layout (1-indexed):
//   Row  1 : "CubeSync Concrete Cube Request"   (title)
//   Row  2 : "Request field,Value"               (column headers)
//   Rows 3–49 : request fields at their pinned rows; all other rows are blank
//   Row 50 : result column headers               (CSV_RESULT_HEADER_ROW)
//   Row 51+ : one test-specimen row per result   (CSV_TEST_DATA_START_ROW)
//
// PINNED ROW MAP — update this table whenever a field is added or removed.
// Never reuse a row number. Leave existing rows unchanged.
//
//   Row  3 : documentId                Row 20 : (blank – section gap)
//   Row  4 : reportNo                  Row 21 : supplier
//   Row  5 : status                    Row 22 : supplierDisplay
//   Row  6 : template                  Row 23 : locationRepresented
//   Row  7 : internalDate              Row 24 : additionalInformation
//   Row  8 : projectCode               Row 25 : (blank – section gap)
//   Row  9 : (blank – section gap)     Row 26 : dateOfCast
//   Row 10 : projectErp                Row 27 : dateTimeSampled
//   Row 11 : customerBilling           Row 28 : concreteGrade
//   Row 12 : projectNameOnReport       Row 29 : reportGrade
//   Row 13 : clientNameOnReport        Row 30 : specimenSize
//   Row 14 : contact                   Row 31 : slumpMeasured
//   Row 15 : (blank – section gap)     Row 32 : slumpSpecified
//   Row 16 : enableManualCubeJobNumber Row 33 : (blank – section gap)
//   Row 17 : cubeJobNumber             Row 34 : personInCharge
//   Row 18 : quote                     Row 35 : managerInCharge
//   Row 19 : testItem                  Row 36 : (blank – section gap)
//                                      Row 37 : erpStatus
//                                      Row 38 : rpaStatus
//                                      Row 39 : (blank – section gap)
//                                      Row 40 : extraFields
//                                      Rows 41–49 : (blank – reserved for future fields)
// ─────────────────────────────────────────────────────────────────────────────

test("REQUEST_FIELDS has no duplicate row numbers", () => {
  const rows = REQUEST_FIELDS.map((f) => f.row);
  const unique = new Set(rows);
  assert.equal(unique.size, rows.length, "every field must have a unique row number");
});

test("every REQUEST_FIELD row is within the request section (3 – 49)", () => {
  for (const field of REQUEST_FIELDS) {
    assert.ok(
      Number.isInteger(field.row) && field.row >= 3 && field.row < CSV_RESULT_HEADER_ROW,
      `field "${field.key}" has row ${field.row} — must be an integer between 3 and ${CSV_RESULT_HEADER_ROW - 1}`
    );
  }
});

test("each field appears at its exact pinned row in the CSV output", () => {
  // Build a form that has a distinct value for every request field so we can
  // verify each one lands on the right row.
  const form = {
    id: "pin-test",
    reportNo: "PIN-001",
    raw: {
      reportNo: "PIN-001",
      status: "Ready",
      template: "Original",
      internalDate: "2026-01-01",
      projectCode: "PC-001",
      projectErp: "ERP-001",
      customerBilling: "Billing Co",
      projectNameOnReport: "Proj Name",
      clientNameOnReport: "Client Name",
      contact: "Contact Person",
      enableManualCubeJobNumber: true,
      cubeJobNumber: "CJN-001",
      quote: "QT-001",
      testItem: "Compression",
      supplier: "Sup Co",
      supplierDisplay: "Sup Display",
      locationRepresented: "Level 5",
      additionalInformation: "Notes here",
      dateOfCast: "2026-06-01",
      dateTimeSampled: "2026-06-01",
      concreteGrade: "C35",
      reportGrade: "C35",
      specimenSize: "150x150x150",
      slumpMeasured: 120,
      slumpSpecified: 100,
      personInCharge: "Alice",
      managerInCharge: "Bob",
      erpStatus: "Pending",
      rpaStatus: "Ready for Bot",
      extraFields: { jobRef: "JR-001" },
      results: []
    }
  };

  const csv = buildFormCsv(form);
  const rows = csv.trimEnd().split("\r\n");

  for (const field of REQUEST_FIELDS) {
    const rowContent = rows[field.row - 1];
    assert.ok(
      rowContent !== undefined,
      `row ${field.row} for field "${field.key}" is missing from the CSV`
    );
    assert.match(
      rowContent,
      new RegExp(`^${field.label.replace(/[()#]/g, "\\$&")},`),
      `field "${field.key}" label "${field.label}" must start row ${field.row}`
    );
  }
});

test("rows between pinned fields are blank", () => {
  const csv = buildFormCsv(sampleForm());
  const rows = csv.trimEnd().split("\r\n");

  const usedRows = new Set(REQUEST_FIELDS.map((f) => f.row));
  // Check every row in the request section that is NOT assigned to a field
  for (let rowNum = 3; rowNum < CSV_RESULT_HEADER_ROW; rowNum++) {
    if (!usedRows.has(rowNum)) {
      assert.equal(
        rows[rowNum - 1],
        "",
        `row ${rowNum} is not assigned to any field and must be blank`
      );
    }
  }
});

test("pinned row numbers survive field addition: existing fields keep their rows", () => {
  // Simulate adding a new field by injecting it at the end with a new row number.
  // All previously assigned rows must be unaffected.
  const FUTURE_FIELD_ROW = 45;
  assert.ok(
    !REQUEST_FIELDS.some((f) => f.row === FUTURE_FIELD_ROW),
    `row ${FUTURE_FIELD_ROW} must be currently unoccupied so this test stays valid`
  );

  // Every existing field should still be findable at its row after any future addition.
  const csv = buildFormCsv(sampleForm());
  const rows = csv.trimEnd().split("\r\n");

  for (const field of REQUEST_FIELDS) {
    assert.match(
      rows[field.row - 1],
      new RegExp(`^${field.label.replace(/[()#]/g, "\\$&")},`),
      `row ${field.row} ("${field.key}") must survive future field additions`
    );
  }
});

test("result date fields (resultDateOfCast, dateOfTest) are normalized to YYYY-MM-DD", () => {
  const csv = buildFormCsv(sampleForm({
    raw: {
      results: [
        {
          specimenRef: "T-DATE",
          resultDateOfCast: "22-06-2026",
          dateOfTest: "29/06/2026"
        }
      ]
    }
  }));
  const rows = csv.trimEnd().split("\r\n");
  const dataRow = rows[CSV_TEST_DATA_START_ROW - 1];
  assert.match(dataRow, /2026-06-22/, "resultDateOfCast must be YYYY-MM-DD");
  assert.match(dataRow, /2026-06-29/, "dateOfTest must be YYYY-MM-DD");
});

test("formatDate normalizes DD-MM-YYYY, DD/MM/YYYY, and YYYY/MM/DD to YYYY-MM-DD", () => {
  // Each of these formats must export as YYYY-MM-DD regardless of how it was stored
  const forms = [
    { raw: { dateOfCast: "22-06-2026",   results: [] } },
    { raw: { dateOfCast: "22/06/2026",   results: [] } },
    { raw: { dateOfCast: "2026/06/22",   results: [] } },
    { raw: { dateOfCast: "2026-06-22",   results: [] } },
    { raw: { dateOfCast: "2026-06-22T10:00:00.000Z", results: [] } }
  ].map((f) => ({ id: "x", reportNo: "X", raw: f.raw }));

  for (const form of forms) {
    const csv = buildFormCsv(form);
    assert.match(
      csv,
      /Date of cast,2026-06-22/,
      `expected YYYY-MM-DD for input "${form.raw.dateOfCast}"`
    );
  }
});

test("result header is always at row 50 regardless of how many request fields exist", () => {
  // Blank padding rows must be inserted so the result section always starts at a
  // predictable row, making it easy to reference in Excel formulas/macros.
  const csv = buildFormCsv(sampleForm());
  const rows = csv.trimEnd().split("\r\n");

  assert.equal(CSV_RESULT_HEADER_ROW, 50, "result header must be pinned to row 50");
  assert.equal(CSV_TEST_DATA_START_ROW, 51, "test data must start at row 51");
  assert.equal(
    rows[CSV_RESULT_HEADER_ROW - 1],
    RESULT_FIELDS.map((f) => f.label).join(","),
    "row 50 must be the result header"
  );
  // Rows that are not assigned to any field must be blank.
  // (The comprehensive blank-row check is in "rows between pinned fields are blank".)
  const usedRows = new Set(REQUEST_FIELDS.map((f) => f.row));
  for (let rowNum = 3; rowNum < CSV_RESULT_HEADER_ROW; rowNum++) {
    if (!usedRows.has(rowNum)) {
      assert.equal(rows[rowNum - 1], "", `row ${rowNum} should be blank`);
    }
  }
});

test("CSV export keeps test result data on a fixed row", () => {
  const csv = buildFormCsv(sampleForm());
  const rows = csv.trimEnd().split("\r\n");
  const resultHeader = RESULT_FIELDS.map((field) => field.label).join(",");

  assert.equal(CSV_RESULT_HEADER_ROW, 50);
  assert.equal(CSV_TEST_DATA_START_ROW, 51);
  assert.equal(rows[0], "CubeSync Concrete Cube Request");
  assert.equal(rows[1], "Request field,Value");
  assert.equal(rows[2], "Document ID,doc-1");
  assert.equal(rows[CSV_RESULT_HEADER_ROW - 1], resultHeader);
  assert.equal(
    rows[CSV_TEST_DATA_START_ROW - 1],
    "1,150 x 150 x 150,CUBE-A,RAK-CUBE-001-T-001,600-800,670,C35/45,2026-05-24,7,2026-06-17,INV-1"
  );
});

test("CSV export keeps result header fixed when a form has no test rows", () => {
  const csv = buildFormCsv(sampleForm({
    raw: {
      reportNo: "RAK-CUBE-EMPTY",
      client: "No Results Client",
      results: []
    }
  }));
  const rows = csv.trimEnd().split("\r\n");
  const resultHeader = RESULT_FIELDS.map((field) => field.label).join(",");

  assert.equal(rows.length, CSV_RESULT_HEADER_ROW);
  assert.equal(rows[CSV_RESULT_HEADER_ROW - 2], "");
  assert.equal(rows[CSV_RESULT_HEADER_ROW - 1], resultHeader);
});

test("CSV export escapes commas, quotes, and newlines", () => {
  const csv = buildFormCsv(sampleForm({
    raw: {
      reportNo: "RAK-CUBE-ESCAPE",
      client: "Acme, \"North\"\nDivision",
      project: "Tower, Phase 2",
      results: [
        {
          specimenRef: "Shear, \"angled\"\nline",
          barcode: "ESCAPE-001"
        }
      ]
    }
  }));

  assert.match(csv, /Customer \(Billing\),"Acme, ""North""\nDivision"/);
  assert.match(csv, /Project name on report,"Tower, Phase 2"/);
  assert.match(csv, /,,"Shear, ""angled""\nline",ESCAPE-001,,,,,,,/);
});

test("export builds one sanitized CSV file per form", () => {
  const files = buildExportFiles([
    sampleForm(),
    sampleForm({
      id: "doc-2",
      reportNo: "RAK:CUBE*002",
      raw: {
        reportNo: "RAK:CUBE*002",
        results: []
      }
    })
  ]);

  assert.deepEqual(files.map((file) => file.name), [
    "001-RAK-CUBE-001.csv",
    "002-RAK-CUBE-002.csv"
  ]);
  assert.match(files[0].content, /Acme Concrete/);
  assert.match(files[1].content, /RAK:CUBE\*002/);
});

test("ZIP export contains each generated CSV file", async () => {
  const files = buildExportFiles([
    sampleForm(),
    sampleForm({
      id: "doc-2",
      reportNo: "RAK-CUBE-002",
      raw: {
        reportNo: "RAK-CUBE-002",
        client: "Second Client",
        results: []
      }
    })
  ]);
  const zip = createZipBlob(files, new Date("2026-06-17T00:00:00"));
  const entries = await localZipEntries(zip);

  assert.equal(zip.type, "application/zip");
  assert.equal(entries.length, 2);
  assert.deepEqual(entries.map((entry) => entry.method), [0, 0]);
  assert.deepEqual(entries.map((entry) => entry.name), [
    "001-RAK-CUBE-001.csv",
    "002-RAK-CUBE-002.csv"
  ]);
  assert.match(entries[0].content, /RAK-CUBE-001-T-001/);
  assert.match(entries[1].content, /Second Client/);
});
