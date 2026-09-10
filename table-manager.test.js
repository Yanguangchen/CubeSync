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
