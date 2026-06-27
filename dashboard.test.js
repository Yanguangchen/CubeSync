const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

function readBundledCss(file) {
  const baseDir = path.dirname(file);
  let content = fs.readFileSync(file, "utf8");
  for (const match of content.matchAll(/@import url\("([^"]+)"\)/g)) {
    content += "\n" + fs.readFileSync(path.join(baseDir, match[1]), "utf8");
  }
  return content;
}

test("dashboard frontend exposes form CRUD controls", () => {
  const html = fs.readFileSync("dashboard.html", "utf8");
  const css = readBundledCss("css/dashboard.css");
  const js = fs.readFileSync("dashboard.js", "utf8");

  assert.match(html, /<title>Concrete Cube Dashboard<\/title>/);
  assert.match(html, /<h1>Human Dashboard<\/h1>/);
  assert.match(html, /metricsGrid/);
  assert.match(html, /workloadInsight/);
  assert.match(html, /Metrics dashboard/);
  assert.match(html, /metricsTitle[^>]*>Metrics dashboard <span class="trial-badge">TRIAL<\/span>/);
  assert.match(js, /renderMetrics/);
  assert.match(js, /CubeSyncMetrics/);
  assert.match(js, /renderWorkloadInsight/);
  assert.match(css, /\.metrics-grid/);
  assert.match(css, /\.workload-insight/);
  assert.doesNotMatch(html, /<h1>Concrete Cube Dashboard<\/h1>/);
  assert.match(html, /css\/dashboard\.css/);
  assert.match(html, /barcode\.js/);
  assert.match(html, /cubesync-form-data\.js/);
  assert.match(html, /firestore\.js/);
  assert.match(html, /dashboard\.js/);
  assert.match(html, /authGate/);
  assert.match(html, /signInButton/);
  assert.match(html, /signOutButton/);
  assert.match(html, /assets\/logoBanner\.png/);
  assert.match(html, /formList/);
  assert.doesNotMatch(html, /exportAllButton/);
  assert.doesNotMatch(html, /cubesync-export\.js/);
  assert.match(html, /detailPanel/);
  assert.match(html, /editDialog/);
  assert.match(html, /printArea/);
  assert.match(html, /New Original Form/);
  assert.match(html, /New Glassmorphic Form/);
  assert.match(html, /fieldSettingsButton/);
  assert.match(html, /fieldConfigDialog/);
  assert.match(html, /fieldConfigForm/);

  for (const action of ["View", "Edit", "Print", "Delete"]) {
    assert.match(js, new RegExp(`data-action=\\"${action.toLowerCase()}\\"`));
  }

  assert.match(js, /CubeSyncFirestore/);
  assert.match(js, /CubeSyncAuth/);
  assert.match(js, /onAuthChange/);
  assert.match(js, /signInWithGoogle/);
  assert.match(js, /signOutUser/);
  assert.match(js, /listCubeRequests/);
  assert.match(js, /updateCubeRequest/);
  assert.match(js, /deleteCubeRequest/);
  assert.match(js, /CubeSyncBarcode/);
  assert.doesNotMatch(js, /CubeSyncExport/);
  assert.doesNotMatch(js, /buildExportFiles/);
  assert.doesNotMatch(js, /downloadFilesAsZip/);
  assert.match(js, /renderBarcodeSvg/);
  assert.match(js, /raw\.results/);
  assert.doesNotMatch(js, /barcodeSvg/);
  assert.doesNotMatch(js, /barcodeImage/);
  assert.doesNotMatch(js, /data:image/);
  assert.doesNotMatch(js, /cubesync\.forms/);
  assert.doesNotMatch(js, /seedForms/);
  assert.match(js, /renderForms/);
  assert.match(js, /openEditor/);
  assert.match(js, /deleteForm/);
  assert.match(js, /printForm/);
  assert.match(js, /saveFieldConfig/);
  assert.match(js, /loadFieldConfig/);
  assert.match(js, /renderFieldConfigEditor/);
  assert.match(css, /\.field-config-dialog/);
  assert.match(css, /\.dashboard-shell/);
  assert.match(css, /\.dashboard-logo/);
  assert.match(css, /\.form-table/);
  assert.match(css, /backdrop-filter: blur/);
  assert.match(css, /rgba\(255, 255, 255, 0\./);
  assert.match(css, /linear-gradient/);
  assert.match(css, /\.glass-panel/);
});
