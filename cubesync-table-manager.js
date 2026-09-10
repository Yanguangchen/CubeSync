(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.CubeSyncTableManager = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const REQUEST_TO_RESULT_PREFILL = {
    size: "specimenSize",
    specifiedSlump: "slumpSpecified",
    meanSlump: "slumpMeasured",
    resultGrade: "concreteGrade",
    resultDateOfCast: "dateOfCast"
  };

  function parseIsoDateParts(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || "").trim());
    if (!match) return null;
    return {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3])
    };
  }

  function parseAgeDays(value) {
    if (value === "" || value == null) return null;
    const days = Number(value);
    if (!Number.isInteger(days) || days < 0) return null;
    return days;
  }

  function addDaysToIsoDate(isoDate, days) {
    const parts = parseIsoDateParts(isoDate);
    if (!parts) return "";
    const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
    return date.toISOString().slice(0, 10);
  }

  function computeRowDateOfTest(row) {
    if (!row || typeof row.querySelector !== "function") return;
    const cast = row.querySelector('[name^="resultDateOfCast"]');
    const test = row.querySelector('[name^="dateOfTest"]');
    const age = row.querySelector('[name^="age"]');
    if (!cast || !test || !age || !cast.value) return;

    const days = parseAgeDays(age.value);
    if (days == null) return;

    const nextTestDate = addDaysToIsoDate(cast.value, days);
    if (nextTestDate) {
      test.value = nextTestDate;
    }
  }

  function prefillRowFromRequest(row, form) {
    if (!form) return;
    Object.keys(REQUEST_TO_RESULT_PREFILL).forEach(function (rowField) {
      const target = row.querySelector('[name^="' + rowField + '"]');
      const source = form.elements[REQUEST_TO_RESULT_PREFILL[rowField]];
      if (target && source && !target.value) {
        target.value = source.value || "";
      }
    });
  }

  function renumberRows(tableBody) {
    if (!tableBody) return;
    const rows = tableBody.querySelectorAll("tr");
    rows.forEach((row, index) => {
      const num = index + 1;
      const inputs = row.querySelectorAll("input, select");
      inputs.forEach(input => {
        const baseName = input.name.replace(/\d+$/, "");
        input.name = baseName + num;
        
        if (input.hasAttribute("aria-label")) {
          const baseAria = input.getAttribute("aria-label").replace(/Row \d+/, `Row ${num}`);
          input.setAttribute("aria-label", baseAria);
        }
      });
    });
  }

  function attachRowListeners(row, tableBody, renderBarcodeCb) {
    const newInput = row.querySelector("[data-barcode-input]");
    if (newInput) {
      newInput.addEventListener("input", function () {
        if (typeof renderBarcodeCb === "function") {
          renderBarcodeCb(newInput);
        }
      });
    }

    ['[name^="resultDateOfCast"]', '[name^="age"]'].forEach(function (selector) {
      const input = row.querySelector(selector);
      if (input) {
        input.addEventListener("change", function () {
          computeRowDateOfTest(row);
        });
        input.addEventListener("input", function () {
          computeRowDateOfTest(row);
        });
      }
    });

    const removeBtn = row.querySelector(".remove-row-btn");
    if (removeBtn) {
      removeBtn.addEventListener("click", function () {
        row.remove();
        renumberRows(tableBody);
      });
    }
  }

  function addResultRow(tableBody, form, renderBarcodeCb, onRowAdded) {
    if (!tableBody) return;
    const rowCount = tableBody.querySelectorAll("tr").length + 1;
    const newRow = document.createElement("tr");
    const markup = window.CubeSyncFormMarkup;
    if (!markup) return;
    newRow.innerHTML = markup.resultRowHtml(rowCount);
    tableBody.appendChild(newRow);
    prefillRowFromRequest(newRow, form);
    computeRowDateOfTest(newRow);
    attachRowListeners(newRow, tableBody, renderBarcodeCb);
    
    if (typeof onRowAdded === "function") {
      onRowAdded(newRow);
    }
  }

  return {
    computeRowDateOfTest: computeRowDateOfTest,
    prefillRowFromRequest: prefillRowFromRequest,
    renumberRows: renumberRows,
    attachRowListeners: attachRowListeners,
    addResultRow: addResultRow
  };
});
