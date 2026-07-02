const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const test = require("node:test");

const {
  FORM_FIELDS,
  REQUIRED_FORM_FIELDS,
  RESULT_FIELDS,
  defaultFormFieldConfig,
  normalizeFormFieldConfig,
  normalizeCustomFieldDefinition,
  normalizeCustomRequestFields,
  customFieldInputName,
  getCustomFieldFormLabel,
  getCustomRequestFields,
  getEnabledCustomRequestFields,
  customRequestFieldHtml,
  getActiveRequiredFormFields,
  isRequestFieldEnabled,
  isResultFieldEnabled,
  getRequestFieldLabel,
  getResultFieldLabel,
  applyFieldLabels,
  applyCustomRequestFields,
  collectExtraFields,
  normalizeExtraFields,
  validateExtraFields,
  isValidCustomFieldId,
  getExtraFieldValue,
  isRequestFieldFilled,
  formatCustomFieldDisplayValue,
  applyFormFieldConfig,
  syncNativeFormConstraints,
  getRequestFieldStep,
  readFormFieldConfigFromEditor,
  validateCubeRequestPayload,
  validateCubeRequestForm,
  buildCubeRequestFromForm,
  applyFreeTextFlags,
  collectCustomFields,
  FORM_FIELD_CONFIG_STORAGE_KEY,
  FIXED_TEST_ITEM_VALUE,
  getDefaultCastDate
} = require("./cubesync-form-data");

test("slumpMeasured and slumpSpecified are not required fields", () => {
  assert.ok(!REQUIRED_FORM_FIELDS.includes("slumpMeasured"), "slumpMeasured should be optional");
  assert.ok(!REQUIRED_FORM_FIELDS.includes("slumpSpecified"), "slumpSpecified should be optional");
});

test("defaultFormFieldConfig enables every request and result field", () => {
  const config = defaultFormFieldConfig();

  FORM_FIELDS.forEach((field) => {
    assert.equal(config.requestFields[field], true, `${field} should default to enabled`);
  });
  RESULT_FIELDS.forEach((field) => {
    assert.equal(config.resultFields[field], true, `${field} should default to enabled`);
  });
});

test("normalizeFormFieldConfig merges partial overrides and ignores unknown keys", () => {
  const config = normalizeFormFieldConfig({
    requestFields: { quote: false, unknownField: false },
    resultFields: { invoiceNumber: false }
  });

  assert.equal(config.requestFields.quote, false);
  assert.equal(config.requestFields.customerBilling, true);
  assert.equal(config.resultFields.invoiceNumber, false);
  assert.equal(config.resultFields.barcode, true);
  assert.equal(config.requestFields.unknownField, undefined);
});

test("defaultFormFieldConfig exposes empty label override maps", () => {
  const config = defaultFormFieldConfig();
  assert.deepEqual(config.requestLabels, {});
  assert.deepEqual(config.resultLabels, {});
  assert.deepEqual(config.customRequestFields, []);
});

test("normalizeFormFieldConfig keeps custom labels and drops empty/default ones", () => {
  const config = normalizeFormFieldConfig({
    requestLabels: {
      projectErp: "  Job Number  ",
      contact: "Contact",
      quote: "   ",
      unknownField: "Ignored"
    },
    resultLabels: {
      setNo: "Cube No",
      size: 42
    }
  });

  assert.equal(config.requestLabels.projectErp, "Job Number");
  assert.equal(config.requestLabels.contact, undefined, "label equal to default is dropped");
  assert.equal(config.requestLabels.quote, undefined, "blank label is dropped");
  assert.equal(config.requestLabels.unknownField, undefined, "unknown field is ignored");
  assert.equal(config.resultLabels.setNo, "Cube No");
  assert.equal(config.resultLabels.size, undefined, "non-string label is ignored");
});

test("getRequestFieldLabel and getResultFieldLabel fall back to defaults", () => {
  const config = normalizeFormFieldConfig({
    requestLabels: { projectErp: "Job Number" },
    resultLabels: { setNo: "Cube No" }
  });

  assert.equal(getRequestFieldLabel(config, "projectErp"), "Job Number");
  assert.equal(getRequestFieldLabel(config, "contact"), "Contact");
  assert.equal(getResultFieldLabel(config, "setNo"), "Cube No");
  assert.equal(getResultFieldLabel(config, "size"), "Size");
});

test("applyFieldLabels renames form labels and result headers while preserving decoration", () => {
  const dom = new JSDOM(`
    <form id="cubeRequestForm">
      <label class="field-row"><span>Project (ERP) :</span><input type="text" name="projectErp"></label>
      <label class="field-row"><span>Customer (Billing) * :</span><input type="text" name="customerBilling" required></label>
      <label class="field-row"><span>Quote :</span><input type="text" name="quote"></label>
      <table class="results-table">
        <thead>
          <tr>
            <th data-result-field="setNo">Set No</th>
            <th data-result-field="size">Size</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td data-result-field="setNo" data-label="Set No"><input type="number" name="setNo1"></td>
            <td data-result-field="size" data-label="Size"><input type="text" name="size1"></td>
          </tr>
        </tbody>
      </table>
    </form>
  `);
  const form = dom.window.document.getElementById("cubeRequestForm");
  const config = normalizeFormFieldConfig({
    requestLabels: { projectErp: "Job Number", customerBilling: "Bill To" },
    resultLabels: { setNo: "Cube No" }
  });

  applyFieldLabels(form, config);

  assert.equal(form.querySelector('[name="projectErp"]').closest("label").querySelector("span").textContent, "Job Number :");
  assert.equal(form.querySelector('[name="customerBilling"]').closest("label").querySelector("span").textContent, "Bill To * :");
  assert.equal(form.querySelector('[name="quote"]').closest("label").querySelector("span").textContent, "Quote :", "untouched field keeps its label");

  assert.equal(form.querySelector('th[data-result-field="setNo"]').textContent, "Cube No");
  assert.equal(form.querySelector('td[data-result-field="setNo"]').getAttribute("data-label"), "Cube No");
  assert.equal(form.querySelector('th[data-result-field="size"]').textContent, "Size", "untouched column keeps its header");
});

test("getActiveRequiredFormFields excludes disabled required request fields", () => {
  const config = normalizeFormFieldConfig({
    requestFields: {
      customerBilling: false,
      contact: true,
      supplier: true,
      supplierDisplay: true,
      locationRepresented: true,
      dateOfCast: true,
      concreteGrade: true,
      reportGrade: false,
      specimenSize: true,
      slumpMeasured: true,
      slumpSpecified: true,
      personInCharge: true,
      managerInCharge: true
    }
  });

  const active = getActiveRequiredFormFields(config);
  assert.ok(!active.includes("customerBilling"));
  assert.ok(!active.includes("reportGrade"));
  assert.ok(active.includes("contact"));
  assert.equal(active.length, REQUIRED_FORM_FIELDS.length - 2);
});

test("validateCubeRequestPayload skips disabled required fields", () => {
  const payload = {
    contact: "Ada",
    supplier: "MixCo",
    supplierDisplay: "MixCo Display",
    locationRepresented: "Site A",
    dateOfCast: "2026-06-18",
    concreteGrade: "C35",
    reportGrade: "",
    specimenSize: "150 x 150 x 150",
    slumpMeasured: 100,
    slumpSpecified: 90,
    personInCharge: "PIC",
    managerInCharge: "MIC"
  };

  const withoutConfig = validateCubeRequestPayload(payload);
  assert.equal(withoutConfig.valid, false);
  assert.ok(withoutConfig.missingFieldKeys.includes("customerBilling"));
  assert.ok(withoutConfig.missingFieldKeys.includes("reportGrade"));

  const config = normalizeFormFieldConfig({
    requestFields: {
      customerBilling: false,
      reportGrade: false
    }
  });
  const withConfig = validateCubeRequestPayload(payload, config);
  assert.equal(withConfig.valid, true, withConfig.message);
});

test("applyFormFieldConfig hides disabled request fields and result columns", () => {
  const dom = new JSDOM(`
    <form id="cubeRequestForm">
      <label class="field-row"><span>Quote</span><input type="text" name="quote"></label>
      <label class="field-row"><span>Contact</span><input type="text" name="contact" required></label>
      <table class="results-table">
        <thead>
          <tr>
            <th data-result-field="setNo">Set No</th>
            <th data-result-field="invoiceNumber">Invoice Number</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td data-result-field="setNo"><input type="number" name="setNo1"></td>
            <td data-result-field="invoiceNumber"><input type="text" name="invoiceNumber1"></td>
            <td><button type="button">Remove</button></td>
          </tr>
        </tbody>
      </table>
    </form>
  `);
  const form = dom.window.document.getElementById("cubeRequestForm");
  const config = normalizeFormFieldConfig({
    requestFields: { quote: false },
    resultFields: { setNo: true, invoiceNumber: false }
  });

  applyFormFieldConfig(form, config, { activeStep: 1 });

  const quoteRow = form.querySelector('[name="quote"]').closest(".field-row");
  const contactInput = form.querySelector('[name="contact"]');
  const invoiceCell = form.querySelector('[name="invoiceNumber1"]').closest("td");
  const actionCell = form.querySelector("button").closest("td");

  assert.equal(quoteRow.hidden, true);
  assert.equal(form.querySelector('[name="quote"]').disabled, true);
  assert.equal(contactInput.disabled, false);
  assert.equal(contactInput.hasAttribute("required"), true);
  assert.equal(invoiceCell.hidden, true);
  assert.equal(actionCell.hidden, false);
});

test("readFormFieldConfigFromEditor reads dashboard checkbox state", () => {
  const dom = new JSDOM(`
    <form id="fieldConfigForm">
      <input type="checkbox" name="request-quote" checked>
      <input type="checkbox" name="request-contact">
      <input type="checkbox" name="result-invoiceNumber" checked>
      <input type="checkbox" name="result-setNo">
    </form>
  `);
  const form = dom.window.document.getElementById("fieldConfigForm");
  const config = readFormFieldConfigFromEditor(form);

  assert.equal(config.requestFields.quote, true);
  assert.equal(config.requestFields.contact, false);
  assert.equal(config.resultFields.invoiceNumber, true);
  assert.equal(config.resultFields.setNo, false);
});

test("readFormFieldConfigFromEditor reads custom label overrides and ignores blanks", () => {
  const dom = new JSDOM(`
    <form id="fieldConfigForm">
      <input type="checkbox" name="request-projectErp" checked>
      <input type="text" name="request-label-projectErp" value="  Job Number ">
      <input type="checkbox" name="request-contact" checked>
      <input type="text" name="request-label-contact" value="   ">
      <input type="checkbox" name="result-setNo" checked>
      <input type="text" name="result-label-setNo" value="Cube No">
      <input type="checkbox" name="result-size" checked>
      <input type="text" name="result-label-size" value="Size">
    </form>
  `);
  const form = dom.window.document.getElementById("fieldConfigForm");
  const config = readFormFieldConfigFromEditor(form);

  assert.equal(config.requestLabels.projectErp, "Job Number");
  assert.equal(config.requestLabels.contact, undefined, "blank rename is ignored");
  assert.equal(config.resultLabels.setNo, "Cube No");
  assert.equal(config.resultLabels.size, undefined, "default-equal rename is ignored");
});

test("validateCubeRequestForm respects active field config", () => {
  const dom = new JSDOM(`
    <form id="cubeRequestForm">
      <input type="text" name="customerBilling" value="">
      <input type="text" name="contact" value="Ada">
      <input type="text" name="supplier" value="MixCo">
      <input type="text" name="supplierDisplay" value="MixCo Display">
      <input type="text" name="locationRepresented" value="Site A">
      <input type="date" name="dateOfCast" value="2026-06-18">
      <input type="text" name="concreteGrade" value="C35">
      <input type="text" name="reportGrade" value="">
      <input type="text" name="specimenSize" value="150 x 150 x 150">
      <input type="number" name="slumpMeasured" value="100">
      <input type="number" name="slumpSpecified" value="90">
      <input type="text" name="personInCharge" value="PIC">
      <input type="text" name="managerInCharge" value="MIC">
    </form>
  `);
  const form = dom.window.document.getElementById("cubeRequestForm");
  const config = normalizeFormFieldConfig({
    requestFields: { customerBilling: false, reportGrade: false }
  });

  const validation = validateCubeRequestForm(form, config);
  assert.equal(validation.valid, true, validation.message);
});

test("validateCubeRequestForm skips fields whose DOM input has data-config-disabled even when config enables them", () => {
  // Simulates the race: Firestore applied the config to the DOM (setting
  // data-config-disabled) but activeFieldConfig is still the default
  // (all-enabled) because the async .then() hasn't fired yet.
  const dom = new JSDOM(`
    <form id="cubeRequestForm">
      <input type="text" name="customerBilling" value="" data-config-disabled="true" disabled>
      <input type="text" name="contact" value="" data-config-disabled="true" disabled>
      <input type="text" name="personInCharge" value="" data-config-disabled="true" disabled>
      <input type="text" name="managerInCharge" value="" data-config-disabled="true" disabled>
      <input type="text" name="supplier" value="MixCo">
      <input type="text" name="supplierDisplay" value="MixCo Display">
      <input type="text" name="locationRepresented" value="Site A">
      <input type="date" name="dateOfCast" value="2026-06-18">
      <input type="text" name="concreteGrade" value="C35">
      <input type="text" name="reportGrade" value="C35">
      <input type="text" name="specimenSize" value="150 x 150 x 150">
      <input type="number" name="slumpMeasured" value="100">
      <input type="number" name="slumpSpecified" value="90">
    </form>
  `);
  const form = dom.window.document.getElementById("cubeRequestForm");

  // Pass default config (all fields enabled) — this is what activeFieldConfig
  // holds during the race window before the Firestore .then() fires.
  const defaultConfig = normalizeFormFieldConfig({});

  const validation = validateCubeRequestForm(form, defaultConfig);
  assert.equal(validation.valid, true, validation.message);
});

test("FORM_FIELD_CONFIG_STORAGE_KEY is stable for local cache", () => {
  assert.equal(FORM_FIELD_CONFIG_STORAGE_KEY, "cubesync-form-field-config");
});

test("syncNativeFormConstraints removes required from hidden step-1 fields on step 2", () => {
  const dom = new JSDOM(`
    <form id="cubeRequestForm">
      <div class="form-step active" data-step="1">
        <label class="field-row">
          <input type="date" name="dateOfCast" required>
        </label>
        <label class="field-row">
          <input type="text" name="contact" required>
        </label>
      </div>
      <div class="form-step" data-step="2">
        <input type="text" name="specimenRef1">
      </div>
    </form>
  `);
  const form = dom.window.document.getElementById("cubeRequestForm");

  syncNativeFormConstraints(form, { activeStep: 2 });

  assert.equal(form.elements.dateOfCast.hasAttribute("required"), false);
  assert.equal(form.elements.contact.hasAttribute("required"), false);

  syncNativeFormConstraints(form, { activeStep: 1 });

  assert.equal(form.elements.dateOfCast.hasAttribute("required"), true);
  assert.equal(form.elements.contact.hasAttribute("required"), true);
});

test("getRequestFieldStep resolves the parent form step for request fields", () => {
  const dom = new JSDOM(`
    <form id="cubeRequestForm">
      <div class="form-step" data-step="1">
        <input type="date" name="dateOfCast">
      </div>
    </form>
  `);
  const form = dom.window.document.getElementById("cubeRequestForm");
  assert.equal(getRequestFieldStep(form, "dateOfCast"), 1);
  assert.equal(getRequestFieldStep(form, "missingField"), null);
});

test("normalizeCustomRequestFields validates ids, deduplicates, and slugifies labels", () => {
  const fields = normalizeCustomRequestFields([
    { id: "siteRef", label: "Site Reference", type: "text", required: true },
    { id: "siteRef", label: "Duplicate", type: "text" },
    { label: "PO Number", type: "text" },
    { id: "projectErp", label: "Conflicts with built-in" },
    { id: "bad-id", label: "Bad id" }
  ]);

  assert.equal(fields.length, 2);
  assert.equal(fields[0].id, "siteRef");
  assert.equal(fields[0].required, true);
  assert.equal(fields[1].id, "po_number");
  assert.equal(fields[1].label, "PO Number");
  assert.equal(isValidCustomFieldId("siteRef"), true);
  assert.equal(isValidCustomFieldId("projectErp"), false);
});

test("normalizeCustomFieldDefinition rejects corrupt definitions and normalizes safe ones", () => {
  assert.equal(normalizeCustomFieldDefinition(null), null);
  assert.equal(normalizeCustomFieldDefinition("bad"), null);
  assert.equal(normalizeCustomFieldDefinition({ label: "123 Bad" }), null);
  assert.equal(normalizeCustomFieldDefinition({ id: "setNo", label: "Reserved" }), null);
  assert.equal(normalizeCustomRequestFields("not-an-array").length, 0);

  const def = normalizeCustomFieldDefinition({
    label: " Delivery Note ",
    type: "bogus",
    required: 1,
    enabled: true,
    formLabel: "  Public Delivery Note  "
  });

  assert.deepEqual(def, {
    id: "delivery_note",
    label: "Delivery Note",
    type: "text",
    required: true,
    enabled: true,
    formLabel: "Public Delivery Note"
  });
  assert.equal(customFieldInputName(def.id), "custom__delivery_note");
  assert.equal(getCustomFieldFormLabel(def), "Public Delivery Note");
  assert.equal(getCustomFieldFormLabel({ id: "fallbackId", label: "", formLabel: "" }), "fallbackId");
});

test("custom request field helpers expose normalized enabled definitions", () => {
  const config = normalizeFormFieldConfig({
    customRequestFields: [
      { id: "siteRef", label: "Site Reference", type: "text", enabled: true },
      { id: "disabledNote", label: "Disabled Note", type: "textarea", enabled: false }
    ]
  });

  assert.deepEqual(getCustomRequestFields(config).map((def) => def.id), ["siteRef", "disabledNote"]);
  assert.deepEqual(getEnabledCustomRequestFields(config).map((def) => def.id), ["siteRef"]);
  assert.equal(isRequestFieldEnabled(config, "quote"), true);
  assert.equal(isRequestFieldEnabled(normalizeFormFieldConfig({ requestFields: { quote: false } }), "quote"), false);
  assert.equal(isResultFieldEnabled(config, "barcode"), true);
  assert.equal(isResultFieldEnabled(normalizeFormFieldConfig({ resultFields: { barcode: false } }), "barcode"), false);
});

test("customRequestFieldHtml renders number, date, and textarea field variants", () => {
  const numberHtml = customRequestFieldHtml({
    id: "loadCount",
    label: "Load Count",
    type: "number",
    required: true,
    enabled: true,
    formLabel: ""
  });
  assert.match(numberHtml, /type="number"/);
  assert.match(numberHtml, /min="0" step="1"/);
  assert.match(numberHtml, /required/);

  const dateHtml = customRequestFieldHtml({
    id: "pourDate",
    label: "Pour Date",
    type: "date",
    required: false,
    enabled: true,
    formLabel: "Actual Pour Date"
  });
  assert.match(dateHtml, /type="date"/);
  assert.match(dateHtml, /Actual Pour Date :/);

  const textareaHtml = customRequestFieldHtml({
    id: "siteNotes",
    label: "Site Notes",
    type: "textarea",
    required: false,
    enabled: false,
    formLabel: ""
  });
  assert.match(textareaHtml, /<textarea/);
  assert.match(textareaHtml, / hidden/);
  assert.match(textareaHtml, / disabled/);
});

test("applyCustomRequestFields renders enabled custom fields and collects values", () => {
  const dom = new JSDOM(`
    <form id="cubeRequestForm">
      <div id="customRequestFields" class="custom-request-fields"></div>
    </form>
  `);
  const form = dom.window.document.getElementById("cubeRequestForm");
  const config = normalizeFormFieldConfig({
    customRequestFields: [
      { id: "siteRef", label: "Site Reference", type: "text", required: true, enabled: true },
      { id: "approved", label: "Approved", type: "checkbox", enabled: true },
      { id: "hiddenNote", label: "Hidden Note", type: "text", enabled: false }
    ]
  });

  applyCustomRequestFields(form, config, { siteRef: "Block A", approved: true });

  assert.match(form.querySelector("#customRequestFields").innerHTML, /Site Reference \* :/);
  assert.equal(form.querySelector('[data-custom-field-id="siteRef"]').value, "Block A");
  assert.equal(form.querySelector('[data-custom-field-id="approved"]').checked, true);
  assert.equal(form.querySelector('[data-custom-field-row="hiddenNote"]').hidden, true);

  form.querySelector('[data-custom-field-id="siteRef"]').value = "Block B";
  form.querySelector('[data-custom-field-id="approved"]').checked = false;

  assert.deepEqual(collectExtraFields(form), {
    siteRef: "Block B",
    approved: false,
    hiddenNote: ""
  });
});

test("applyCustomRequestFields handles missing containers and typed custom values", () => {
  const noContainerDom = new JSDOM(`<form id="cubeRequestForm"></form>`);
  assert.doesNotThrow(() => {
    applyCustomRequestFields(noContainerDom.window.document.getElementById("cubeRequestForm"), {
      customRequestFields: [{ id: "siteRef", label: "Site Reference", type: "text" }]
    });
  });

  const dom = new JSDOM(`
    <form id="cubeRequestForm">
      <div id="customRequestFields" class="custom-request-fields"></div>
    </form>
  `);
  const form = dom.window.document.getElementById("cubeRequestForm");
  const config = normalizeFormFieldConfig({
    customRequestFields: [
      { id: "loadCount", label: "Load Count", type: "number" },
      { id: "pourDate", label: "Pour Date", type: "date" },
      { id: "siteNotes", label: "Site Notes", type: "textarea" }
    ]
  });

  applyCustomRequestFields(form, config, {
    loadCount: 12,
    pourDate: "2026-06-24T10:00:00Z",
    siteNotes: "  Keep wet  "
  });

  assert.equal(form.querySelector('[data-custom-field-id="loadCount"]').value, "12");
  assert.equal(form.querySelector('[data-custom-field-id="pourDate"]').value, "2026-06-24");
  assert.equal(form.querySelector('[data-custom-field-id="siteNotes"]').value, "  Keep wet  ");

  form.querySelector('[data-custom-field-id="loadCount"]').value = "not-a-number";
  assert.deepEqual(collectExtraFields(form), {
    loadCount: null,
    pourDate: "2026-06-24",
    siteNotes: "Keep wet"
  });
});

test("normalizeExtraFields whitelists configured ids and normalizes values by type", () => {
  const config = normalizeFormFieldConfig({
    customRequestFields: [
      { id: "loadCount", label: "Load Count", type: "number" },
      { id: "approved", label: "Approved", type: "checkbox" },
      { id: "siteNotes", label: "Site Notes", type: "textarea" },
      { id: "pourDate", label: "Pour Date", type: "date" },
      { id: "missing", label: "Missing", type: "text" }
    ]
  });

  assert.deepEqual(normalizeExtraFields({ loadCount: "10" }, null), {});
  assert.deepEqual(normalizeExtraFields(["bad"], config), {});
  assert.deepEqual(normalizeExtraFields({
    loadCount: "10",
    approved: "yes",
    siteNotes: "  Trim me  ",
    pourDate: " 2026-06-24 ",
    unknown: "drop"
  }, config), {
    loadCount: 10,
    approved: true,
    siteNotes: "Trim me",
    pourDate: "2026-06-24"
  });

  assert.equal(getExtraFieldValue({ extraFields: { loadCount: 10 } }, "loadCount"), 10);
  assert.equal(getExtraFieldValue(null, "loadCount"), "");
  assert.equal(getExtraFieldValue({ extraFields: [] }, "loadCount"), "");
});

test("validateExtraFields enforces required custom fields", () => {
  const config = normalizeFormFieldConfig({
    customRequestFields: [
      { id: "siteRef", label: "Site Reference", type: "text", required: true },
      { id: "approved", label: "Approved", type: "checkbox", required: true }
    ]
  });

  const missing = validateExtraFields({ siteRef: "", approved: false }, config);
  assert.equal(missing.valid, false);
  assert.ok(missing.missingFields.includes("Site Reference"));
  assert.ok(missing.missingFields.includes("Approved"));

  const valid = validateExtraFields({ siteRef: "Block A", approved: true }, config);
  assert.equal(valid.valid, true);
});

test("validateExtraFields treats invalid numeric custom fields as missing", () => {
  const config = normalizeFormFieldConfig({
    customRequestFields: [
      { id: "loadCount", label: "Load Count", type: "number", required: true },
      { id: "disabledRequired", label: "Disabled Required", type: "text", required: true, enabled: false }
    ]
  });

  const missing = validateExtraFields({ loadCount: null }, config);
  assert.equal(missing.valid, false);
  assert.deepEqual(missing.missingFieldKeys, ["loadCount"]);

  const valid = validateExtraFields({ loadCount: 3 }, config);
  assert.equal(valid.valid, true);
});

test("buildCubeRequestFromForm includes extraFields map", () => {
  const dom = new JSDOM(`
    <form id="cubeRequestForm" data-template="Glassmorphic">
      ${FORM_FIELDS.map((field) => `<input type="text" name="${field}">`).join("")}
      <div id="customRequestFields" class="custom-request-fields">
        <label class="field-row custom-field-row" data-custom-field-row="siteRef">
          <span>Site Reference :</span>
          <input type="text" name="custom__siteRef" data-custom-field-id="siteRef" data-custom-field-type="text" value="Block A">
        </label>
      </div>
      <table class="results-table"><tbody></tbody></table>
    </form>
  `);
  const form = dom.window.document.getElementById("cubeRequestForm");
  const payload = buildCubeRequestFromForm(form);

  assert.deepEqual(payload.extraFields, { siteRef: "Block A" });
});

test("applyFormFieldConfig applies custom fields through shared config path", () => {
  const dom = new JSDOM(`
    <form id="cubeRequestForm">
      <label class="field-row"><span>Quote :</span><input type="text" name="quote"></label>
      <div id="customRequestFields" class="custom-request-fields"></div>
    </form>
  `);
  const form = dom.window.document.getElementById("cubeRequestForm");
  const config = normalizeFormFieldConfig({
    customRequestFields: [{ id: "siteRef", label: "Site Reference", type: "text" }]
  });

  applyFormFieldConfig(form, config, { extraFieldValues: { siteRef: "Loaded" } });

  assert.equal(form.querySelector('[data-custom-field-id="siteRef"]').value, "Loaded");
});

test("applyFreeTextFlags restores dataset markers from saved customFields metadata", () => {
  const dom = new JSDOM(`
    <form id="cubeRequestForm">
      <input type="text" name="projectErp" value="Typed ERP">
      <input type="text" name="supplier" value="">
    </form>
  `);
  const form = dom.window.document.getElementById("cubeRequestForm");

  applyFreeTextFlags(form, ["projectErp", "supplier"]);

  assert.equal(form.elements.projectErp.dataset.freeTextEntry, "true");
  assert.equal(form.elements.supplier.dataset.freeTextEntry, undefined);

  form.elements.supplier.value = "Typed Supplier";
  form.elements.supplier.dataset.freeTextEntry = "true";

  assert.deepEqual(collectCustomFields(form), ["projectErp", "supplier"]);
});

test("formatCustomFieldDisplayValue renders checkbox values for dashboard detail", () => {
  const def = { id: "approved", label: "Approved", type: "checkbox" };
  assert.equal(formatCustomFieldDisplayValue(def, true), "Yes");
  assert.equal(formatCustomFieldDisplayValue(def, false), "No");
});

test("defaultFormFieldConfig includes showResultsSection: true", () => {
  const config = defaultFormFieldConfig();
  assert.equal(config.showResultsSection, true);
});

test("normalizeFormFieldConfig supports showResultsSection: false", () => {
  const config = normalizeFormFieldConfig({ showResultsSection: false });
  assert.equal(config.showResultsSection, false);
});

test("normalizeFormFieldConfig defaults showResultsSection to true when omitted", () => {
  const config = normalizeFormFieldConfig({});
  assert.equal(config.showResultsSection, true);
});

test("applyFormFieldConfig hides .results-section when showResultsSection is false", () => {
  const dom = new JSDOM(`
    <form id="cubeRequestForm">
      <section class="results-section">
        <table class="results-table"><thead><tr></tr></thead><tbody></tbody></table>
      </section>
    </form>
  `);
  const form = dom.window.document.getElementById("cubeRequestForm");
  const config = normalizeFormFieldConfig({ showResultsSection: false });

  applyFormFieldConfig(form, config, { activeStep: 1 });

  const section = form.querySelector(".results-section");
  assert.equal(section.hidden, true);
});

test("applyFormFieldConfig keeps .results-section visible when showResultsSection is true", () => {
  const dom = new JSDOM(`
    <form id="cubeRequestForm">
      <section class="results-section">
        <table class="results-table"><thead><tr></tr></thead><tbody></tbody></table>
      </section>
    </form>
  `);
  const form = dom.window.document.getElementById("cubeRequestForm");
  const config = normalizeFormFieldConfig({ showResultsSection: true });

  applyFormFieldConfig(form, config, { activeStep: 1 });

  const section = form.querySelector(".results-section");
  assert.equal(section.hidden, false);
});

test("applyFormFieldConfig hides form-step[data-step='2'], its step indicator, and the separator when showResultsSection is false", () => {
  const dom = new JSDOM(`
    <form id="cubeRequestForm">
      <nav class="form-steps">
        <button class="step-indicator active" data-step="1">1. Request Details</button>
        <span class="step-separator">→</span>
        <button class="step-indicator" data-step="2">2. Test Results</button>
      </nav>
      <div class="form-step active" data-step="1"></div>
      <div class="form-step" data-step="2">
        <section class="results-section">
          <table class="results-table"><thead><tr></tr></thead><tbody></tbody></table>
        </section>
      </div>
    </form>
  `);
  const form = dom.window.document.getElementById("cubeRequestForm");
  const config = normalizeFormFieldConfig({ showResultsSection: false });

  applyFormFieldConfig(form, config, { activeStep: 1 });

  const step2 = form.querySelector('.form-step[data-step="2"]');
  const step2Indicator = form.querySelector('.step-indicator[data-step="2"]');
  const separator = form.querySelector('.step-separator');
  assert.equal(step2.hidden, true);
  assert.equal(step2Indicator.hidden, true);
  assert.equal(separator.hidden, true);
});

test("applyFormFieldConfig keeps form-step[data-step='2'], step indicator, and separator visible when showResultsSection is true", () => {
  const dom = new JSDOM(`
    <form id="cubeRequestForm">
      <nav class="form-steps">
        <button class="step-indicator active" data-step="1">1. Request Details</button>
        <span class="step-separator">→</span>
        <button class="step-indicator" data-step="2">2. Test Results</button>
      </nav>
      <div class="form-step active" data-step="1"></div>
      <div class="form-step" data-step="2">
        <section class="results-section">
          <table class="results-table"><thead><tr></tr></thead><tbody></tbody></table>
        </section>
      </div>
    </form>
  `);
  const form = dom.window.document.getElementById("cubeRequestForm");
  const config = normalizeFormFieldConfig({ showResultsSection: true });

  applyFormFieldConfig(form, config, { activeStep: 1 });

  const step2 = form.querySelector('.form-step[data-step="2"]');
  const step2Indicator = form.querySelector('.step-indicator[data-step="2"]');
  const separator = form.querySelector('.step-separator');
  assert.equal(step2.hidden, false);
  assert.equal(step2Indicator.hidden, false);
  assert.equal(separator.hidden, false);
});

test("readFormFieldConfigFromEditor reads showResultsSection checkbox", () => {
  const dom = new JSDOM(`
    <form id="fieldConfigForm">
      <input type="checkbox" name="showResultsSection" checked>
    </form>
  `);
  const form = dom.window.document.getElementById("fieldConfigForm");
  const config = readFormFieldConfigFromEditor(form);
  assert.equal(config.showResultsSection, true);

  form.querySelector('[name="showResultsSection"]').checked = false;
  const configOff = readFormFieldConfigFromEditor(form);
  assert.equal(configOff.showResultsSection, false);
});

test("readFormFieldConfigFromEditor reads valid custom field rows and ignores invalid ones", () => {
  const dom = new JSDOM(`
    <form id="fieldConfigForm">
      <div class="custom-field-editor">
        <input name="custom-field-id-1" value="siteRef">
        <input name="custom-field-label-1" value=" Site Reference ">
        <select name="custom-field-type-1"><option value="textarea" selected>Textarea</option></select>
        <input type="checkbox" name="custom-field-required-1" checked>
        <input type="checkbox" name="custom-field-enabled-1">
        <input name="custom-field-form-label-1" value=" Public Site Reference ">
      </div>
      <div class="custom-field-editor">
        <input name="custom-field-id-2" value="projectErp">
        <input name="custom-field-label-2" value="Reserved">
      </div>
      <div class="custom-field-editor">
        <input name="custom-field-label-3" value="PO Number">
      </div>
    </form>
  `);
  const form = dom.window.document.getElementById("fieldConfigForm");
  const config = readFormFieldConfigFromEditor(form);

  assert.deepEqual(config.customRequestFields, [
    {
      id: "siteRef",
      label: "Site Reference",
      type: "textarea",
      required: true,
      enabled: false,
      formLabel: "Public Site Reference"
    },
    {
      id: "po_number",
      label: "PO Number",
      type: "text",
      required: false,
      enabled: true,
      formLabel: ""
    }
  ]);
});

test("isRequestFieldFilled distinguishes optional text blanks from entered slump values", () => {
  assert.equal(isRequestFieldFilled("slumpMeasured", ""), false);
  assert.equal(isRequestFieldFilled("slumpMeasured", null), false);
  assert.equal(isRequestFieldFilled("slumpMeasured", 0), true);
  assert.equal(isRequestFieldFilled("slumpMeasured", "N/A"), true);
  assert.equal(isRequestFieldFilled("customerBilling", "  Acme  "), true);
  assert.equal(isRequestFieldFilled("customerBilling", "   "), false);
});

// ------------------------------------------------------------
// Test Item lock — BS EN 12390-3: 2019
//
// CubeSync issues one class of test certificate only: compressive
// strength of hardened concrete cubes to BS EN 12390-3: 2019.
// Allowing the customer to type a different value would produce
// certificates with the wrong standard cited, which is a compliance
// risk.  The field must always carry exactly this value and must
// not be editable by the user.
// ------------------------------------------------------------

test("FIXED_TEST_ITEM_VALUE is the canonical BS EN 12390-3: 2019 test description", () => {
  assert.equal(
    FIXED_TEST_ITEM_VALUE,
    "Civil - Hardened Concrete - Compressive strength of cube - BS EN 12390-3: 2019"
  );
});

test("applyFormFieldConfig pre-fills testItem with FIXED_TEST_ITEM_VALUE", () => {
  const dom = new JSDOM(`
    <form id="cubeRequestForm">
      <label class="field-row"><input type="text" name="testItem"></label>
    </form>
  `);
  const form = dom.window.document.getElementById("cubeRequestForm");

  applyFormFieldConfig(form, null, { activeStep: 1 });

  assert.equal(form.elements.testItem.value, FIXED_TEST_ITEM_VALUE);
});

test("applyFormFieldConfig makes testItem readonly", () => {
  const dom = new JSDOM(`
    <form id="cubeRequestForm">
      <label class="field-row"><input type="text" name="testItem"></label>
    </form>
  `);
  const form = dom.window.document.getElementById("cubeRequestForm");

  applyFormFieldConfig(form, null, { activeStep: 1 });

  assert.equal(form.elements.testItem.readOnly, true);
});

test("applyFormFieldConfig overrides any existing testItem value with the fixed value", () => {
  const dom = new JSDOM(`
    <form id="cubeRequestForm">
      <label class="field-row"><input type="text" name="testItem" value="Wrong standard"></label>
    </form>
  `);
  const form = dom.window.document.getElementById("cubeRequestForm");

  applyFormFieldConfig(form, null, { activeStep: 1 });

  assert.equal(form.elements.testItem.value, FIXED_TEST_ITEM_VALUE);
});

test("buildCubeRequestFromForm captures the locked testItem value", () => {
  const dom = new JSDOM(`
    <form id="cubeRequestForm" data-template="Glassmorphic">
      ${FORM_FIELDS.map((field) => `<input type="text" name="${field}">`).join("")}
      <div id="customRequestFields" class="custom-request-fields"></div>
      <table class="results-table"><tbody></tbody></table>
    </form>
  `);
  const form = dom.window.document.getElementById("cubeRequestForm");

  applyFormFieldConfig(form, null, { activeStep: 1 });

  const payload = buildCubeRequestFromForm(form);
  assert.equal(payload.testItem, FIXED_TEST_ITEM_VALUE);
});

// ---------------------------------------------------------------------------
// After-6pm next-day date rule (Singapore Standard Time, UTC+8)
//
// Concrete test requests submitted after 6pm are for the next day's work:
// the lab will not process them until the following morning, so the cast
// date defaults to tomorrow to avoid staff having to correct it manually.
// ---------------------------------------------------------------------------

test("getDefaultCastDate returns today before 6pm SGT", () => {
  // 09:59 UTC = 17:59 SGT (one minute before cutoff)
  const result = getDefaultCastDate(new Date("2026-06-24T09:59:00Z"));
  assert.equal(result, "2026-06-24");
});

test("getDefaultCastDate returns tomorrow at exactly 6pm SGT", () => {
  // 10:00 UTC = 18:00 SGT (cutoff)
  const result = getDefaultCastDate(new Date("2026-06-24T10:00:00Z"));
  assert.equal(result, "2026-06-25");
});

test("getDefaultCastDate returns tomorrow after 6pm SGT", () => {
  // 14:30 UTC = 22:30 SGT
  const result = getDefaultCastDate(new Date("2026-06-24T14:30:00Z"));
  assert.equal(result, "2026-06-25");
});

test("getDefaultCastDate returns today at midnight SGT (new day)", () => {
  // 16:00 UTC = 00:00 SGT next day
  const result = getDefaultCastDate(new Date("2026-06-24T16:00:00Z"));
  assert.equal(result, "2026-06-25");
});

test("getDefaultCastDate rolls month boundary correctly", () => {
  // 2026-06-30 at 22:00 SGT = 2026-06-30T14:00Z → tomorrow is 2026-07-01
  const result = getDefaultCastDate(new Date("2026-06-30T14:00:00Z"));
  assert.equal(result, "2026-07-01");
});
