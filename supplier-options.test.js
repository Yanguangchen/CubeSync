const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const ALLOWED_SUPPLIERS = [
  "PAN-UNITED CONCRETE PTE LTD",
  "G & W READY-MIX PTE LTD",
  "SINMIX PTE LTD",
  "ALLIANCE CONCRETE SINGAPORE PTE LTD",
  "ISLAND CONCRETE PTE LTD",
  "ENGRO CORPORATION LIMITED",
  "EMINENT STAR READY-MIX PTE LTD",
  "YTL CONCRETE (S) PTE LTD",
  "TOP MIX CONCRETE (S) PTE LTD",
  "DRILL GEMS ENGINEERING PTE LTD",
  "PREMIUM CONCRETE PTE LTD",
  "OTHER"
];

test("supplier dropdown options are restricted to the approved concrete suppliers", () => {
  const lines = fs.readFileSync("dropdown-options/supplier.txt", "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  assert.deepEqual(lines, ALLOWED_SUPPLIERS);
});
