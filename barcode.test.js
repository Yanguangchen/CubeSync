const assert = require("node:assert/strict");
const test = require("node:test");

const {
  encodeCode128B,
  renderBarcodeSvg,
  sanitizeBarcodeText
} = require("./barcode");

test("encodes Code 128-B with a valid checksum", () => {
  const encoded = encodeCode128B("ABC");

  assert.deepEqual(encoded.codes, [104, 33, 34, 35, 1, 106]);
  assert.equal(encoded.checksum, 1);
  assert.equal(encoded.pattern.startsWith("211214111323"), true);
  assert.equal(encoded.pattern.endsWith("2331112"), true);
});

test("trims barcode input and preserves internal spacing", () => {
  assert.equal(sanitizeBarcodeText("  cube 001  "), "cube 001");
});

test("rejects characters outside Code 128-B printable ASCII", () => {
  assert.throws(
    () => encodeCode128B("CUBE\n001"),
    /printable ASCII/
  );
});

test("renders an accessible SVG barcode with visible text", () => {
  const svg = renderBarcodeSvg("CUBE-001", {
    height: 48,
    moduleWidth: 2,
    includeText: true
  });

  assert.match(svg, /^<svg /);
  assert.match(svg, /role="img"/);
  assert.match(svg, /aria-label="Barcode for CUBE-001"/);
  assert.match(svg, /width="\d+\.\d+"/);
  assert.match(svg, /height="48"/);
  assert.match(svg, /<rect /);
  assert.match(svg, />CUBE-001<\/text>/);
});

test("escapes special characters in SVG output", () => {
  const svg = renderBarcodeSvg("CUBE & 001", { includeText: true });
  assert.match(svg, /aria-label="Barcode for CUBE &amp; 001"/);
  assert.match(svg, />CUBE &amp; 001<\/text>/);
});

test("renderBarcodeSvg handles missing options object", () => {
  const svg = renderBarcodeSvg("ABC");
  assert.match(svg, /height="54"/);
  assert.match(svg, /width="127\.60"/);
});

test("encodeCode128B handles empty input", () => {
  const encoded = encodeCode128B("");
  assert.equal(encoded.input, "");
  assert.deepEqual(encoded.codes, []);
  assert.equal(encoded.pattern, "");
});
