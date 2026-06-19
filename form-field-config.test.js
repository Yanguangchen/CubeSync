const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const test = require("node:test");

const {
  FORM_FIELDS,
  REQUIRED_FORM_FIELDS,
  RESULT_FIELDS,
  defaultFormFieldConfig,
  normalizeFormFieldConfig,
  getActiveRequiredFormFields,
  applyFormFieldConfig,
  syncNativeFormConstraints,
  getRequestFieldStep,
  readFormFieldConfigFromEditor,
  validateCubeRequestPayload,
  validateCubeRequestForm,
  FORM_FIELD_CONFIG_STORAGE_KEY
} = require("./cubesync-form-data");

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
