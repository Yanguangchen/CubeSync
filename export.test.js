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
          testNumber: "T-001",
          clientCubeMarking: "CUBE-A",
          dateTested: "2026-06-17",
          ageDays: 7,
          weightKg: 8.25,
          loadKn: 620,
          strength: 35.1,
          failureMode: "Normal",
          barcode: "RAK-CUBE-001-T-001"
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

test("CSV export keeps test result data on a fixed row", () => {
  const csv = buildFormCsv(sampleForm());
  const rows = csv.trimEnd().split("\r\n");
  const resultHeader = RESULT_FIELDS.map((field) => field.label).join(",");

  assert.equal(CSV_RESULT_HEADER_ROW, 21);
  assert.equal(CSV_TEST_DATA_START_ROW, 22);
  assert.equal(rows[0], "CubeSync Concrete Cube Request");
  assert.equal(rows[1], "Request field,Value");
  assert.equal(rows[2], "Document ID,doc-1");
  assert.equal(rows[CSV_RESULT_HEADER_ROW - 1], resultHeader);
  assert.equal(
    rows[CSV_TEST_DATA_START_ROW - 1],
    "T-001,CUBE-A,2026-06-17,7,8.25,620,35.1,Normal,RAK-CUBE-001-T-001"
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
          testNumber: "T-001",
          failureMode: "Shear, \"angled\"\nline",
          barcode: "ESCAPE-001"
        }
      ]
    }
  }));

  assert.match(csv, /Client,"Acme, ""North""\nDivision"/);
  assert.match(csv, /Project,"Tower, Phase 2"/);
  assert.match(csv, /T-001,,,,,,,"Shear, ""angled""\nline",ESCAPE-001/);
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
