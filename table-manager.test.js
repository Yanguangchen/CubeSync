const { JSDOM } = require("jsdom");
const test = require("node:test");
const assert = require("node:assert/strict");

const tableManager = require("./cubesync-table-manager.js");

function makeDom(rowHtml) {
  const dom = new JSDOM(
    `<!doctype html><html><body><table><tbody>${rowHtml}</tbody></table></body></html>`,
    { url: "http://localhost/" }
  );
  global.window = dom.window;
  global.document = dom.window.document;
  return dom;
}

function makeFormDom(innerHtml) {
  const dom = new JSDOM(
    `<!doctype html><html><body><form id="cubeRequestForm">${innerHtml}</form></body></html>`,
    { url: "http://localhost/" }
  );
  global.window = dom.window;
  global.document = dom.window.document;
  return dom;
}

test("attachRowListeners is a no-op for a row with none of the optional controls", () => {
  makeDom("<tr><td>plain</td></tr>");
  const tableBody = global.document.querySelector("tbody");
  const row = tableBody.querySelector("tr");

  // No barcode input, no date inputs, no remove button — every guard is falsy.
  assert.doesNotThrow(() => tableManager.attachRowListeners(row, tableBody, () => {}));
});

test("attachRowListeners wires the barcode input to the render callback", () => {
  makeDom('<tr><td><input data-barcode-input></td></tr>');
  const row = global.document.querySelector("tr");

  let renderedWith = null;
  tableManager.attachRowListeners(row, global.document.querySelector("tbody"), (el) => {
    renderedWith = el;
  });

  const input = row.querySelector("[data-barcode-input]");
  input.dispatchEvent(new global.window.Event("input", { bubbles: true }));
  assert.equal(renderedWith, input);
});

test("attachRowListeners tolerates a non-function render callback", () => {
  makeDom('<tr><td><input data-barcode-input></td></tr>');
  const row = global.document.querySelector("tr");
  tableManager.attachRowListeners(row, global.document.querySelector("tbody"), undefined);

  const input = row.querySelector("[data-barcode-input]");
  assert.doesNotThrow(() =>
    input.dispatchEvent(new global.window.Event("input", { bubbles: true }))
  );
});

test("attachRowListeners removes the row and renumbers on remove-button click", () => {
  makeDom(
    '<tr><td class="row-number">1</td><td><button class="remove-row-btn">x</button></td></tr>' +
    '<tr><td class="row-number">2</td><td><button class="remove-row-btn">x</button></td></tr>'
  );
  const tableBody = global.document.querySelector("tbody");
  const rows = tableBody.querySelectorAll("tr");
  tableManager.attachRowListeners(rows[0], tableBody, () => {});

  rows[0].querySelector(".remove-row-btn").dispatchEvent(
    new global.window.Event("click", { bubbles: true })
  );

  assert.equal(tableBody.querySelectorAll("tr").length, 1);
});

test("request prefill leaves testing-team result measurements blank", () => {
  makeDom(`
    <tr>
      <td><input name="size1"></td>
      <td><input name="weightKg1"></td>
      <td><input name="loadKn1"></td>
      <td><input name="strength1"></td>
      <td><input name="failureMode1"></td>
    </tr>
  `);
  const row = global.document.querySelector("tr");
  const form = {
    elements: {
      specimenSize: { value: "150 mm" },
      weightKg: { value: "must not be copied" },
      loadKn: { value: "must not be copied" },
      strength: { value: "must not be copied" },
      failureMode: { value: "must not be copied" }
    }
  };

  tableManager.prefillRowFromRequest(row, form);

  assert.equal(row.querySelector('[name="size1"]').value, "150 mm");
  for (const field of ["weightKg", "loadKn", "strength", "failureMode"]) {
    assert.equal(row.querySelector(`[name="${field}1"]`).value, "");
  }
});

function dateAgeRowHtml() {
  return `
    <tr>
      <td><input type="date" name="resultDateOfCast1"></td>
      <td><input type="number" name="age1" min="0" step="1"></td>
      <td><input type="date" name="dateOfTest1"></td>
    </tr>
  `;
}

function dateAgeRow() {
  makeDom(dateAgeRowHtml());
  return global.document.querySelector("tr");
}

function setRowValues(row, { cast, age, test } = {}) {
  if (cast != null) row.querySelector('[name^="resultDateOfCast"]').value = cast;
  if (age != null) row.querySelector('[name^="age"]').value = age;
  if (test != null) row.querySelector('[name^="dateOfTest"]').value = test;
}

test("computeRowDateOfTest sets date of test to date of cast plus age in days", () => {
  const row = dateAgeRow();
  setRowValues(row, { cast: "2026-06-01", age: "28" });

  tableManager.computeRowDateOfTest(row);

  assert.equal(row.querySelector('[name^="dateOfTest"]').value, "2026-06-29");
});

test("computeRowDateOfTest treats age 0 as the same calendar day as the cast", () => {
  const row = dateAgeRow();
  setRowValues(row, { cast: "2026-06-01", age: "0" });

  tableManager.computeRowDateOfTest(row);

  assert.equal(row.querySelector('[name^="dateOfTest"]').value, "2026-06-01");
});

test("computeRowDateOfTest rolls across month and year boundaries", () => {
  const row = dateAgeRow();
  setRowValues(row, { cast: "2026-01-28", age: "7" });
  tableManager.computeRowDateOfTest(row);
  assert.equal(row.querySelector('[name^="dateOfTest"]').value, "2026-02-04");

  setRowValues(row, { cast: "2026-12-28", age: "7" });
  tableManager.computeRowDateOfTest(row);
  assert.equal(row.querySelector('[name^="dateOfTest"]').value, "2027-01-04");
});

test("computeRowDateOfTest handles leap-day addition", () => {
  const row = dateAgeRow();
  setRowValues(row, { cast: "2024-02-28", age: "1" });

  tableManager.computeRowDateOfTest(row);

  assert.equal(row.querySelector('[name^="dateOfTest"]').value, "2024-02-29");
});

test("computeRowDateOfTest leaves date of test unchanged when cast or age is missing", () => {
  const row = dateAgeRow();
  setRowValues(row, { test: "2026-01-01" });

  tableManager.computeRowDateOfTest(row);
  assert.equal(row.querySelector('[name^="dateOfTest"]').value, "2026-01-01");

  setRowValues(row, { cast: "2026-06-01", age: "", test: "2026-01-01" });
  tableManager.computeRowDateOfTest(row);
  assert.equal(
    row.querySelector('[name^="dateOfTest"]').value,
    "2026-01-01",
    "empty age must not be treated as 0 days"
  );
});

test("computeRowDateOfTest ignores non-integer or negative age values", () => {
  const row = dateAgeRow();
  setRowValues(row, { cast: "2026-06-01", age: "-1", test: "2026-01-01" });
  tableManager.computeRowDateOfTest(row);
  assert.equal(row.querySelector('[name^="dateOfTest"]').value, "2026-01-01");

  setRowValues(row, { age: "7.5", test: "2026-01-01" });
  tableManager.computeRowDateOfTest(row);
  assert.equal(row.querySelector('[name^="dateOfTest"]').value, "2026-01-01");

  setRowValues(row, { age: "abc", test: "2026-01-01" });
  tableManager.computeRowDateOfTest(row);
  assert.equal(row.querySelector('[name^="dateOfTest"]').value, "2026-01-01");
});

test("computeRowDateOfTest is a no-op without a row or the expected inputs", () => {
  makeDom("<tr><td>plain</td></tr>");
  assert.doesNotThrow(() => tableManager.computeRowDateOfTest(null));
  assert.doesNotThrow(() => tableManager.computeRowDateOfTest(global.document.querySelector("tr")));
});

test("changing age or date of cast computes date of test and does not rewrite age", () => {
  const row = dateAgeRow();
  const tableBody = global.document.querySelector("tbody");
  tableManager.attachRowListeners(row, tableBody, () => {});

  setRowValues(row, { cast: "2026-06-01", age: "7" });
  row.querySelector('[name^="age"]').dispatchEvent(new global.window.Event("input", { bubbles: true }));
  assert.equal(row.querySelector('[name^="dateOfTest"]').value, "2026-06-08");
  assert.equal(row.querySelector('[name^="age"]').value, "7");

  setRowValues(row, { cast: "2026-06-10" });
  row.querySelector('[name^="resultDateOfCast"]').dispatchEvent(
    new global.window.Event("change", { bubbles: true })
  );
  assert.equal(row.querySelector('[name^="dateOfTest"]').value, "2026-06-17");
  assert.equal(row.querySelector('[name^="age"]').value, "7");
});

test("changing date of test does not overwrite the age field", () => {
  const row = dateAgeRow();
  tableManager.attachRowListeners(row, global.document.querySelector("tbody"), () => {});

  setRowValues(row, { cast: "2026-06-01", age: "7", test: "2026-06-08" });
  const testInput = row.querySelector('[name^="dateOfTest"]');
  testInput.value = "2026-06-29";
  testInput.dispatchEvent(new global.window.Event("change", { bubbles: true }));

  assert.equal(row.querySelector('[name^="age"]').value, "7");
  assert.equal(testInput.value, "2026-06-29");
});

test("addResultRow prefills cast date and computes date of test from age days", () => {
  makeDom("");
  global.window.CubeSyncFormMarkup = require("./cubesync-form-markup.js");
  const tableBody = global.document.querySelector("tbody");
  const form = {
    elements: {
      dateOfCast: { value: "2026-06-01" },
      specimenSize: { value: "" },
      slumpSpecified: { value: "" },
      slumpMeasured: { value: "" },
      concreteGrade: { value: "" }
    }
  };

  tableManager.addResultRow(tableBody, form, () => {});

  const row = tableBody.querySelector("tr");
  assert.equal(row.querySelector('[name^="resultDateOfCast"]').value, "2026-06-01");

  const ageInput = row.querySelector('[name^="age"]');
  ageInput.value = "28";
  ageInput.dispatchEvent(new global.window.Event("input", { bubbles: true }));

  assert.equal(row.querySelector('[name^="dateOfTest"]').value, "2026-06-29");
});

test("addResultRow locks testing-team fields only on public forms", () => {
  const markup = require("./cubesync-form-markup.js");
  const form = { elements: {} };

  makeDom("");
  global.window.CubeSyncFormMarkup = markup;
  const unlockedBody = global.document.querySelector("tbody");
  tableManager.addResultRow(unlockedBody, form, () => {});
  for (const field of ["weightKg", "loadKn", "strength", "failureMode"]) {
    assert.equal(
      unlockedBody.querySelector(`[name^="${field}"]`).readOnly,
      false,
      `${field} stays editable without data-lock-testing-team`
    );
  }

  makeDom("");
  global.document.querySelector("table").setAttribute("data-lock-testing-team", "");
  global.window.CubeSyncFormMarkup = markup;
  const lockedBody = global.document.querySelector("tbody");
  tableManager.addResultRow(lockedBody, form, () => {});
  for (const field of ["weightKg", "loadKn", "strength", "failureMode"]) {
    assert.equal(
      lockedBody.querySelector(`[name^="${field}"]`).readOnly,
      true,
      `${field} is readonly on the client-facing form`
    );
  }
  assert.equal(lockedBody.querySelector('[name^="age"]').readOnly, false);
});

function resultRowHtml(index) {
  return `
    <tr>
      <td><input type="number" name="setNo${index}" min="1" step="1" value="1"></td>
      <td><input type="date" name="resultDateOfCast${index}"></td>
      <td><input type="number" name="age${index}" min="0" step="1"></td>
      <td><input type="date" name="dateOfTest${index}"></td>
    </tr>
  `;
}

test("computeRowDateOfTest uses the request date of cast when the row cast is empty", () => {
  makeFormDom(`
    <input type="date" name="dateOfCast" value="2026-06-01">
    <table><tbody>${resultRowHtml(1)}</tbody></table>
  `);
  const row = global.document.querySelector("tr");
  row.querySelector('[name^="age"]').value = "28";

  tableManager.computeRowDateOfTest(row);

  assert.equal(row.querySelector('[name^="resultDateOfCast"]').value, "2026-06-01");
  assert.equal(row.querySelector('[name^="dateOfTest"]').value, "2026-06-29");
});

test("entering age computes date of test from request date of cast", () => {
  makeFormDom(`
    <input type="date" name="dateOfCast" value="2026-06-01">
    <table><tbody>${resultRowHtml(1)}</tbody></table>
  `);
  const tableBody = global.document.querySelector("tbody");
  const row = tableBody.querySelector("tr");
  tableManager.attachRowListeners(row, tableBody, () => {});

  const ageInput = row.querySelector('[name^="age"]');
  ageInput.value = "7";
  ageInput.dispatchEvent(new global.window.Event("input", { bubbles: true }));

  assert.equal(row.querySelector('[name^="dateOfTest"]').value, "2026-06-08");
});

test("assignSetNumbersByAge groups equal ages and numbers sets chronologically", () => {
  makeDom(resultRowHtml(1) + resultRowHtml(2) + resultRowHtml(3));
  const tableBody = global.document.querySelector("tbody");
  const rows = tableBody.querySelectorAll("tr");

  rows[0].querySelector('[name^="age"]').value = "28";
  rows[0].querySelector('[name^="dateOfTest"]').value = "2026-06-29";
  rows[1].querySelector('[name^="age"]').value = "7";
  rows[1].querySelector('[name^="dateOfTest"]').value = "2026-06-08";
  rows[2].querySelector('[name^="age"]').value = "28";
  rows[2].querySelector('[name^="dateOfTest"]').value = "2026-06-29";

  tableManager.assignSetNumbersByAge(tableBody);

  assert.equal(rows[0].querySelector('[name^="setNo"]').value, "2");
  assert.equal(rows[1].querySelector('[name^="setNo"]').value, "1");
  assert.equal(rows[2].querySelector('[name^="setNo"]').value, "2");
});

test("assignSetNumbersByAge orders sets by age when date of test is not yet known", () => {
  makeDom(resultRowHtml(1) + resultRowHtml(2));
  const tableBody = global.document.querySelector("tbody");
  const rows = tableBody.querySelectorAll("tr");

  rows[0].querySelector('[name^="age"]').value = "56";
  rows[1].querySelector('[name^="age"]').value = "7";

  tableManager.assignSetNumbersByAge(tableBody);

  assert.equal(rows[0].querySelector('[name^="setNo"]').value, "2");
  assert.equal(rows[1].querySelector('[name^="setNo"]').value, "1");
});

test("changing age regroups set numbers in chronological order", () => {
  makeFormDom(`
    <input type="date" name="dateOfCast" value="2026-06-01">
    <table><tbody>${resultRowHtml(1)}${resultRowHtml(2)}${resultRowHtml(3)}</tbody></table>
  `);
  const tableBody = global.document.querySelector("tbody");
  const rows = tableBody.querySelectorAll("tr");
  rows.forEach((row) => tableManager.attachRowListeners(row, tableBody, () => {}));

  rows[0].querySelector('[name^="age"]').value = "28";
  rows[0].querySelector('[name^="age"]').dispatchEvent(new global.window.Event("input", { bubbles: true }));
  rows[1].querySelector('[name^="age"]').value = "7";
  rows[1].querySelector('[name^="age"]').dispatchEvent(new global.window.Event("input", { bubbles: true }));
  rows[2].querySelector('[name^="age"]').value = "28";
  rows[2].querySelector('[name^="age"]').dispatchEvent(new global.window.Event("input", { bubbles: true }));

  assert.equal(rows[0].querySelector('[name^="setNo"]').value, "2");
  assert.equal(rows[1].querySelector('[name^="setNo"]').value, "1");
  assert.equal(rows[2].querySelector('[name^="setNo"]').value, "2");
  assert.equal(rows[0].querySelector('[name^="dateOfTest"]').value, "2026-06-29");
  assert.equal(rows[1].querySelector('[name^="dateOfTest"]').value, "2026-06-08");
  assert.equal(rows[2].querySelector('[name^="dateOfTest"]').value, "2026-06-29");
});

test("assignSetNumbersByAge is a no-op without a table body", () => {
  assert.doesNotThrow(() => tableManager.assignSetNumbersByAge(null));
});

test("clearResultRows resets result inputs to their defaults and keeps rows", () => {
  makeDom(
    '<tr><td><input name="setNo1" value="1"><input name="specimenRef1"><select name="failureMode1">' +
    '<option value="" selected>-</option><option value="A">A</option></select></td></tr>' +
    '<tr><td><input name="setNo2" value="1"><input name="age2"></td></tr>'
  );
  const tableBody = global.document.querySelector("tbody");
  tableBody.querySelector('[name="setNo1"]').value = "3";
  tableBody.querySelector('[name="specimenRef1"]').value = "REF-1";
  tableBody.querySelector('[name="failureMode1"]').value = "A";
  tableBody.querySelector('[name="age2"]').value = "7";

  tableManager.clearResultRows(tableBody);

  assert.equal(tableBody.querySelectorAll("tr").length, 2);
  assert.equal(tableBody.querySelector('[name="setNo1"]').value, "1");
  assert.equal(tableBody.querySelector('[name="specimenRef1"]').value, "");
  assert.equal(tableBody.querySelector('[name="failureMode1"]').value, "");
  assert.equal(tableBody.querySelector('[name="age2"]').value, "");
});

test("clearResultRows tolerates a missing table body", () => {
  assert.doesNotThrow(() => tableManager.clearResultRows(null));
});

function changeValue(input, value) {
  input.value = value;
  input.dispatchEvent(new global.window.Event("input", { bubbles: true }));
  input.dispatchEvent(new global.window.Event("change", { bubbles: true }));
}

test("changing the request date of cast after clearing results recalculates date of test", () => {
  makeFormDom(`
    <input type="date" name="dateOfCast">
    <table><tbody>${resultRowHtml(1)}</tbody></table>
  `);
  const form = global.document.getElementById("cubeRequestForm");
  const tableBody = global.document.querySelector("tbody");
  const row = tableBody.querySelector("tr");
  tableManager.attachRowListeners(row, tableBody, () => {});
  tableManager.bindRequestDateOfCast(form, tableBody);

  changeValue(form.elements.dateOfCast, "2026-09-01");
  changeValue(row.querySelector('[name^="age"]'), "3");
  assert.equal(row.querySelector('[name^="dateOfTest"]').value, "2026-09-04");

  // Next form: clear the results, enter the age, then pick the new cast date.
  tableManager.clearResultRows(tableBody);
  changeValue(row.querySelector('[name^="age"]'), "3");
  changeValue(form.elements.dateOfCast, "2026-09-13");

  assert.equal(row.querySelector('[name^="resultDateOfCast"]').value, "2026-09-13");
  assert.equal(row.querySelector('[name^="dateOfTest"]').value, "2026-09-16");
});

test("changing the request date of cast moves rows that followed it", () => {
  makeFormDom(`
    <input type="date" name="dateOfCast" value="2026-09-01">
    <table><tbody>${resultRowHtml(1)}${resultRowHtml(2)}</tbody></table>
  `);
  const form = global.document.getElementById("cubeRequestForm");
  const tableBody = global.document.querySelector("tbody");
  const [followRow, ownRow] = Array.from(tableBody.querySelectorAll("tr"));
  // Loaded rows (e.g. a saved form) carry the request cast date on the row.
  followRow.querySelector('[name^="resultDateOfCast"]').value = "2026-09-01";
  followRow.querySelector('[name^="age"]').value = "7";
  followRow.querySelector('[name^="dateOfTest"]').value = "2026-09-08";
  [followRow, ownRow].forEach((row) => tableManager.attachRowListeners(row, tableBody, () => {}));
  tableManager.bindRequestDateOfCast(form, tableBody);

  // A row with its own cast date keeps it when the request date changes.
  changeValue(ownRow.querySelector('[name^="resultDateOfCast"]'), "2026-08-30");
  changeValue(ownRow.querySelector('[name^="age"]'), "28");

  form.elements.dateOfCast.dispatchEvent(new global.window.Event("focus"));
  changeValue(form.elements.dateOfCast, "2026-09-13");

  assert.equal(followRow.querySelector('[name^="resultDateOfCast"]').value, "2026-09-13");
  assert.equal(followRow.querySelector('[name^="dateOfTest"]').value, "2026-09-20");
  assert.equal(ownRow.querySelector('[name^="resultDateOfCast"]').value, "2026-08-30");
  assert.equal(ownRow.querySelector('[name^="dateOfTest"]').value, "2026-09-27");
});

function resultTable(rowCount, renderBarcode = () => {}) {
  const markup = require("./cubesync-form-markup.js");
  makeDom("");
  global.window.CubeSyncFormMarkup = markup;
  const tableBody = global.document.querySelector("tbody");
  markup.seedResultRows(tableBody, rowCount);
  Array.from(tableBody.querySelectorAll("tr")).forEach((row) => {
    tableManager.attachRowListeners(row, tableBody, renderBarcode);
  });
  return tableBody;
}

function fieldInputs(tableBody, field) {
  return Array.from(tableBody.querySelectorAll(`[name^="${field}"]`));
}

function fieldValues(tableBody, field) {
  return fieldInputs(tableBody, field).map((input) => input.value);
}

// Type one character at a time, firing input like a keyboard would.
function typeInto(input, text) {
  input.focus();
  for (const character of text) {
    input.value += character;
    input.dispatchEvent(new global.window.Event("input", { bubbles: true }));
  }
}

// Replace the whole value in one input event, like select-all then paste.
function replaceValue(input, value) {
  input.focus();
  input.value = value;
  input.dispatchEvent(new global.window.Event("input", { bubbles: true }));
}

test("nextSpecimenRef counts on from the trailing number and keeps zero padding", () => {
  assert.equal(tableManager.nextSpecimenRef("CUBE-01"), "CUBE-02");
  assert.equal(tableManager.nextSpecimenRef("CUBE-09"), "CUBE-10");
  assert.equal(tableManager.nextSpecimenRef("CUBE-99"), "CUBE-100");
  assert.equal(tableManager.nextSpecimenRef("TT-1"), "TT-2");
  assert.equal(tableManager.nextSpecimenRef("ABC007"), "ABC008");
  assert.equal(tableManager.nextSpecimenRef(" TT-01 "), "TT-02");
  assert.equal(tableManager.nextSpecimenRef("12"), "13");
  assert.equal(tableManager.nextSpecimenRef("CUBE"), "");
  assert.equal(tableManager.nextSpecimenRef(""), "");
  assert.equal(tableManager.nextSpecimenRef(null), "");
});

test("nextSpecimenRef counts on alphabetically from a single trailing letter", () => {
  assert.equal(tableManager.nextSpecimenRef("CUBE-A"), "CUBE-B");
  assert.equal(tableManager.nextSpecimenRef("CUBE-Y"), "CUBE-Z");
  assert.equal(tableManager.nextSpecimenRef("cube-c"), "cube-d");
  assert.equal(tableManager.nextSpecimenRef("TT A"), "TT B");
  assert.equal(tableManager.nextSpecimenRef("1A"), "1B");
  assert.equal(tableManager.nextSpecimenRef("A"), "B");
  assert.equal(tableManager.nextSpecimenRef(" CUBE-A "), "CUBE-B");
  // The letters stop at Z, and a trailing word is not a letter sequence.
  assert.equal(tableManager.nextSpecimenRef("CUBE-Z"), "");
  assert.equal(tableManager.nextSpecimenRef("CUBE-AB"), "");
  assert.equal(tableManager.nextSpecimenRef("TT-CUBE"), "");
});

test("barcodePrefix returns the project code before the running number", () => {
  assert.equal(tableManager.barcodePrefix("PYY-0002/00166"), "PYY-0002/");
  assert.equal(tableManager.barcodePrefix("ABC12345"), "ABC");
  assert.equal(tableManager.barcodePrefix("PYY-0002/"), "");
  assert.equal(tableManager.barcodePrefix("00166"), "");
  assert.equal(tableManager.barcodePrefix(""), "");
});

test("typing the first specimen ref numbers the rows below it", () => {
  const tableBody = resultTable(4);

  typeInto(fieldInputs(tableBody, "specimenRef")[0], "CUBE-01");

  assert.deepEqual(fieldValues(tableBody, "specimenRef"), ["CUBE-01", "CUBE-02", "CUBE-03", "CUBE-04"]);
});

test("a hand-typed specimen ref is kept and the rows below count on from it", () => {
  const tableBody = resultTable(4);
  const refs = fieldInputs(tableBody, "specimenRef");
  typeInto(refs[0], "CUBE-01");

  replaceValue(refs[2], "SPEC-10");
  assert.deepEqual(fieldValues(tableBody, "specimenRef"), ["CUBE-01", "CUBE-02", "SPEC-10", "SPEC-11"]);

  replaceValue(refs[0], "TT-01");
  assert.deepEqual(fieldValues(tableBody, "specimenRef"), ["TT-01", "TT-02", "SPEC-10", "SPEC-11"]);
});

test("clearing the first specimen ref clears the refs that followed it", () => {
  const tableBody = resultTable(3);
  const refs = fieldInputs(tableBody, "specimenRef");
  typeInto(refs[0], "CUBE-01");

  replaceValue(refs[0], "");

  assert.deepEqual(fieldValues(tableBody, "specimenRef"), ["", "", ""]);
});

test("specimen refs loaded without events follow an edit to the first ref", () => {
  const tableBody = resultTable(3);
  const refs = fieldInputs(tableBody, "specimenRef");
  ["A-1", "A-2", "A-3"].forEach((value, index) => {
    refs[index].value = value;
  });

  replaceValue(refs[0], "B-1");

  assert.deepEqual(fieldValues(tableBody, "specimenRef"), ["B-1", "B-2", "B-3"]);
});

test("addResultRow continues the specimen ref of the row above", () => {
  const tableBody = resultTable(1);
  typeInto(fieldInputs(tableBody, "specimenRef")[0], "CUBE-07");

  tableManager.addResultRow(tableBody, { elements: {} }, () => {});

  assert.deepEqual(fieldValues(tableBody, "specimenRef"), ["CUBE-07", "CUBE-08"]);

  // The new row follows later edits to the row above as well.
  replaceValue(fieldInputs(tableBody, "specimenRef")[0], "CUBE-20");
  assert.deepEqual(fieldValues(tableBody, "specimenRef"), ["CUBE-20", "CUBE-21"]);
});

test("addResultRow leaves the specimen ref blank when the row above has nothing to count on", () => {
  const tableBody = resultTable(1);
  typeInto(fieldInputs(tableBody, "specimenRef")[0], "CUBE");

  tableManager.addResultRow(tableBody, { elements: {} }, () => {});

  assert.deepEqual(fieldValues(tableBody, "specimenRef"), ["CUBE", ""]);
});

test("focusing an empty barcode fills in the project code of the barcode above", async () => {
  const tableBody = resultTable(3);
  const barcodes = fieldInputs(tableBody, "barcode");
  typeInto(barcodes[0], "PYY-0002/00166");

  barcodes[1].focus();
  assert.equal(barcodes[1].value, "PYY-0002/");
  assert.equal(barcodes[1].selectionStart, "PYY-0002/".length);

  // Clicking or tabbing in may move the caret after focus; it is put back.
  barcodes[1].setSelectionRange(0, barcodes[1].value.length);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(barcodes[1].selectionStart, "PYY-0002/".length);
  assert.equal(barcodes[1].selectionEnd, "PYY-0002/".length);

  typeInto(barcodes[1], "00165");
  barcodes[1].blur();
  assert.equal(barcodes[1].value, "PYY-0002/00165");

  // A row further down takes the code from the nearest barcode above it.
  barcodes[2].focus();
  assert.equal(barcodes[2].value, "PYY-0002/");
});

test("leaving a barcode without typing a running number empties it again", () => {
  const rendered = [];
  const tableBody = resultTable(2, (input) => rendered.push(input.value));
  const barcodes = fieldInputs(tableBody, "barcode");
  typeInto(barcodes[0], "PYY-0002/00166");
  rendered.length = 0;

  barcodes[1].focus();
  barcodes[1].blur();

  assert.equal(barcodes[1].value, "");
  assert.deepEqual(rendered, [""]);
});

test("focusing a barcode leaves it alone without a project code above or when it has a value", () => {
  const tableBody = resultTable(3);
  const barcodes = fieldInputs(tableBody, "barcode");

  barcodes[0].focus();
  assert.equal(barcodes[0].value, "");
  barcodes[1].focus();
  assert.equal(barcodes[1].value, "", "no barcode above yet");

  typeInto(barcodes[0], "00166");
  barcodes[1].focus();
  assert.equal(barcodes[1].value, "", "the barcode above has no project code");

  replaceValue(barcodes[0], "PYY-0002/00166");
  barcodes[2].value = "XYZ-1/00001";
  barcodes[2].focus();
  assert.equal(barcodes[2].value, "XYZ-1/00001");

  barcodes[1].readOnly = true;
  barcodes[1].focus();
  assert.equal(barcodes[1].value, "");
});

test("typing or scanning the whole barcode after the filled-in code keeps one copy", () => {
  const tableBody = resultTable(3);
  const barcodes = fieldInputs(tableBody, "barcode");
  typeInto(barcodes[0], "PYY-0002/00166");

  typeInto(barcodes[1], "PYY-0002/00165");
  assert.equal(barcodes[1].value, "PYY-0002/00165");

  barcodes[2].focus();
  barcodes[2].value += "PYY-0002/00164";
  barcodes[2].dispatchEvent(new global.window.Event("input", { bubbles: true }));
  assert.equal(barcodes[2].value, "PYY-0002/00164");
});

test("empty barcodes show the carried project code as their placeholder", () => {
  const tableBody = resultTable(3);
  const barcodes = fieldInputs(tableBody, "barcode");
  const placeholders = () => barcodes.map((input) => input.getAttribute("placeholder"));

  typeInto(barcodes[0], "PYY-0002/00166");
  assert.deepEqual(placeholders(), ["Enter barcode text", "PYY-0002/", "PYY-0002/"]);

  tableManager.addResultRow(tableBody, { elements: {} }, () => {});
  assert.equal(fieldInputs(tableBody, "barcode")[3].getAttribute("placeholder"), "PYY-0002/");

  tableManager.clearResultRows(tableBody);
  assert.deepEqual(placeholders(), ["Enter barcode text", "Enter barcode text", "Enter barcode text"]);
});

test("removing a row refreshes the carried barcode placeholders", () => {
  const tableBody = resultTable(3);
  typeInto(fieldInputs(tableBody, "barcode")[0], "PYY-0002/00166");

  tableBody.querySelector("tr .remove-row-btn").dispatchEvent(
    new global.window.Event("click", { bubbles: true })
  );

  assert.deepEqual(
    fieldInputs(tableBody, "barcode").map((input) => input.getAttribute("placeholder")),
    ["Enter barcode text", "Enter barcode text"]
  );
});

test("clicking into a barcode with only the filled-in code puts the caret after it", () => {
  const tableBody = resultTable(2);
  const barcodes = fieldInputs(tableBody, "barcode");
  typeInto(barcodes[0], "PYY-0002/00166");

  barcodes[1].focus();
  // The mouse release puts the caret where the click landed.
  barcodes[1].setSelectionRange(0, 0);
  barcodes[1].dispatchEvent(new global.window.MouseEvent("click", { bubbles: true }));

  assert.equal(barcodes[1].selectionStart, "PYY-0002/".length);
});

test("typing a lettered specimen ref fills the rows below alphabetically", () => {
  const tableBody = resultTable(4);

  typeInto(fieldInputs(tableBody, "specimenRef")[0], "CUBE-A");

  assert.deepEqual(fieldValues(tableBody, "specimenRef"), ["CUBE-A", "CUBE-B", "CUBE-C", "CUBE-D"]);
});

test("switching the first ref between numbers and letters renumbers the rows that follow", () => {
  const tableBody = resultTable(3);
  const refs = fieldInputs(tableBody, "specimenRef");
  typeInto(refs[0], "CUBE-01");

  replaceValue(refs[0], "CUBE-A");
  assert.deepEqual(fieldValues(tableBody, "specimenRef"), ["CUBE-A", "CUBE-B", "CUBE-C"]);

  replaceValue(refs[0], "CUBE-01");
  assert.deepEqual(fieldValues(tableBody, "specimenRef"), ["CUBE-01", "CUBE-02", "CUBE-03"]);
});

test("a lettered ref typed over an auto-filled one is kept and the rows below follow it", () => {
  const tableBody = resultTable(4);
  const refs = fieldInputs(tableBody, "specimenRef");
  typeInto(refs[0], "CUBE-A");

  replaceValue(refs[2], "CUBE-X");
  assert.deepEqual(fieldValues(tableBody, "specimenRef"), ["CUBE-A", "CUBE-B", "CUBE-X", "CUBE-Y"]);

  replaceValue(refs[0], "TT-A");
  assert.deepEqual(fieldValues(tableBody, "specimenRef"), ["TT-A", "TT-B", "CUBE-X", "CUBE-Y"]);
});

test("lettered refs stop filling after Z", () => {
  const tableBody = resultTable(3);

  typeInto(fieldInputs(tableBody, "specimenRef")[0], "CUBE-Y");

  assert.deepEqual(fieldValues(tableBody, "specimenRef"), ["CUBE-Y", "CUBE-Z", ""]);
});
