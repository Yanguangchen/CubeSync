const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { JSDOM } = require("jsdom");

const TESTING_TEAM_COLUMNS = [
  ["weightKg", "WEIGHT AS RECEIVED (kg)"],
  ["loadKn", "LOAD (kN)"],
  ["strength", "COMPRESSIVE STRENGTH (N/mm²)"],
  ["failureMode", "MODE OF FAILURE"]
];

function expectedBarcodeInputCount(html) {
  const staticCount = (html.match(/data-barcode-input/g) || []).length;
  const seedMatch = html.match(/data-initial-result-rows="(\d+)"/);
  if (seedMatch) {
    return parseInt(seedMatch[1], 10);
  }
  return staticCount;
}

function readBundledCss(file) {
  const baseDir = path.dirname(file);
  let content = fs.readFileSync(file, "utf8");
  for (const match of content.matchAll(/@import url\("([^"]+)"\)/g)) {
    content += "\n" + fs.readFileSync(path.join(baseDir, match[1]), "utf8");
  }
  return content;
}

function assertConcreteForm(html) {
  assert.match(html, /CONCRETE CUBE TEST REQUEST FORM/);
  assert.match(html, /TEST RESULTS/);
  assert.match(html, /Size \*/);
  assert.match(html, /Mean Slump/);
  assert.match(html, /Specified Slump/);
  for (const [field, label] of TESTING_TEAM_COLUMNS) {
    assert.match(html, new RegExp(`data-result-field="${field}">${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</th>`));
  }
  assert.match(html, /assets\/logo\.png/);
  assert.match(html, /barcode\.js/);
  assert.match(html, /app\.js/);
  assert.match(html, /id="cubeRequestForm"[^>]*novalidate/);
  assert.equal(expectedBarcodeInputCount(html), 3);
}

function assertBlankTestingTeamInputs(html, expectedRows) {
  const document = new JSDOM(html).window.document;

  for (const [field] of TESTING_TEAM_COLUMNS) {
    const inputs = document.querySelectorAll(`[name^="${field}"]`);
    assert.equal(inputs.length, expectedRows, `${field} should exist once per static result row`);
    inputs.forEach((input) => {
      assert.equal(input.value, "");
      assert.equal(input.hasAttribute("value"), false);
      assert.equal(input.hasAttribute("placeholder"), false);
    });
  }
}

test("original digital form keeps the PDF form sections and ten barcode inputs", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const css = readBundledCss("css/styles.css");

  assert.match(html, /css\/styles\.css/);
  assert.match(css, /html \{\s*font-family: Arial, sans-serif;/);
  assert.match(css, /body \{[\s\S]*font-family: Arial, sans-serif;/);
  assert.match(css, /button,\s*input,\s*select \{[\s\S]*font-family: Arial, sans-serif;/);
  assertConcreteForm(html);
  assertBlankTestingTeamInputs(html, 3);
});

test("original form stays full width after its stylesheet loads", () => {
  const css = readBundledCss("css/styles.css");

  assert.match(css, /\.sheet\s*\{\s*width:\s*calc\(100vw - 24px\)/);
  assert.doesNotMatch(css, /\.sheet\s*\{\s*width:\s*min\(1180px/);
});

test("both forms map configurable result fields to matching column tracks", () => {
  for (const file of ["index.html", "glassmorphic.html"]) {
    const document = new JSDOM(fs.readFileSync(file, "utf8")).window.document;
    const headerFields = Array.from(document.querySelectorAll(".results-table thead [data-result-field]"),
      (cell) => cell.dataset.resultField);
    const columnFields = Array.from(document.querySelectorAll(".results-table col[data-result-field]"),
      (column) => column.dataset.resultField);

    assert.deepEqual(columnFields, headerFields, `${file} should collapse the same tracks as hidden result cells`);
  }
});

test("glassmorphic digital form uses Outfit and keeps barcode inputs", () => {
  const html = fs.readFileSync("glassmorphic.html", "utf8");
  const css = readBundledCss("css/glassmorphic.css");

  assert.match(html, /css\/glassmorphic\.css/);
  assert.match(html, /cubesync-form-markup\.js/);
  assert.match(html, /fonts\.googleapis\.com/);
  assert.match(html, /Outfit/);
  assert.match(css, /font-family: "Outfit"/);
  assert.match(css, /backdrop-filter: blur/);
  assertConcreteForm(html);
});

test("both printable forms hide test-result editing controls", () => {
  const originalCss = readBundledCss("css/styles.css");
  const glassCss = readBundledCss("css/glassmorphic.css");

  for (const css of [originalCss, glassCss]) {
    assert.match(css, /@media print[\s\S]*\.add-row-btn,[\s\S]*\.result-actions\s*\{[\s\S]*display:\s*none/);
  }
});

test("original form print layout gives test results the full printable width", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const css = readBundledCss("css/styles.css");
  const printCss = css.slice(css.indexOf("@media print"));

  assert.match(html, /cdn\.botpress\.cloud\/webchat\/v3\.6\/inject\.js/);
  assert.match(css, /body\.is-printing \.bpFABMessagePreview,[\s\S]*body\.is-printing iframe\[title="Botpress"\]\s*\{[^}]*display:\s*none\s*!important/);
  assert.match(printCss, /\.bpFab,[\s\S]*\.bpFABMessagePreview,[\s\S]*iframe\[title="Botpress"\]\s*\{[^}]*display:\s*none\s*!important/);
  assert.match(printCss, /html,\s*body\s*\{[^}]*width:\s*100%[^}]*zoom:\s*1/);
  assert.match(printCss, /\.sheet\s*\{[^}]*width:\s*100%[^}]*max-width:\s*none[^}]*page-break-inside:\s*auto/);
  assert.match(printCss, /\.results-section,\s*\.table-wrap\s*\{[^}]*width:\s*100%[^}]*max-width:\s*none/);
  assert.match(printCss, /\.results-table\s*\{[^}]*width:\s*100%[^}]*max-width:\s*none[^}]*font-size:\s*8px/);
  assert.match(printCss, /\.results-table td\s*\{[^}]*min-width:\s*0[^}]*overflow:\s*hidden/);
  assert.match(printCss, /\.results-table thead\s*\{[^}]*display:\s*table-header-group/);
});

test("barcode cells keep compact entry fields and previews inside their columns", () => {
  const app = fs.readFileSync("app.js", "utf8");
  const originalCss = readBundledCss("css/styles.css");
  const originalPrintCss = originalCss.slice(originalCss.indexOf("@media print"));
  const glassCss = readBundledCss("css/glassmorphic.css");

  assert.match(app, /has-barcode/);
  assert.match(app, /preview\.innerHTML = ""/);
  assert.match(app, /height:\s*64/);
  assert.match(app, /moduleWidth:\s*1\.45/);
  assert.match(originalCss, /\.results-table \.barcode-cell > input[\s\S]*max-width:\s*150px/);
  assert.match(originalCss, /\.barcode-cell\s*\{[^}]*overflow:\s*hidden/);
  assert.match(originalCss, /\.barcode-preview[\s\S]*display:\s*none/);
  assert.match(originalCss, /\.barcode-cell\.has-barcode \.barcode-preview[\s\S]*display:\s*flex/);
  assert.match(originalCss, /--barcode-preview-height:\s*38px/);
  assert.match(originalCss, /--barcode-svg-height:\s*30px/);
  assert.match(originalPrintCss, /\.barcode-preview\s*\{[^}]*height:\s*30px/);
  assert.match(originalCss, /\.barcode-preview\s*\{[^}]*overflow:\s*hidden/);
  assert.match(originalCss, /\.barcode-preview svg\s*\{[^}]*width:\s*100%[^}]*max-width:\s*100%[^}]*object-fit:\s*contain/);
  assert.match(glassCss, /\.results-table \.barcode-cell > input[\s\S]*max-width:\s*150px/);
  assert.match(glassCss, /\.barcode-cell\s*\{[^}]*overflow:\s*hidden/);
  assert.match(glassCss, /\.barcode-preview[\s\S]*display:\s*none/);
  assert.match(glassCss, /\.barcode-cell\.has-barcode \.barcode-preview[\s\S]*display:\s*flex/);
  assert.match(glassCss, /\.barcode-preview[\s\S]*height:\s*52px/);
  assert.match(glassCss, /\.barcode-preview\s*\{[^}]*overflow:\s*hidden/);
  assert.match(glassCss, /\.barcode-preview svg\s*\{[^}]*width:\s*100%[^}]*max-width:\s*100%[^}]*object-fit:\s*contain/);
});

test("slump fields are not marked required in either HTML form", () => {
  const fs = require("node:fs");
  const index = fs.readFileSync("index.html", "utf8");
  const glass = fs.readFileSync("glassmorphic.html", "utf8");

  for (const html of [index, glass]) {
    assert.doesNotMatch(html, /name="slumpMeasured"[^>]*required/,
      "slumpMeasured must not have required attribute");
    assert.doesNotMatch(html, /name="slumpSpecified"[^>]*required/,
      "slumpSpecified must not have required attribute");
  }
});

test("both form stylesheets enforce [hidden] with !important so author display rules cannot reveal disabled fields", () => {
  const originalCss = readBundledCss("css/styles.css");
  const glassCss = readBundledCss("css/glassmorphic.css");

  assert.match(originalCss, /\[hidden\]\s*\{[^}]*display\s*:\s*none\s*!important/);
  assert.match(glassCss, /\[hidden\]\s*\{[^}]*display\s*:\s*none\s*!important/);
});
