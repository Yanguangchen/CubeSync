(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.CubeSyncExport = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const CSV_RESULT_HEADER_ROW = 21;
  const CSV_TEST_DATA_START_ROW = 22;

  const REQUEST_FIELDS = [
    { key: "documentId", label: "Document ID" },
    { key: "reportNo", label: "Report no." },
    { key: "status", label: "Status" },
    { key: "template", label: "Template" },
    { key: "internalDate", label: "Internal date" },
    { key: "projectCode", label: "Project code" },
    { key: "client", label: "Client" },
    { key: "method", label: "Method" },
    { key: "project", label: "Project" },
    { key: "concreteGrade", label: "Concrete grade" },
    { key: "supplier", label: "Supplier" },
    { key: "locationRepresented", label: "Location represented" },
    { key: "additionalInformation", label: "Additional information" },
    { key: "dateTimeSampled", label: "Date/time sampled" },
    { key: "slumpMeasured", label: "Slump measured" },
    { key: "specimenSize", label: "Specimen size" },
    { key: "slumpSpecified", label: "Slump specified" }
  ];

  const RESULT_FIELDS = [
    { key: "testNumber", label: "Test number" },
    { key: "clientCubeMarking", label: "Client cube marking" },
    { key: "dateTested", label: "Date tested" },
    { key: "ageDays", label: "Age (days)" },
    { key: "weightKg", label: "Weight as received (kg)" },
    { key: "loadKn", label: "Load (kN)" },
    { key: "strength", label: "Compressive strength (N/mm2)" },
    { key: "failureMode", label: "Mode of failure" },
    { key: "barcode", label: "Barcode text" }
  ];

  const CRC_TABLE = buildCrcTable();

  function buildCrcTable() {
    const table = new Uint32Array(256);

    for (let index = 0; index < table.length; index += 1) {
      let value = index;

      for (let bit = 0; bit < 8; bit += 1) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }

      table[index] = value >>> 0;
    }

    return table;
  }

  function normalizeText(value) {
    return String(value == null ? "" : value).trim();
  }

  function formatDate(value) {
    if (!value) {
      return "";
    }

    if (typeof value === "string") {
      return value;
    }

    if (typeof value.toDate === "function") {
      return value.toDate().toISOString();
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (typeof value.seconds === "number") {
      return new Date(value.seconds * 1000).toISOString();
    }

    return "";
  }

  function formatCellValue(value) {
    if (value == null) {
      return "";
    }

    if (value instanceof Date || (value && typeof value.toDate === "function")) {
      return formatDate(value);
    }

    if (typeof value === "object") {
      const dateValue = formatDate(value);
      return dateValue || JSON.stringify(value);
    }

    return String(value);
  }

  function rawValue(form, key) {
    const raw = form.raw || {};

    if (key === "documentId") return form.id;
    if (key === "reportNo") return raw.reportNo || raw.reportNumber || form.reportNo;
    if (key === "status") return raw.status || form.status;
    if (key === "template") return raw.template || form.template;
    if (key === "concreteGrade") return raw.concreteGrade || raw.grade || form.grade;
    if (key === "locationRepresented") return raw.locationRepresented || raw.location || form.location;
    if (key === "additionalInformation") return raw.additionalInformation || raw.notes || form.notes;

    return raw[key];
  }

  function csvCell(value) {
    const text = formatCellValue(value);

    if (/[",\n\r]/.test(text)) {
      return `"${text.replace(/"/g, "\"\"")}"`;
    }

    return text;
  }

  function csvRow(values) {
    return values.map(csvCell).join(",");
  }

  function buildFormCsv(form) {
    const rows = [
      ["CubeSync Concrete Cube Request"],
      ["Request field", "Value"],
      ...REQUEST_FIELDS.map((field) => [field.label, rawValue(form, field.key)]),
      [],
      RESULT_FIELDS.map((field) => field.label)
    ];
    const results = form.raw && Array.isArray(form.raw.results) ? form.raw.results : [];

    results.forEach((result) => {
      rows.push(RESULT_FIELDS.map((field) => result[field.key]));
    });

    return `${rows.map(csvRow).join("\r\n")}\r\n`;
  }

  function normalizeFilenamePart(value) {
    return Array.from(normalizeText(value), (character) => {
      const code = character.charCodeAt(0);
      return code < 32 || '<>:"/\\|?*'.includes(character) ? "-" : character;
    }).join("")
      .replace(/\s+/g, "-")
      .replace(/^[.\-_]+|[.\-_]+$/g, "")
      .slice(0, 80) || "form";
  }

  function buildExportFiles(forms) {
    return forms.map((form, index) => {
      const sequence = String(index + 1).padStart(3, "0");
      const name = normalizeFilenamePart(form.reportNo || form.id || `form-${sequence}`);

      return {
        name: `${sequence}-${name}.csv`,
        content: buildFormCsv(form)
      };
    });
  }

  function crc32(bytes) {
    let crc = 0xffffffff;

    for (let index = 0; index < bytes.length; index += 1) {
      crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
    }

    return (crc ^ 0xffffffff) >>> 0;
  }

  function dosDateTime(date) {
    const year = Math.max(1980, Math.min(2107, date.getFullYear()));
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const seconds = Math.floor(date.getSeconds() / 2);

    return {
      date: ((year - 1980) << 9) | (month << 5) | day,
      time: (hours << 11) | (minutes << 5) | seconds
    };
  }

  function writeUint16(view, offset, value) {
    view.setUint16(offset, value, true);
  }

  function writeUint32(view, offset, value) {
    view.setUint32(offset, value >>> 0, true);
  }

  function headerBytes(length, writer) {
    const buffer = new ArrayBuffer(length);
    const view = new DataView(buffer);
    writer(view);
    return new Uint8Array(buffer);
  }

  function localFileHeader(entry) {
    return headerBytes(30, (view) => {
      writeUint32(view, 0, 0x04034b50);
      writeUint16(view, 4, 20);
      writeUint16(view, 6, 0);
      writeUint16(view, 8, 0);
      writeUint16(view, 10, entry.time);
      writeUint16(view, 12, entry.date);
      writeUint32(view, 14, entry.crc);
      writeUint32(view, 18, entry.data.length);
      writeUint32(view, 22, entry.data.length);
      writeUint16(view, 26, entry.name.length);
      writeUint16(view, 28, 0);
    });
  }

  function centralDirectoryHeader(entry) {
    return headerBytes(46, (view) => {
      writeUint32(view, 0, 0x02014b50);
      writeUint16(view, 4, 20);
      writeUint16(view, 6, 20);
      writeUint16(view, 8, 0);
      writeUint16(view, 10, 0);
      writeUint16(view, 12, entry.time);
      writeUint16(view, 14, entry.date);
      writeUint32(view, 16, entry.crc);
      writeUint32(view, 20, entry.data.length);
      writeUint32(view, 24, entry.data.length);
      writeUint16(view, 28, entry.name.length);
      writeUint16(view, 30, 0);
      writeUint16(view, 32, 0);
      writeUint16(view, 34, 0);
      writeUint16(view, 36, 0);
      writeUint32(view, 38, 0);
      writeUint32(view, 42, entry.offset);
    });
  }

  function endOfCentralDirectory(entryCount, centralDirectorySize, centralDirectoryOffset) {
    return headerBytes(22, (view) => {
      writeUint32(view, 0, 0x06054b50);
      writeUint16(view, 4, 0);
      writeUint16(view, 6, 0);
      writeUint16(view, 8, entryCount);
      writeUint16(view, 10, entryCount);
      writeUint32(view, 12, centralDirectorySize);
      writeUint32(view, 16, centralDirectoryOffset);
      writeUint16(view, 20, 0);
    });
  }

  function createZipBlob(files, modifiedAt) {
    const encoder = new TextEncoder();
    const dateTime = dosDateTime(modifiedAt || new Date());
    const fileParts = [];
    const centralParts = [];
    let offset = 0;

    const entries = files.map((file) => {
      const name = encoder.encode(file.name);
      const data = encoder.encode(file.content);
      return {
        name,
        data,
        crc: crc32(data),
        date: dateTime.date,
        time: dateTime.time,
        offset: 0
      };
    });

    entries.forEach((entry) => {
      entry.offset = offset;
      const header = localFileHeader(entry);
      fileParts.push(header, entry.name, entry.data);
      offset += header.length + entry.name.length + entry.data.length;
    });

    const centralDirectoryOffset = offset;

    entries.forEach((entry) => {
      const header = centralDirectoryHeader(entry);
      centralParts.push(header, entry.name);
      offset += header.length + entry.name.length;
    });

    const centralDirectorySize = offset - centralDirectoryOffset;
    const endRecord = endOfCentralDirectory(entries.length, centralDirectorySize, centralDirectoryOffset);

    return new Blob([...fileParts, ...centralParts, endRecord], {
      type: "application/zip"
    });
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
