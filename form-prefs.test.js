const assert = require("node:assert/strict");
const test = require("node:test");
const { JSDOM } = require("jsdom");

const formData = require("./cubesync-form-data");
const prefs = require("./cubesync-form-prefs");

function cookieDocument() {
  const jar = new Map();
  return {
    get cookie() {
      return Array.from(jar.entries())
        .map(([name, value]) => `${name}=${value}`)
        .join("; ");
    },
    set cookie(assignment) {
      const segments = String(assignment).split(";").map((part) => part.trim());
      const pair = segments[0] || "";
      const eq = pair.indexOf("=");
      if (eq < 0) {
        return;
      }
      const name = pair.slice(0, eq);
      const value = pair.slice(eq + 1);
      const maxAgeAttr = segments.find((part) => part.toLowerCase().startsWith("max-age="));
      const maxAge = maxAgeAttr ? Number(maxAgeAttr.slice("max-age=".length)) : 1;
      if (!Number.isFinite(maxAge) || maxAge <= 0) {
        jar.delete(name);
        return;
      }
      jar.set(name, value);
    }
  };
}

function formDom() {
  return new JSDOM(`
    <form id="cubeRequestForm" data-template="Original">
      <input type="text" name="projectErp">
      <input type="text" name="customerBilling">
      <input type="text" name="projectNameOnReport">
      <input type="text" name="clientNameOnReport">
      <input type="text" name="contact">
      <input type="checkbox" name="enableManualCubeJobNumber">
      <input type="text" name="cubeJobNumber">
      <input type="text" name="quote">
      <input type="text" name="testItem">
      <input type="text" name="supplier">
      <input type="text" name="supplierDisplay">
      <input type="text" name="locationRepresented">
      <input type="text" name="additionalInformation">
      <input type="date" name="dateOfCast">
      <input type="text" name="concreteGrade">
      <input type="text" name="reportGrade">
      <input type="text" name="specimenSize">
      <input type="text" name="slumpMeasured">
      <input type="text" name="slumpSpecified">
      <input type="text" name="personInCharge">
      <input type="text" name="managerInCharge">
      <div id="customRequestFields">
        <input type="text" name="custom__siteRef" data-custom-field-id="siteRef" data-custom-field-type="text">
      </div>
      <table class="results-table">
        <tbody>
          <tr>
            <td><input name="setNo1" value="1"></td>
            <td><input name="specimenRef1" value="REF-SHOULD-NOT-SAVE"></td>
            <td><input name="barcode1" value="BC-SHOULD-NOT-SAVE"></td>
          </tr>
        </tbody>
      </table>
    </form>
  `).window.document.querySelector("form");
}

function fillRequest(form) {
  form.elements.projectErp.value = "PRJ-9";
  form.elements.customerBilling.value = "Billing Co";
  form.elements.contact.value = "Alex";
  form.elements.enableManualCubeJobNumber.checked = true;
  form.elements.cubeJobNumber.value = "CJ-999";
  form.elements.testItem.value = "Wrong test item";
  form.elements.supplier.value = "MixCo";
  form.elements.supplierDisplay.value = "MixCo Display";
  form.elements.locationRepresented.value = "Bay 4";
  form.elements.dateOfCast.value = "2026-01-01";
  form.elements.concreteGrade.value = "C40/50";
  form.elements.reportGrade.value = "C40/50";
  form.elements.specimenSize.value = "150 x 150 x 150";
  form.elements.personInCharge.value = "PIC";
  form.elements.managerInCharge.value = "Manager";
  form.querySelector("[data-custom-field-id='siteRef']").value = "Site-7";
}

test("collectFormPreferences keeps request fields and drops results plus per-job fields", () => {
  const form = formDom();
  fillRequest(form);
  form.elements.supplier.dataset.freeTextEntry = "true";

  const saved = prefs.collectFormPreferences(form, formData);

  assert.equal(saved.v, 1);
  assert.equal(saved.fields.customerBilling, "Billing Co");
  assert.equal(saved.fields.supplier, "MixCo");
  assert.equal(saved.fields.specimenSize, "150 x 150 x 150");
  assert.equal(saved.extraFields.siteRef, "Site-7");
  assert.deepEqual(saved.customFields, ["supplier"]);
  assert.equal("dateOfCast" in saved.fields, false);
  assert.equal("cubeJobNumber" in saved.fields, false);
  assert.equal("enableManualCubeJobNumber" in saved.fields, false);
  assert.equal("testItem" in saved.fields, false);
  assert.equal("results" in saved, false);
  assert.equal("results" in saved.fields, false);
});

test("applyFormPreferences fills request fields without touching the results table", () => {
  const form = formDom();
  const saved = {
    v: 1,
    fields: {
      customerBilling: "Remembered Client",
      contact: "Pat",
      dateOfCast: "2020-01-01",
      cubeJobNumber: "SHOULD-NOT-APPLY",
      testItem: "SHOULD-NOT-APPLY"
    },
    extraFields: { siteRef: "Gate-2" },
    customFields: ["customerBilling"]
  };

  assert.equal(prefs.applyFormPreferences(form, saved, formData), true);
  assert.equal(form.elements.customerBilling.value, "Remembered Client");
  assert.equal(form.elements.contact.value, "Pat");
  assert.equal(form.elements.dateOfCast.value, "");
  assert.equal(form.elements.cubeJobNumber.value, "");
  assert.equal(form.elements.testItem.value, "");
  assert.equal(form.querySelector("[data-custom-field-id='siteRef']").value, "Gate-2");
  assert.equal(form.elements.specimenRef1.value, "REF-SHOULD-NOT-SAVE");
  assert.equal(form.elements.customerBilling.dataset.freeTextEntry, "true");
});

test("applyFormPreferences with onlyEmpty leaves typed values in place", () => {
  const form = formDom();
  form.elements.customerBilling.value = "Already typed";

  prefs.applyFormPreferences(form, {
    v: 1,
    fields: { customerBilling: "From cookie", contact: "From cookie" },
    extraFields: {},
    customFields: []
  }, formData, { onlyEmpty: true });

  assert.equal(form.elements.customerBilling.value, "Already typed");
  assert.equal(form.elements.contact.value, "From cookie");
});

test("cookie round-trip restores the same request details", () => {
  const form = formDom();
  fillRequest(form);
  const doc = cookieDocument();

  const saved = prefs.saveFormPreferences(form, formData, doc);
  assert.equal(saved.ok, true);
  assert.equal(prefs.hasStoredPreferences(doc), true);

  const blank = formDom();
  assert.equal(prefs.loadFormPreferences(blank, formData, doc), true);
  assert.equal(blank.elements.customerBilling.value, "Billing Co");
  assert.equal(blank.elements.supplier.value, "MixCo");
  assert.equal(blank.elements.dateOfCast.value, "");
  assert.equal(blank.elements.cubeJobNumber.value, "");
  assert.equal(blank.elements.specimenRef1.value, "REF-SHOULD-NOT-SAVE");
});

test("clearFormPreferenceCookie removes stored details", () => {
  const form = formDom();
  fillRequest(form);
  const doc = cookieDocument();

  prefs.saveFormPreferences(form, formData, doc);
  assert.equal(prefs.clearFormPreferenceCookie(doc), true);
  assert.equal(prefs.hasStoredPreferences(doc), false);
  assert.equal(prefs.readFormPreferenceCookie(doc), null);
});

test("malformed cookies and unknown versions are ignored", () => {
  const doc = cookieDocument();
  doc.cookie = `${prefs.COOKIE_NAME}=%7Bnot-json; Path=/; Max-Age=100`;
  assert.equal(prefs.readFormPreferenceCookie(doc), null);

  const written = prefs.writeFormPreferenceCookie(doc, { v: 99, fields: { customerBilling: "Nope" } });
  assert.equal(written.ok, false);
});

test("disabled and readonly fields are not overwritten from cookies", () => {
  const form = formDom();
  form.elements.customerBilling.disabled = true;
  form.elements.supplier.readOnly = true;
  form.elements.contact.dataset.configDisabled = "true";

  prefs.applyFormPreferences(form, {
    v: 1,
    fields: {
      customerBilling: "Skip me",
      supplier: "Skip me too",
      contact: "Also skip",
      personInCharge: "Keep me"
    },
    extraFields: {},
    customFields: []
  }, formData);

  assert.equal(form.elements.customerBilling.value, "");
  assert.equal(form.elements.supplier.value, "");
  assert.equal(form.elements.contact.value, "");
  assert.equal(form.elements.personInCharge.value, "Keep me");
});

test("oversized extra fields are dropped so the cookie still saves", () => {
  const form = formDom();
  fillRequest(form);
  form.querySelector("[data-custom-field-id='siteRef']").value = "X".repeat(prefs.MAX_COOKIE_BYTES);
  const doc = cookieDocument();

  const saved = prefs.saveFormPreferences(form, formData, doc);
  assert.equal(saved.ok, true);
  const stored = prefs.readFormPreferenceCookie(doc);
  assert.equal(stored.fields.customerBilling, "Billing Co");
  assert.deepEqual(stored.extraFields, {});
});
