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

  function computeRowAge(row) {
    const cast = row.querySelector('[name^="resultDateOfCast"]');
    const test = row.querySelector('[name^="dateOfTest"]');
    const age = row.querySelector('[name^="age"]');
    if (!cast || !test || !age || !cast.value || !test.value) return;

    const castDate = new Date(cast.value);
    const testDate = new Date(test.value);
    const diffDays = Math.round((testDate - castDate) / (1000 * 60 * 60 * 24));
    if (Number.isFinite(diffDays) && diffDays >= 0) {
      age.value = diffDays;
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

    ['[name^="resultDateOfCast"]', '[name^="dateOfTest"]'].forEach(function (selector) {
      const dateInput = row.querySelector(selector);
      if (dateInput) {
        dateInput.addEventListener("change", function () {
          computeRowAge(row);
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
    attachRowListeners(newRow, tableBody, renderBarcodeCb);
    
    if (typeof onRowAdded === "function") {
      onRowAdded(newRow);
    }
  }

  return {
    computeRowAge: computeRowAge,
    prefillRowFromRequest: prefillRowFromRequest,
    renumberRows: renumberRows,
    attachRowListeners: attachRowListeners,
    addResultRow: addResultRow
  };
});
