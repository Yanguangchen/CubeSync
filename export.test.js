const assert = require("node:assert/strict");
const test = require("node:test");

const {
  CSV_RESULT_HEADER_ROW,
  CSV_TEST_DATA_START_ROW,
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
  // Rows between request fields and result header must be blank
  for (let i = 36; i < CSV_RESULT_HEADER_ROW - 1; i++) {
    assert.equal(rows[i], "", `row ${i + 1} should be blank padding`);
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
