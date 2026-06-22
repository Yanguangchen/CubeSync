(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.CubeSyncExport = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // ─────────────────────────────────────────────────────────────────────────────
  // Constants
  // ─────────────────────────────────────────────────────────────────────────────

  const CSV_RESULT_HEADER_ROW = 50;
  const CSV_TEST_DATA_START_ROW = 51;

  // Each field carries a `row` number (1-indexed CSV row).
  // That number is a permanent contract — never change or reuse a row number.
  // Add new fields by assigning a previously-unused row in the 3–49 range.
  // Remove fields by deleting the entry; do NOT renumber anything else.
  const REQUEST_FIELDS = [
    // ── Metadata (rows 3–8) ───────────────────────────────────────
    { row:  3, key: "documentId",                label: "Document ID" },
    { row:  4, key: "reportNo",                  label: "Report no." },
    { row:  5, key: "status",                    label: "Status" },
    { row:  6, key: "template",                  label: "Template" },
    { row:  7, key: "internalDate",              label: "Internal date" },
    { row:  8, key: "projectCode",               label: "Project code" },
    // row 9 intentionally blank (section gap)
    // ── Client / project (rows 10–14) ────────────────────────────
    { row: 10, key: "projectErp",                label: "Project (ERP)" },
    { row: 11, key: "customerBilling",           label: "Customer (Billing)" },
    { row: 12, key: "projectNameOnReport",       label: "Project name on report" },
    { row: 13, key: "clientNameOnReport",        label: "Client name on report" },
    { row: 14, key: "contact",                   label: "Contact" },
    // row 15 intentionally blank (section gap)
    // ── Job info (rows 16–19) ─────────────────────────────────────
    { row: 16, key: "enableManualCubeJobNumber", label: "Enable manual cube job #" },
    { row: 17, key: "cubeJobNumber",             label: "Cube job #" },
    { row: 18, key: "quote",                     label: "Quote" },
    { row: 19, key: "testItem",                  label: "Test item" },
    // row 20 intentionally blank (section gap)
    // ── Supplier and location (rows 21–24) ───────────────────────
    { row: 21, key: "supplier",                  label: "Supplier" },
    { row: 22, key: "supplierDisplay",           label: "Supplier (display)" },
    { row: 23, key: "locationRepresented",       label: "Location represented" },
    { row: 24, key: "additionalInformation",     label: "Additional information" },
    // row 25 intentionally blank (section gap)
    // ── Cast and specimen (rows 26–32) ───────────────────────────
    { row: 26, key: "dateOfCast",                label: "Date of cast" },
    { row: 27, key: "dateTimeSampled",           label: "Date/time sampled" },
    { row: 28, key: "concreteGrade",             label: "Concrete grade" },
    { row: 29, key: "reportGrade",               label: "Report grade" },
    { row: 30, key: "specimenSize",              label: "Specimen size" },
    { row: 31, key: "slumpMeasured",             label: "Slump measured" },
    { row: 32, key: "slumpSpecified",            label: "Slump specified" },
    // row 33 intentionally blank (section gap)
    // ── Personnel (rows 34–35) ────────────────────────────────────
    { row: 34, key: "personInCharge",            label: "Person in charge" },
    { row: 35, key: "managerInCharge",           label: "Manager in charge" },
    // row 36 intentionally blank (section gap)
    // ── Workflow (rows 37–38) ─────────────────────────────────────
    { row: 37, key: "erpStatus",                 label: "ERP status" },
    { row: 38, key: "rpaStatus",                 label: "RPA status" },
    // row 39 intentionally blank (section gap)
    // ── Custom / extra fields (row 40) ───────────────────────────
    { row: 40, key: "extraFields",               label: "Extra fields" },
    // rows 41–49 reserved for future fields
  ];

  const RESULT_FIELDS = [
    { key: "setNo", label: "Set No" },
    { key: "size", label: "Size" },
    { key: "specimenRef", label: "Specimen Ref #" },
    { key: "barcode", label: "Barcode text" },
    { key: "specifiedSlump", label: "Specified slump" },
    { key: "meanSlump", label: "Mean slump" },
    { key: "resultGrade", label: "Concrete grade" },
    { key: "resultDateOfCast", label: "Date of cast" },
    { key: "age", label: "Age (days)" },
    { key: "dateOfTest", label: "Date of test" },
    { key: "invoiceNumber", label: "Invoice number" }
  ];

  // ─────────────────────────────────────────────────────────────────────────────
  // CSV Utilities
  // ─────────────────────────────────────────────────────────────────────────────

  function normalizeText(value) {
    return String(value == null ? "" : value).trim();
  }

  function normalizeDate(str) {
    // DD-MM-YYYY or DD/MM/YYYY → YYYY-MM-DD
    const dmy = /^(\d{2})[-/](\d{2})[-/](\d{4})/.exec(str);
    if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
    // YYYY/MM/DD → YYYY-MM-DD
    const ymdSlash = /^(\d{4})\/(\d{2})\/(\d{2})/.exec(str);
    if (ymdSlash) return `${ymdSlash[1]}-${ymdSlash[2]}-${ymdSlash[3]}`;
    // ISO or YYYY-MM-DD — already correct, just drop any time component
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
    return str;
  }

  function formatDate(value) {
    if (!value) return "";
    if (typeof value === "string") return normalizeDate(value);
    if (typeof value.toDate === "function") return value.toDate().toISOString().slice(0, 10);
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (typeof value.seconds === "number") return new Date(value.seconds * 1000).toISOString().slice(0, 10);
    return "";
  }

  function formatCellValue(value) {
    if (value == null) return "";
    if (value instanceof Date || (value && typeof value.toDate === "function")) {
      return formatDate(value);
    }
    if (typeof value === "object") {
      return formatDate(value) || JSON.stringify(value);
    }
    return String(value);
  }

  function csvCell(value) {
    const text = formatCellValue(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function csvRow(values) {
    return values.map(csvCell).join(",");
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Form Data Extraction
  // ─────────────────────────────────────────────────────────────────────────────

  const FIELD_ALIASES = {
    documentId:               (form) => form.id,
    reportNo:                 (form) => form.raw?.reportNo || form.raw?.reportNumber || form.reportNo,
    status:                   (form) => form.raw?.status || form.status,
    template:                 (form) => form.raw?.template || form.template,
    internalDate:             (form) => formatDate(form.raw?.internalDate || form.raw?.dateOfCast),
    dateOfCast:               (form) => formatDate(form.raw?.dateOfCast || form.raw?.internalDate),
    dateTimeSampled:          (form) => formatDate(form.raw?.dateTimeSampled || form.raw?.dateOfCast),
    projectCode:              (form) => form.raw?.projectCode || form.raw?.projectErp,
    customerBilling:          (form) => form.raw?.customerBilling || form.raw?.client,
    projectNameOnReport:      (form) => form.raw?.projectNameOnReport || form.raw?.project,
    clientNameOnReport:       (form) => form.raw?.clientNameOnReport || form.raw?.client,
    testItem:                 (form) => form.raw?.testItem || form.raw?.method,
    concreteGrade:            (form) => form.raw?.concreteGrade || form.raw?.grade || form.grade,
    locationRepresented:      (form) => form.raw?.locationRepresented || form.raw?.location || form.location,
    additionalInformation:    (form) => form.raw?.additionalInformation || form.raw?.notes || form.notes,
    enableManualCubeJobNumber:(form) => {
      const v = form.raw?.enableManualCubeJobNumber;
      return v == null ? "" : (v ? "Yes" : "No");
    },
    extraFields: (form) => {
      const ef = form.raw?.extraFields;
      if (!ef || typeof ef !== "object" || !Object.keys(ef).length) return "";
      return JSON.stringify(ef);
    }
  };

  function rawValue(form, key) {
    return FIELD_ALIASES[key] ? FIELD_ALIASES[key](form) : form.raw?.[key];
  }

  function buildFormCsv(form) {
    // Build a lookup from pinned row number → [label, value].
    const fieldByRow = new Map(
      REQUEST_FIELDS.map((field) => [
        field.row,
        [field.label, rawValue(form, field.key)]
      ])
    );

    // Rows 3 to (CSV_RESULT_HEADER_ROW - 1): fields at their pinned rows; every
    // other row in that range is blank so that adding or removing a field never
    // shifts any other field.
    const requestSection = [];
    for (let row = 3; row < CSV_RESULT_HEADER_ROW; row++) {
      requestSection.push(fieldByRow.get(row) || []);
    }

    const resultHeader = RESULT_FIELDS.map((field) => field.label);
    const results = form.raw?.results || [];

    const rows = [
      ["CubeSync Concrete Cube Request"],
      ["Request field", "Value"],
      ...requestSection,
      resultHeader,
      ...results.map((result) => RESULT_FIELDS.map((field) => {
        const v = result[field.key];
        return (field.key === "resultDateOfCast" || field.key === "dateOfTest")
          ? formatDate(v)
          : v;
      }))
    ];

    return `${rows.map(csvRow).join("\r\n")}\r\n`;
  }

  function normalizeFilenamePart(value) {
    const normalized = Array.from(normalizeText(value), (char) => {
      const code = char.charCodeAt(0);
      return code < 32 || '<>:"/\\|?*'.includes(char) ? "-" : char;
    }).join("")
      .replace(/\s+/g, "-")
      .replace(/^[.\-_]+|[.\-_]+$/g, "")
      .slice(0, 80);

    return normalized || "form";
  }

  function buildExportFiles(forms) {
    return forms.map((form, index) => {
      const sequence = String(index + 1).padStart(3, "0");
      const name = normalizeFilenamePart(form.reportNo || form.id || `form-${sequence}`);
      return { name: `${sequence}-${name}.csv`, content: buildFormCsv(form) };
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ZIP Implementation (CRC32 + deflate store)
  // ─────────────────────────────────────────────────────────────────────────────

  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let value = i;
      for (let bit = 0; bit < 8; bit++) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      table[i] = value >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function dosDateTime(date) {
    const year = Math.max(1980, Math.min(2107, date.getFullYear()));
    return {
      date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
      time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
    };
  }

  function writeHeader(length, writer) {
    const buffer = new ArrayBuffer(length);
    writer(new DataView(buffer));
    return new Uint8Array(buffer);
  }

  function localFileHeader(entry) {
    return writeHeader(30, (view) => {
      view.setUint32(0, 0x04034b50, true);
      view.setUint16(4, 20, true);  // version
      view.setUint16(6, 0, true);   // flags
      view.setUint16(8, 0, true);   // compression (store)
      view.setUint16(10, entry.time, true);
      view.setUint16(12, entry.date, true);
      view.setUint32(14, entry.crc, true);
      view.setUint32(18, entry.data.length, true);
      view.setUint32(22, entry.data.length, true);
      view.setUint16(26, entry.name.length, true);
      view.setUint16(28, 0, true);  // extra length
    });
  }

  function centralDirectoryHeader(entry) {
    return writeHeader(46, (view) => {
      view.setUint32(0, 0x02014b50, true);
      view.setUint16(4, 20, true);  // version made by
      view.setUint16(6, 20, true);  // version needed
      view.setUint16(8, 0, true);   // flags
      view.setUint16(10, 0, true);  // compression
      view.setUint16(12, entry.time, true);
      view.setUint16(14, entry.date, true);
      view.setUint32(16, entry.crc, true);
      view.setUint32(20, entry.data.length, true);
      view.setUint32(24, entry.data.length, true);
      view.setUint16(28, entry.name.length, true);
      view.setUint16(30, 0, true);  // extra length
      view.setUint16(32, 0, true);  // comment length
      view.setUint16(34, 0, true);  // disk number
      view.setUint16(36, 0, true);  // internal attrs
      view.setUint32(38, 0, true);  // external attrs
      view.setUint32(42, entry.offset, true);
    });
  }

  function endOfCentralDirectory(count, size, offset) {
    return writeHeader(22, (view) => {
      view.setUint32(0, 0x06054b50, true);
      view.setUint16(4, 0, true);   // disk number
      view.setUint16(6, 0, true);   // disk with central dir
      view.setUint16(8, count, true);
      view.setUint16(10, count, true);
      view.setUint32(12, size, true);
      view.setUint32(16, offset, true);
      view.setUint16(20, 0, true);  // comment length
    });
  }

  function createZipBlob(files, modifiedAt = new Date()) {
    const encoder = new TextEncoder();
    const { date, time } = dosDateTime(modifiedAt);
    const fileParts = [];
    const centralParts = [];
    let offset = 0;

    const entries = files.map((file) => {
      const name = encoder.encode(file.name);
      const data = encoder.encode(file.content);
      return { name, data, crc: crc32(data), date, time, offset: 0 };
    });

    // Local file headers + data
    for (const entry of entries) {
      entry.offset = offset;
      const header = localFileHeader(entry);
      fileParts.push(header, entry.name, entry.data);
      offset += header.length + entry.name.length + entry.data.length;
    }

    const centralDirOffset = offset;

    // Central directory headers
    for (const entry of entries) {
      const header = centralDirectoryHeader(entry);
      centralParts.push(header, entry.name);
      offset += header.length + entry.name.length;
    }

    const centralDirSize = offset - centralDirOffset;
    const endRecord = endOfCentralDirectory(entries.length, centralDirSize, centralDirOffset);

    return new Blob([...fileParts, ...centralParts, endRecord], { type: "application/zip" });
  }

  function downloadFilesAsZip(files, filename) {
    const blob = createZipBlob(files);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);

    return blob;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────────

  return {
    CSV_RESULT_HEADER_ROW,
    CSV_TEST_DATA_START_ROW,
    REQUEST_FIELDS,
    RESULT_FIELDS,
    buildExportFiles,
    buildFormCsv,
    createZipBlob,
    downloadFilesAsZip
  };
});
