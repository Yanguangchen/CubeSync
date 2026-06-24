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
