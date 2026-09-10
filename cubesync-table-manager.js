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

  function getContainingForm(row) {
    if (!row || typeof row.closest !== "function") return null;
    return row.closest("form");
  }

  function resolveRowCastDate(row, form) {
    const cast = row.querySelector('[name^="resultDateOfCast"]');
    if (!cast) return "";
    if (cast.value) return cast.value;

    const formEl = form || getContainingForm(row);
    const requestCast = formEl && formEl.elements && formEl.elements.dateOfCast;
    if (requestCast && requestCast.value) {
      cast.value = requestCast.value;
    }
    return cast.value || "";
  }

  function computeRowDateOfTest(row, form) {
    if (!row || typeof row.querySelector !== "function") return;
    const test = row.querySelector('[name^="dateOfTest"]');
    const age = row.querySelector('[name^="age"]');
    if (!test || !age) return;

    const castValue = resolveRowCastDate(row, form);
    if (!castValue) return;

    const days = parseAgeDays(age.value);
    if (days == null) return;

    const nextTestDate = addDaysToIsoDate(castValue, days);
    if (nextTestDate) {
      test.value = nextTestDate;
    }
  }

  function assignSetNumbersByAge(tableBody) {
    if (!tableBody) return;
    const groups = [];
    const byAge = new Map();

    Array.from(tableBody.querySelectorAll("tr")).forEach(function (row) {
      const ageInput = row.querySelector('[name^="age"]');
      const setInput = row.querySelector('[name^="setNo"]');
      const testInput = row.querySelector('[name^="dateOfTest"]');
      const days = parseAgeDays(ageInput && ageInput.value);
      if (days == null || !setInput) return;

      let group = byAge.get(days);
      if (!group) {
        group = { age: days, rows: [], sortKey: "" };
        byAge.set(days, group);
        groups.push(group);
      }
      group.rows.push(row);
      const testDate = testInput && testInput.value ? testInput.value : "";
      if (testDate && (!group.sortKey || testDate < group.sortKey)) {
        group.sortKey = testDate;
      }
    });

    groups.sort(function (a, b) {
      if (a.sortKey && b.sortKey && a.sortKey !== b.sortKey) {
        return a.sortKey < b.sortKey ? -1 : 1;
      }
      if (a.sortKey && !b.sortKey) return -1;
      if (!a.sortKey && b.sortKey) return 1;
      return a.age - b.age;
    });

    groups.forEach(function (group, index) {
      const setNo = String(index + 1);
      group.rows.forEach(function (row) {
        const setInput = row.querySelector('[name^="setNo"]');
        if (setInput) setInput.value = setNo;
      });
    });
  }

  function refreshDerivedResultFields(row, tableBody, form) {
    computeRowDateOfTest(row, form);
    assignSetNumbersByAge(tableBody);
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
          refreshDerivedResultFields(row, tableBody);
        });
        input.addEventListener("input", function () {
          refreshDerivedResultFields(row, tableBody);
        });
      }
    });

    const removeBtn = row.querySelector(".remove-row-btn");
    if (removeBtn) {
      removeBtn.addEventListener("click", function () {
        row.remove();
        renumberRows(tableBody);
        assignSetNumbersByAge(tableBody);
      });
    }
  }

  function bindRequestDateOfCast(form, tableBody) {
    if (!form || !tableBody || !form.elements) return;
    const dateOfCast = form.elements.dateOfCast;
    if (!dateOfCast || dateOfCast.dataset.cubesyncResultSyncBound === "true") return;
    dateOfCast.dataset.cubesyncResultSyncBound = "true";

    function syncRows() {
      Array.from(tableBody.querySelectorAll("tr")).forEach(function (row) {
        computeRowDateOfTest(row, form);
      });
      assignSetNumbersByAge(tableBody);
    }

    dateOfCast.addEventListener("change", syncRows);
    dateOfCast.addEventListener("input", syncRows);
  }

  function addResultRow(tableBody, form, renderBarcodeCb, onRowAdded) {
    if (!tableBody) return;
    const rowCount = tableBody.querySelectorAll("tr").length + 1;
    const newRow = document.createElement("tr");
    const markup = window.CubeSyncFormMarkup;
    if (!markup) return;
    newRow.innerHTML = markup.resultRowHtml(rowCount, {
      lockTestingTeam: typeof markup.shouldLockTestingTeam === "function"
        ? markup.shouldLockTestingTeam(tableBody)
        : false
    });
    tableBody.appendChild(newRow);
    prefillRowFromRequest(newRow, form);
    computeRowDateOfTest(newRow, form);
    attachRowListeners(newRow, tableBody, renderBarcodeCb);
    assignSetNumbersByAge(tableBody);
    
    if (typeof onRowAdded === "function") {
      onRowAdded(newRow);
    }
  }

  return {
    computeRowDateOfTest: computeRowDateOfTest,
    assignSetNumbersByAge: assignSetNumbersByAge,
    bindRequestDateOfCast: bindRequestDateOfCast,
    prefillRowFromRequest: prefillRowFromRequest,
    renumberRows: renumberRows,
    attachRowListeners: attachRowListeners,
    addResultRow: addResultRow
  };
});
