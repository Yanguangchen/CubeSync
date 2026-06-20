const assert = require("node:assert/strict");
const fs = require("node:fs");
const { JSDOM } = require("jsdom");
const test = require("node:test");

const {
  collectCustomFields,
  deriveFreeTextDropdownFields,
  mergeFreeTextDropdownFields,
  resolveFreeTextDropdownFields
} = require("./cubesync-form-data");

const dashboardJs = fs.readFileSync("dashboard.js", "utf8");
const dashboardHtml = fs.readFileSync("dashboard.html", "utf8");
const formDataJs = fs.readFileSync("cubesync-form-data.js", "utf8");
const barcodeJs = fs.readFileSync("barcode.js", "utf8");

function fakeControl(value, dataset = {}) {
  return {
    value,
    checked: Boolean(value),
    dataset: { ...dataset }
  };
}

function fakeForm(fields) {
  return {
    elements: Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [key, fakeControl(value.value, value.dataset)])
    )
  };
}

// ---------------------------------------------------------------------------
// Regression: dashboard must not treat valid selections as free text
// ---------------------------------------------------------------------------

test("regression: stale capture metadata does not flag a value that matches an option", () => {
  const optionsByField = {
    projectErp: ["ERP-001", "ERP-002"],
    supplier: ["ABC Concrete"]
  };
  const data = {
    projectErp: "ERP-001",
    supplier: "ABC Concrete"
  };
  const staleMetadata = ["projectErp", "supplier"];

  assert.deepEqual(
    resolveFreeTextDropdownFields(data, optionsByField, staleMetadata),
    [],
    "dashboard must ignore metadata when the stored value is a known option"
  );
});

test("regression: merging metadata with derive re-introduces false positives", () => {
  const optionsByField = { supplier: ["ABC Concrete"] };
  const data = { supplier: "ABC Concrete" };
  const staleMetadata = ["supplier"];

  const derived = deriveFreeTextDropdownFields(data, optionsByField);
  const merged = mergeFreeTextDropdownFields(staleMetadata, derived);
  const resolved = resolveFreeTextDropdownFields(data, optionsByField, staleMetadata);

  assert.deepEqual(derived, [], "value-based derive alone is correct");
  assert.deepEqual(merged, ["supplier"], "union merge is the old buggy pattern");
  assert.deepEqual(resolved, [], "resolve must not use union merge semantics");
});

test("regression: novel free text is flagged even without capture metadata", () => {
  const optionsByField = { supplier: ["ABC Concrete", "XYZ Ready Mix"] };
  const data = { supplier: "One-off Supplier Name" };

  assert.deepEqual(
    resolveFreeTextDropdownFields(data, optionsByField, []),
    ["supplier"]
  );
});

test("regression: browser-local options must not suppress free-text flags", () => {
  // Simulates the bug where dashboard merged localStorage into the reference
  // list: "Brand New Supplier" existed only in one staff browser's cache.
  const fileOptionsOnly = { supplier: ["ABC Concrete"] };
  const filePlusLocalStorage = {
    supplier: ["ABC Concrete", "Brand New Supplier"]
  };
  const data = { supplier: "Brand New Supplier" };

  assert.deepEqual(
    resolveFreeTextDropdownFields(data, fileOptionsOnly, []),
    ["supplier"],
    "canonical file list must flag values absent from deployed options"
  );

  assert.deepEqual(
    resolveFreeTextDropdownFields(data, filePlusLocalStorage, []),
    [],
    "this documents why localStorage must not be merged into dashboard reference lists"
  );
});

test("regression: capture metadata and dashboard resolution use different rules", () => {
  const form = fakeForm({
    projectErp: { value: "Option A", dataset: { freeTextEntry: "true" } },
    supplier: { value: "Typed Supplier", dataset: { freeTextEntry: "true" } },
    customerBilling: { value: "Option B", dataset: {} }
  });

  assert.deepEqual(
    collectCustomFields(form),
    ["projectErp", "supplier"],
    "submit path records any typed dropdown field"
  );

  const optionsByField = {
    projectErp: ["Option A", "Option B"],
    supplier: ["ABC Concrete"]
  };
  const payload = {
    projectErp: "Option A",
    supplier: "Typed Supplier",
    customerBilling: "Option B"
  };

  assert.deepEqual(
    resolveFreeTextDropdownFields(payload, optionsByField, collectCustomFields(form)),
    ["supplier"],
    "dashboard path flags only values missing from the canonical option list"
  );
});

test("regression: metadata fallback applies only when option list is unavailable", () => {
  const data = { testItem: "Custom Test", supplier: "ABC Concrete" };
  const metadata = ["testItem", "supplier"];
  const optionsByField = { supplier: ["ABC Concrete"] };

  assert.deepEqual(
    resolveFreeTextDropdownFields(data, optionsByField, metadata),
    ["testItem"],
    "supplier matches option -> not flagged; testItem has no list -> metadata fallback"
  );
});

test("regression: resolve normalizes whitespace and matches legacy aliases", () => {
  const optionsByField = { projectErp: ["ERP-001"] };

  assert.deepEqual(
    resolveFreeTextDropdownFields({ projectErp: "  ERP-001  " }, optionsByField, ["projectErp"]),
    []
  );

  assert.deepEqual(
    resolveFreeTextDropdownFields({ projectCode: "Typed Project" }, optionsByField, []),
    ["projectErp"]
  );

  assert.deepEqual(
    resolveFreeTextDropdownFields({ supplier: "" }, { supplier: ["ABC Concrete"] }, ["supplier"]),
    [],
    "empty values are never flagged when an option list exists"
  );

  assert.deepEqual(
    resolveFreeTextDropdownFields({ testItem: "Cube Test" }, {}, ["testItem"]),
    ["testItem"],
    "metadata fallback still applies when no option list is loaded"
  );
});

// ---------------------------------------------------------------------------
// Contract: dashboard wiring must stay on resolve + file-only option lists
// ---------------------------------------------------------------------------

test("contract: dashboard loadForms resolves flags with resolveFreeTextDropdownFields", () => {
  assert.match(dashboardJs, /resolveFreeTextDropdownFields/);
  assert.match(
    dashboardJs,
    /form\.customFields\s*=\s*helper\.resolveFreeTextDropdownFields\(/,
    "loadForms must call resolveFreeTextDropdownFields directly"
  );
  assert.doesNotMatch(
    dashboardJs,
    /mergeFreeTextDropdownFields\([\s\S]*?loadForms|loadForms[\s\S]*?mergeFreeTextDropdownFields/,
    "loadForms must not union-merge metadata with derive (causes false positives)"
  );
});

test("contract: dashboard option loader uses deployed files only, not localStorage", () => {
  const loaderBlock = dashboardJs.match(
    /async function loadDropdownOptionSets\(\)[\s\S]*?state\.dropdownOptions = options;\s*\}/
  );

  assert.ok(loaderBlock, "loadDropdownOptionSets must exist");
  assert.doesNotMatch(
    loaderBlock[0],
    /localStorage\.getItem/,
    "review reference lists must not read browser-local suggestion caches"
  );
  assert.match(loaderBlock[0], /fetchFn\(encodeURI\(url\)\)/);
});

test("contract: cubesync-form-data exports resolveFreeTextDropdownFields", () => {
  assert.match(formDataJs, /function resolveFreeTextDropdownFields\(/);
  assert.match(formDataJs, /resolveFreeTextDropdownFields,/);
});

// ---------------------------------------------------------------------------
// Integration: dashboard end-to-end with mocked option files
// ---------------------------------------------------------------------------

test("integration: dashboard flags novel supplier when only canonical files are loaded", async () => {
  const dom = new JSDOM(dashboardHtml, {
    runScripts: "dangerously",
    url: "http://localhost/"
  });
  const { window } = dom;

  window.localStorage.setItem("savedSuppliers", JSON.stringify(["Brand New Supplier"]));

  window.fetch = async (url) => {
    const key = decodeURI(String(url));
    if (key === "dropdown-options/supplier.txt") {
      return { ok: true, text: async () => "ABC Concrete\nXYZ Ready Mix" };
    }
    return { ok: false, text: async () => "" };
  };

  window.CubeSyncAuth = {
    onAuthChange: (cb) => cb({ email: "test@rakmat.com.sg" }),
    isAllowedUser: () => true
  };

  window.CubeSyncFirestore = {
    listCubeRequests: async () => [
      {
        id: "novel-supplier",
        reportNo: "NOVEL-001",
        supplier: "Brand New Supplier",
        status: "Ready",
        template: "Original",
        updatedAt: "2026-06-20",
        customFields: []
      },
      {
        id: "known-supplier",
        reportNo: "KNOWN-001",
        supplier: "ABC Concrete",
        status: "Ready",
        template: "Original",
        updatedAt: "2026-06-20",
        customFields: ["supplier"]
      }
    ]
  };

  [barcodeJs, formDataJs, dashboardJs].forEach((js) => {
    const script = window.document.createElement("script");
    script.textContent = js;
    window.document.head.appendChild(script);
  });

  window.document.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 80));

  const list = window.document.getElementById("formList");
  const novelRow = list.querySelector("tr[data-id='novel-supplier']");
  const knownRow = list.querySelector("tr[data-id='known-supplier']");

  assert.ok(
    novelRow.classList.contains("has-custom-fields"),
    "novel value must be flagged even when absent from this browser's localStorage-only cache"
  );
  assert.ok(
    !knownRow.classList.contains("has-custom-fields"),
    "known option must not be flagged even when stale metadata claims it was typed"
  );
});
