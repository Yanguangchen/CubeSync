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

  const CSV_RESULT_HEADER_ROW = 36;
  const CSV_TEST_DATA_START_ROW = 37;

  const REQUEST_FIELDS = [
    // ── Metadata ──────────────────────────────────────────────────
    { key: "documentId",               label: "Document ID" },
    { key: "reportNo",                 label: "Report no." },
    { key: "status",                   label: "Status" },
    { key: "template",                 label: "Template" },
    { key: "internalDate",             label: "Internal date" },
    { key: "projectCode",              label: "Project code" },
    // ── Client / project (form section 1) ─────────────────────────
    { key: "projectErp",               label: "Project (ERP)" },
    { key: "customerBilling",          label: "Customer (Billing)" },
    { key: "projectNameOnReport",      label: "Project name on report" },
    { key: "clientNameOnReport",       label: "Client name on report" },
    { key: "contact",                  label: "Contact" },
    // ── Job info (form section 2) ──────────────────────────────────
    { key: "enableManualCubeJobNumber", label: "Enable manual cube job #" },
    { key: "cubeJobNumber",            label: "Cube job #" },
    { key: "quote",                    label: "Quote" },
    { key: "testItem",                 label: "Test item" },
    { key: "method",                   label: "Method" },
    // ── Supplier and location (form section 3) ─────────────────────
    { key: "supplier",                 label: "Supplier" },
    { key: "supplierDisplay",          label: "Supplier (display)" },
    { key: "locationRepresented",      label: "Location represented" },
    { key: "additionalInformation",    label: "Additional information" },
    // ── Cast and specimen (form section 4) ────────────────────────
    { key: "dateOfCast",               label: "Date of cast" },
    { key: "dateTimeSampled",          label: "Date/time sampled" },
    { key: "concreteGrade",            label: "Concrete grade" },
    { key: "reportGrade",              label: "Report grade" },
    { key: "specimenSize",             label: "Specimen size" },
    { key: "slumpMeasured",            label: "Slump measured" },
    { key: "slumpSpecified",           label: "Slump specified" },
    // ── Personnel (form section 5) ────────────────────────────────
    { key: "personInCharge",           label: "Person in charge" },
    { key: "managerInCharge",          label: "Manager in charge" },
    // ── Workflow ──────────────────────────────────────────────────
    { key: "erpStatus",                label: "ERP status" },
    { key: "rpaStatus",                label: "RPA status" },
    // ── Custom / extra fields ─────────────────────────────────────
    { key: "extraFields",              label: "Extra fields" }
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

  function formatDate(value) {
    if (!value) return "";
    if (typeof value === "string") return value;
    if (typeof value.toDate === "function") return value.toDate().toISOString();
    if (value instanceof Date) return value.toISOString();
    if (typeof value.seconds === "number") return new Date(value.seconds * 1000).toISOString();
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
    internalDate:             (form) => form.raw?.internalDate || form.raw?.dateOfCast,
    projectCode:              (form) => form.raw?.projectCode || form.raw?.projectErp,
    customerBilling:          (form) => form.raw?.customerBilling || form.raw?.client,
    projectNameOnReport:      (form) => form.raw?.projectNameOnReport || form.raw?.project,
    clientNameOnReport:       (form) => form.raw?.clientNameOnReport || form.raw?.client,
    method:                   (form) => form.raw?.method || form.raw?.testItem,
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
    const headerRow = ["CubeSync Concrete Cube Request"];
    const labelRow = ["Request field", "Value"];
    const requestRows = REQUEST_FIELDS.map((field) => [field.label, rawValue(form, field.key)]);
    const resultHeader = RESULT_FIELDS.map((field) => field.label);
    const results = form.raw?.results || [];

    const rows = [
      headerRow,
      labelRow,
      ...requestRows,
      [],
      resultHeader,
      ...results.map((result) => RESULT_FIELDS.map((field) => result[field.key]))
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
