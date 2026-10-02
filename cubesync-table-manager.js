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

  const SPECIMEN_REF_SELECTOR = '[name^="specimenRef"]';
  const BARCODE_SELECTOR = "[data-barcode-input]";

  // Split a value into its leading text and trailing running number:
  // "CUBE-01" -> { prefix: "CUBE-", digits: "01" }. Null without a number.
  function splitRunningNumber(value) {
    const match = /^(.*?)(\d+)$/.exec(String(value == null ? "" : value).trim());
    return match ? { prefix: match[1], digits: match[2] } : null;
  }

  // Add one to a digit string, keeping its zero padding ("09" -> "10").
  function incrementDigits(digits) {
    const chars = digits.split("");
    for (let index = chars.length - 1; index >= 0; index -= 1) {
      if (chars[index] !== "9") {
        chars[index] = String(Number(chars[index]) + 1);
        return chars.join("");
      }
      chars[index] = "0";
    }
    return "1" + chars.join("");
  }

  // A specimen ref is the specimen reference, a "-", then its sequence: a
  // number, a single letter, or a number followed by a single letter
  // ("CUBE-01", "123-1", "CUBE-A", "20261002-001A"). The next ref steps the
  // sequence after the last "-" ("CUBE-02", "123-2", "CUBE-B",
  // "20261002-001B"): a number keeps its zero padding, a letter keeps its case
  // and stops at Z, and a number in front of a letter stays as it is. Empty
  // without a sequence, so a reference on its own ("123", "CUBE") is never
  // counted.
  function nextSpecimenRef(value) {
    const match = /^(.*-\s*)(?:(\d+)|(\d*)([A-Za-z]))$/.exec(String(value == null ? "" : value).trim());
    if (!match) return "";
    const reference = match[1];
    const number = match[2];
    const fixedNumber = match[3];
    const letter = match[4];
    if (number) return reference + incrementDigits(number);
    if (letter === "Z" || letter === "z") return "";
    return reference + fixedNumber + String.fromCharCode(letter.charCodeAt(0) + 1);
  }

  // The project code in front of a barcode's running number:
  // "PYY-0002/00166" -> "PYY-0002/". Empty when there is no such code.
  function barcodePrefix(value) {
    const parts = splitRunningNumber(value);
    return parts ? parts.prefix : "";
  }

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

  // After the specimen ref in `fromRow` changes from `previousValue`, carry the
  // count down the table: each following ref that is blank or still continues
  // the sequence of the ref above it is renumbered from the new value. The
  // first ref typed by hand stops the chain, so it and the rows below keep
  // their refs.
  function followSpecimenRefs(tableBody, fromRow, previousValue) {
    if (!tableBody || !fromRow) return;
    const rows = Array.from(tableBody.querySelectorAll("tr"));
    const start = rows.indexOf(fromRow);
    const source = fromRow.querySelector(SPECIMEN_REF_SELECTOR);
    if (start < 0 || !source) return;

    let oldAbove = previousValue == null ? "" : String(previousValue);
    let newAbove = source.value;
    for (let index = start + 1; index < rows.length && oldAbove !== newAbove; index += 1) {
      const input = rows[index].querySelector(SPECIMEN_REF_SELECTOR);
      if (!input) return;
      const current = input.value;
      if (current && current !== nextSpecimenRef(oldAbove)) return;
      input.value = nextSpecimenRef(newAbove);
      oldAbove = current;
      newAbove = input.value;
    }
  }

  function continueSpecimenRef(row) {
    const input = row.querySelector(SPECIMEN_REF_SELECTOR);
    const above = row.previousElementSibling &&
      row.previousElementSibling.querySelector(SPECIMEN_REF_SELECTOR);
    if (input && above && !input.value) {
      input.value = nextSpecimenRef(above.value);
    }
  }

  // The project code of the nearest barcode above `row`, if any.
  function findCarriedBarcodePrefix(tableBody, row) {
    const rows = Array.from(tableBody.querySelectorAll("tr"));
    for (let index = rows.indexOf(row) - 1; index >= 0; index -= 1) {
      const input = rows[index].querySelector(BARCODE_SELECTOR);
      const prefix = input ? barcodePrefix(input.value) : "";
      if (prefix) return prefix;
    }
    return "";
  }

  // Show the project code an empty barcode will be given as its placeholder,
  // falling back to the input's own placeholder when no barcode above has one.
  function refreshBarcodePlaceholders(tableBody) {
    if (!tableBody) return;
    let carried = "";
    Array.from(tableBody.querySelectorAll("tr")).forEach(function (row) {
      const input = row.querySelector(BARCODE_SELECTOR);
      if (!input) return;
      if (input.dataset.defaultPlaceholder === undefined) {
        input.dataset.defaultPlaceholder = input.getAttribute("placeholder") || "";
      }
      const placeholder = carried || input.dataset.defaultPlaceholder;
      if (placeholder) {
        input.setAttribute("placeholder", placeholder);
      } else {
        input.removeAttribute("placeholder");
      }
      carried = barcodePrefix(input.value) || carried;
    });
  }

  function placeCaretAtEnd(input) {
    if (typeof input.setSelectionRange === "function") {
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }

  // Barcodes in one request share a project code ("PYY-0002/") and differ only
  // in the running number. Focusing an empty barcode fills in the code from
  // the barcode above, so only the running number has to be typed; leaving it
  // without typing anything empties it again, so unused rows never save a
  // bare project code.
  function attachBarcodePrefixListeners(input, row, tableBody, renderBarcodeCb) {
    input.addEventListener("focus", function () {
      if (input.value || input.readOnly || input.disabled) return;
      const prefix = findCarriedBarcodePrefix(tableBody, row);
      if (!prefix) return;
      input.value = prefix;
      input.dataset.carriedBarcodePrefix = prefix;
      placeCaretAtEnd(input);
      // Tab can still select all the text once this handler returns, so put
      // the caret back at the end.
      setTimeout(function () {
        if (input.ownerDocument.activeElement === input && input.value === prefix) {
          placeCaretAtEnd(input);
        }
      }, 0);
    });

    // A click places the caret where it lands when the mouse is released,
    // which could be in front of the project code.
    input.addEventListener("click", function () {
      const prefix = input.dataset.carriedBarcodePrefix;
      if (prefix && input.value === prefix) {
        placeCaretAtEnd(input);
      }
    });

    input.addEventListener("blur", function () {
      const prefix = input.dataset.carriedBarcodePrefix;
      if (!prefix) return;
      delete input.dataset.carriedBarcodePrefix;
      if (input.value === prefix) {
        input.value = "";
        if (typeof renderBarcodeCb === "function") {
          renderBarcodeCb(input);
        }
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
    const newInput = row.querySelector(BARCODE_SELECTOR);
    if (newInput) {
      newInput.addEventListener("input", function () {
        // Typing or scanning the whole barcode after the filled-in project
        // code would repeat the code; keep one copy.
        const carried = newInput.dataset.carriedBarcodePrefix;
        if (carried && newInput.value.indexOf(carried + carried) === 0) {
          newInput.value = newInput.value.slice(carried.length);
        }
        if (typeof renderBarcodeCb === "function") {
          renderBarcodeCb(newInput);
        }
        refreshBarcodePlaceholders(tableBody);
      });
      attachBarcodePrefixListeners(newInput, row, tableBody, renderBarcodeCb);
    }

    const specimenRef = row.querySelector(SPECIMEN_REF_SELECTOR);
    if (specimenRef) {
      // Re-read on focus because loading a saved form sets refs without events.
      let previousRef = specimenRef.value;
      specimenRef.addEventListener("focus", function () {
        previousRef = specimenRef.value;
      });
      specimenRef.addEventListener("input", function () {
        followSpecimenRefs(tableBody, row, previousRef);
        previousRef = specimenRef.value;
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
        refreshBarcodePlaceholders(tableBody);
      });
    }
  }

  // Reset every input in the results table back to its default value while
  // leaving the request details and the number of rows untouched.
  function clearResultRows(tableBody) {
    if (!tableBody) return;
    tableBody.querySelectorAll("input, select, textarea").forEach(function (input) {
      if (input.tagName === "SELECT") {
        Array.from(input.options).forEach(function (option) {
          option.selected = option.defaultSelected;
        });
      } else if (input.type === "checkbox" || input.type === "radio") {
        input.checked = input.defaultChecked;
      } else {
        input.value = input.defaultValue;
      }
    });
    refreshBarcodePlaceholders(tableBody);
  }

  function bindRequestDateOfCast(form, tableBody) {
    if (!form || !tableBody || !form.elements) return;
    const dateOfCast = form.elements.dateOfCast;
    if (!dateOfCast || dateOfCast.dataset.cubesyncResultSyncBound === "true") return;
    dateOfCast.dataset.cubesyncResultSyncBound = "true";

    // Row cast dates are copied from the request date, so a row still showing
    // the previous request date (or none) follows it to the new date. A row
    // given its own cast date keeps it. The previous value is re-read on focus
    // because loading a saved form sets the request date without events.
    let previousCast = dateOfCast.value;

    function syncRows() {
      const nextCast = dateOfCast.value;
      Array.from(tableBody.querySelectorAll("tr")).forEach(function (row) {
        const cast = row.querySelector('[name^="resultDateOfCast"]');
        if (nextCast && cast && (!cast.value || cast.value === previousCast)) {
          cast.value = nextCast;
        }
        computeRowDateOfTest(row, form);
      });
      assignSetNumbersByAge(tableBody);
      if (nextCast) previousCast = nextCast;
    }

    dateOfCast.addEventListener("focus", function () {
      previousCast = dateOfCast.value;
    });
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
    continueSpecimenRef(newRow);
    computeRowDateOfTest(newRow, form);
    attachRowListeners(newRow, tableBody, renderBarcodeCb);
    assignSetNumbersByAge(tableBody);
    refreshBarcodePlaceholders(tableBody);

    if (typeof onRowAdded === "function") {
      onRowAdded(newRow);
    }
  }

  return {
    computeRowDateOfTest: computeRowDateOfTest,
    assignSetNumbersByAge: assignSetNumbersByAge,
    nextSpecimenRef: nextSpecimenRef,
    barcodePrefix: barcodePrefix,
    followSpecimenRefs: followSpecimenRefs,
    refreshBarcodePlaceholders: refreshBarcodePlaceholders,
    bindRequestDateOfCast: bindRequestDateOfCast,
    prefillRowFromRequest: prefillRowFromRequest,
    renumberRows: renumberRows,
    attachRowListeners: attachRowListeners,
    clearResultRows: clearResultRows,
    addResultRow: addResultRow
  };
});
