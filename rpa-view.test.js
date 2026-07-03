const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const { FORM_FIELDS, RESULT_FIELDS } = require("./cubesync-form-data");

function readFile(path) {
  return fs.readFileSync(path, "utf8");
}

function assertIncludesAllFields(source, fields) {
  for (const field of fields) {
    assert.match(source, new RegExp(`${field}:`));
  }
}

test("RPA dashboard opens Firestore cube request documents", () => {
  const html = readFile("rpa-dashboard.html");
  const js = readFile("rpa-dashboard.js");

  assert.match(html, /cubesync-form-data\.js/);
  assert.match(html, /cubesync-export\.js/);
  assert.match(html, /firestore\.js/);
  assert.match(html, /authGate/);
  assert.match(html, /signInButton/);
  assert.match(html, /signOutButton/);
  assert.match(html, /exportAllButton/);
  assert.match(html, /Export all CSV/);
  assert.match(js, /CubeSyncFirestore/);
  assert.match(js, /CubeSyncAuth/);
  assert.match(js, /CubeSyncExport/);
  assert.match(js, /onAuthChange/);
  assert.match(js, /signInWithGoogle/);
  assert.match(js, /listCubeRequests/);
  assert.match(js, /updateCubeRequest/);
  assert.match(js, /buildExportFiles/);
  assert.match(js, /downloadFilesAsZip/);
  assert.match(js, /rpa-view\.html\?id=/);
  assert.doesNotMatch(js, /cubesync\.rpa\.forms/);
});

test("RPA dashboard provides configured WhatsApp Web ERP success and failure updates", () => {
  const html = readFile("rpa-dashboard.html");

  assert.match(html, /id="whatsappErpButton"/);
  assert.match(html, /https:\/\/web\.whatsapp\.com\/send\?phone=6583483117&amp;text=RPA%20robot%20has%20transferred%20data%20to%20ERP%20system%2C%20have%20a%20good%20day!/);
  assert.match(html, />Whatsapp success<\/a>/);
  assert.match(html, /id="whatsappErpFailButton"/);
  assert.match(html, /class="whatsapp-button whatsapp-button-fail"/);
  assert.match(html, /https:\/\/web\.whatsapp\.com\/send\?phone=6583483117&amp;text=RPA%20transfer%20to%20ERP%20failed/);
  assert.match(html, />Whatsapp fail<\/a>/);
  assert.equal((html.match(/target="_blank"/g) || []).length, 2);
  assert.equal((html.match(/rel="noopener noreferrer"/g) || []).length, 2);
});

test("RPA form view renders all shared form fields and result fields", () => {
  const html = readFile("rpa-view.html");
  const js = readFile("rpa-view.js");

  assert.match(html, /cubesync-form-data\.js/);
  assert.match(html, /firestore\.js/);
  assert.match(html, /barcode\.js/);
  assert.match(html, /rpa-view\.js/);
  assert.match(js, /CubeSyncFirestore/);
  assert.match(js, /getCubeRequest/);
  assert.match(js, /FORM_FIELD_LABELS/);
  assert.match(js, /RESULT_FIELD_LABELS/);

  assertIncludesAllFields(js, FORM_FIELDS);
  assertIncludesAllFields(js, RESULT_FIELDS);

  assert.match(js, /CubeSyncBarcode/);
  assert.match(js, /renderBarcodeSvg/);
  assert.doesNotMatch(js, /barcodeSvg/);
  assert.doesNotMatch(js, /barcodeImage/);
  assert.doesNotMatch(js, /data:image/);
});
