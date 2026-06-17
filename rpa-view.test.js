const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const { FORM_FIELDS, RESULT_FIELDS } = require("./cubesync-form-data");

test("RPA dashboard opens Firestore cube request documents", () => {
  const html = fs.readFileSync("rpa-dashboard.html", "utf8");
  const js = fs.readFileSync("rpa-dashboard.js", "utf8");

  assert.match(html, /cubesync-form-data\.js/);
  assert.match(html, /firestore\.js/);
  assert.match(html, /authGate/);
  assert.match(html, /signInButton/);
  assert.match(html, /signOutButton/);
  assert.match(js, /CubeSyncFirestore/);
  assert.match(js, /CubeSyncAuth/);
  assert.match(js, /onAuthChange/);
  assert.match(js, /signInWithGoogle/);
  assert.match(js, /listCubeRequests/);
  assert.match(js, /updateCubeRequest/);
  assert.match(js, /rpa-view\.html\?id=/);
  assert.doesNotMatch(js, /cubesync\.rpa\.forms/);
});

test("RPA form view renders all shared form fields and result fields", () => {
  const html = fs.readFileSync("rpa-view.html", "utf8");
  const js = fs.readFileSync("rpa-view.js", "utf8");

  assert.match(html, /cubesync-form-data\.js/);
  assert.match(html, /firestore\.js/);
  assert.match(html, /barcode\.js/);
  assert.match(html, /rpa-view\.js/);
  assert.match(js, /CubeSyncFirestore/);
  assert.match(js, /getCubeRequest/);
  assert.match(js, /FORM_FIELD_LABELS/);
  assert.match(js, /RESULT_FIELD_LABELS/);

  for (const field of FORM_FIELDS) {
    assert.match(js, new RegExp(`${field}:`));
  }

  for (const field of RESULT_FIELDS) {
    assert.match(js, new RegExp(`${field}:`));
  }

  assert.match(js, /CubeSyncBarcode/);
  assert.match(js, /renderBarcodeSvg/);
  assert.doesNotMatch(js, /barcodeSvg/);
  assert.doesNotMatch(js, /barcodeImage/);
  assert.doesNotMatch(js, /data:image/);
});
