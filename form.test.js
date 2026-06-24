const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

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
  assert.match(html, /Mean Slump \*/);
  assert.match(html, /Specified Slump \*/);
  assert.match(html, /assets\/logo\.png/);
  assert.match(html, /barcode\.js/);
  assert.match(html, /app\.js/);
  assert.match(html, /id="cubeRequestForm"[^>]*novalidate/);
  assert.equal(expectedBarcodeInputCount(html), 3);
}

test("original digital form keeps the PDF form sections and ten barcode inputs", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const css = readBundledCss("css/styles.css");

  assert.match(html, /css\/styles\.css/);
  assert.match(css, /html \{\s*font-family: Arial, sans-serif;/);
  assert.match(css, /body \{[\s\S]*font-family: Arial, sans-serif;/);
  assert.match(css, /button,\s*input,\s*select \{[\s\S]*font-family: Arial, sans-serif;/);
  assertConcreteForm(html);
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

test("barcode cells keep compact entry fields and bounded previews in both styles", () => {
  const app = fs.readFileSync("app.js", "utf8");
  const originalCss = readBundledCss("css/styles.css");
  const glassCss = readBundledCss("css/glassmorphic.css");

  assert.match(app, /has-barcode/);
  assert.match(app, /preview\.innerHTML = ""/);
  assert.match(app, /height:\s*64/);
  assert.match(app, /moduleWidth:\s*1\.45/);
  assert.match(originalCss, /\.results-table \.barcode-cell > input[\s\S]*max-width:\s*150px/);
  assert.match(originalCss, /\.barcode-cell[\s\S]*overflow:\s*visible/);
  assert.match(originalCss, /\.barcode-preview[\s\S]*display:\s*none/);
  assert.match(originalCss, /\.barcode-cell\.has-barcode \.barcode-preview[\s\S]*display:\s*flex/);
  assert.match(originalCss, /\.barcode-preview[\s\S]*height:\s*72px/);
  assert.match(originalCss, /\.barcode-preview[\s\S]*overflow-x:\s*auto/);
  assert.match(originalCss, /\.barcode-preview svg[\s\S]*width:\s*auto/);
  assert.match(glassCss, /\.results-table \.barcode-cell > input[\s\S]*max-width:\s*150px/);
  assert.match(glassCss, /\.barcode-cell[\s\S]*overflow:\s*visible/);
  assert.match(glassCss, /\.barcode-preview[\s\S]*display:\s*none/);
  assert.match(glassCss, /\.barcode-cell\.has-barcode \.barcode-preview[\s\S]*display:\s*flex/);
  assert.match(glassCss, /\.barcode-preview[\s\S]*height:\s*72px/);
  assert.match(glassCss, /\.barcode-preview[\s\S]*overflow-x:\s*auto/);
  assert.match(glassCss, /\.barcode-preview svg[\s\S]*width:\s*auto/);
});

test("both form stylesheets enforce [hidden] with !important so author display rules cannot reveal disabled fields", () => {
  const originalCss = readBundledCss("css/styles.css");
  const glassCss = readBundledCss("css/glassmorphic.css");

  assert.match(originalCss, /\[hidden\]\s*\{[^}]*display\s*:\s*none\s*!important/);
  assert.match(glassCss, /\[hidden\]\s*\{[^}]*display\s*:\s*none\s*!important/);
});
