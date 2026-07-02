(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.CubeSyncFormMarkup = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const RESULT_COLUMNS = [
    { field: "setNo", label: "Set No" },
    { field: "size", label: "Size" },
    { field: "specimenRef", label: "Specimen Ref #" },
    { field: "barcode", label: "Barcode" },
    { field: "specifiedSlump", label: "Specified Slump" },
    { field: "meanSlump", label: "Mean Slump" },
    { field: "resultGrade", label: "Concrete Grade" },
    { field: "resultDateOfCast", label: "Date Of Cast" },
    { field: "age", label: "Age" },
    { field: "dateOfTest", label: "Date Of Test" },
    { field: "invoiceNumber", label: "Invoice Number" }
  ];

  const RESULT_ROW_INPUTS = {
    setNo: { type: "number", min: "1", step: "1", value: "1", ariaSuffix: "set number" },
    size: { type: "text", ariaSuffix: "size" },
    specimenRef: { type: "text", ariaSuffix: "specimen reference" },
    barcode: { type: "text", ariaSuffix: "barcode text", barcode: true },
    specifiedSlump: { type: "text", ariaSuffix: "specified slump" },
    meanSlump: { type: "text", ariaSuffix: "mean slump" },
    resultGrade: { type: "text", ariaSuffix: "concrete grade" },
    resultDateOfCast: { type: "date", ariaSuffix: "date of cast" },
    age: { type: "number", min: "0", step: "1", ariaSuffix: "age in days" },
    dateOfTest: { type: "date", ariaSuffix: "date of test" },
    invoiceNumber: { type: "text", ariaSuffix: "invoice number" }
  };

  function resultTableHeadHtml() {
    const headers = RESULT_COLUMNS.map(function (column) {
      return `<th scope="col" data-result-field="${column.field}">${column.label}</th>`;
    }).join("");
    return `<tr>${headers}<th scope="col">Action</th></tr>`;
  }

  function resultRowHtml(rowCount) {
    const cells = RESULT_COLUMNS.map(function (column) {
      const inputDef = RESULT_ROW_INPUTS[column.field];
      const attrs = [
        `type="${inputDef.type}"`,
        `name="${column.field}${rowCount}"`,
        `aria-label="Row ${rowCount} ${inputDef.ariaSuffix}"`
      ];

      if (inputDef.min) attrs.push(`min="${inputDef.min}"`);
      if (inputDef.step) attrs.push(`step="${inputDef.step}"`);
      if (inputDef.value) attrs.push(`value="${inputDef.value}"`);
      if (inputDef.barcode) {
        attrs.push("data-barcode-input");
        attrs.push("placeholder=\"Enter barcode text\"");
      }

      const inputHtml = `<input ${attrs.join(" ")}>`;

      if (inputDef.barcode) {
        return `
      <td class="barcode-cell" data-result-field="${column.field}" data-label="${column.label}">
        ${inputHtml}
        <div class="barcode-preview" aria-live="polite"><span class="barcode-placeholder">Paste Barcode Here</span></div>
        <p class="barcode-message" role="alert"></p>
      </td>`;
      }

      return `<td data-result-field="${column.field}" data-label="${column.label}">${inputHtml}</td>`;
    }).join("");

    return `${cells}<td data-label="Action"><button type="button" class="remove-row-btn" aria-label="Remove row ${rowCount}">Remove</button></td>`;
  }

  function seedResultRows(tableBody, count) {
    if (!tableBody || count <= 0) return;

    for (let rowCount = 1; rowCount <= count; rowCount += 1) {
      const row = document.createElement("tr");
      row.innerHTML = resultRowHtml(rowCount);
      tableBody.appendChild(row);
    }
  }

  function resultRowFieldNames(rowIndex) {
    return RESULT_COLUMNS.map(function (column) {
      return `${column.field}${rowIndex}`;
    });
  }

  return {
    RESULT_COLUMNS,
    resultTableHeadHtml,
    resultRowHtml,
    seedResultRows,
    resultRowFieldNames
  };
});
