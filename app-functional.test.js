const { JSDOM } = require("jsdom");
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const glassHtml = fs.readFileSync("glassmorphic.html", "utf8");

test("app.js handles multi-step navigation in glassmorphic form", async () => {
  const dom = new JSDOM(glassHtml, { url: "http://localhost/" });
  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.URLSearchParams = dom.window.URLSearchParams;
  global.Event = dom.window.Event;
  global.scrollTo = () => {};

  // Mock dependencies and assign to window
  global.window.CubeSyncBarcode = require("./barcode.js");
  global.window.CubeSyncFormData = require("./cubesync-form-data.js");
  
  // Load app.js
  require("./app.js");

  // Trigger DOMContentLoaded
  const event = new global.Event("DOMContentLoaded");
  global.window.dispatchEvent(event);

  // Test Multi-step
  const nextBtn = global.document.getElementById("nextStep");
  const step2 = global.document.querySelector('.form-step[data-step="2"]');
  assert.ok(step2, "Step 2 should exist in glassmorphic form");
  assert.ok(!step2.classList.contains("active"));
  
  nextBtn.click();
  assert.ok(step2.classList.contains("active"));

  // Clean up
  delete require.cache[require.resolve("./app.js")];
});

test("app.js renders barcodes and handles dynamic rows", async () => {
  const dom = new JSDOM(glassHtml, { url: "http://localhost/" });
  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.URLSearchParams = dom.window.URLSearchParams;
  global.Event = dom.window.Event;
  global.scrollTo = () => {};

  global.window.CubeSyncBarcode = require("./barcode.js");
  global.window.CubeSyncFormData = require("./cubesync-form-data.js");
  require("./app.js");

  const event = new global.Event("DOMContentLoaded");
  global.window.dispatchEvent(event);

  const input = global.document.querySelector("[data-barcode-input]");
  input.value = "CUBE-101";
  input.dispatchEvent(new global.Event("input"));

  const cell = input.closest(".barcode-cell");
  const preview = cell.querySelector(".barcode-preview");
  assert.match(preview.innerHTML, /<svg/);

  // Test Dynamic Rows
  const addRowBtn = global.document.getElementById("addRowButton");
  const tableBody = global.document.querySelector(".results-table tbody");
  const initialRows = tableBody.querySelectorAll("tr").length;
  
  addRowBtn.click();
  assert.equal(tableBody.querySelectorAll("tr").length, initialRows + 1);

  delete require.cache[require.resolve("./app.js")];
});
