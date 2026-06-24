const assert = require("node:assert/strict");
const test = require("node:test");

const {
  dashboardEditToCubeRequest,
  getCubeRequestFormValue
} = require("./cubesync-form-data");

function formDataFrom(entries) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    fd.append(key, value);
  }
  return fd;
}

test("dashboardEditToCubeRequest maps primary field names", () => {
  const request = dashboardEditToCubeRequest(formDataFrom({
    cubeJobNumber: "CJ-001",
    status: "Approved",
    customerBilling: "Billing Co",
    projectNameOnReport: "Tower A",
    concreteGrade: "C35/45",
    template: "Custom",
    locationRepresented: "Level 5",
    additionalInformation: "Notes here",
    dateOfCast: "2026-06-25",
    projectErp: "PRJ-9",
    testItem: "BS EN 12390-3 : 2019",
    supplier: "Supplier X",
    slumpMeasured: "120",
    specimenSize: "150 x 150 x 150",
    slumpSpecified: "100",
    contact: "Jane",
    quote: "Q-77",
    supplierDisplay: "Supplier X Ltd",
    reportGrade: "C40/50",
    personInCharge: "PIC",
    managerInCharge: "Manager"
  }));

  assert.equal(request.reportNo, "CJ-001");
  assert.equal(request.cubeJobNumber, "CJ-001");
  assert.equal(request.status, "Approved");
  assert.equal(request.client, "Billing Co");
  assert.equal(request.project, "Tower A");
  assert.equal(request.concreteGrade, "C35/45");
  assert.equal(request.template, "Custom");
  assert.equal(request.locationRepresented, "Level 5");
  assert.equal(request.additionalInformation, "Notes here");
  assert.equal(request.internalDate, "2026-06-25");
  assert.equal(request.dateOfCast, "2026-06-25");
  assert.equal(request.dateTimeSampled, "2026-06-25");
  assert.equal(request.projectErp, "PRJ-9");
  assert.equal(request.projectCode, "PRJ-9");
  assert.equal(request.method, "BS EN 12390-3 : 2019");
  assert.equal(request.testItem, "BS EN 12390-3 : 2019");
  assert.equal(request.supplier, "Supplier X");
  assert.equal(request.supplierDisplay, "Supplier X Ltd");
  assert.equal(request.slumpMeasured, 120);
  assert.equal(request.slumpSpecified, 100);
  assert.equal(request.specimenSize, "150 x 150 x 150");
  assert.equal(request.reportGrade, "C40/50");
  assert.equal(request.personInCharge, "PIC");
  assert.equal(request.managerInCharge, "Manager");
  assert.equal(request.enableManualCubeJobNumber, false);
});

test("dashboardEditToCubeRequest applies status and template defaults", () => {
  const request = dashboardEditToCubeRequest(formDataFrom({ cubeJobNumber: "CJ-2" }));
  assert.equal(request.status, "Draft");
  assert.equal(request.template, "Original");
});

test("dashboardEditToCubeRequest resolves fallback field names", () => {
  // Only the alternate (dashboard-side) names are present.
  const request = dashboardEditToCubeRequest(formDataFrom({
    reportNo: "RN-5",
    client: "Acme",
    project: "Bridge",
    grade: "C30/37",
    location: "Pier 3",
    notes: "From notes field",
    internalDate: "2026-01-02",
    projectCode: "PC-1",
    method: "Compressive",
    dateTimeSampled: "2026-01-02"
  }));

  assert.equal(request.reportNo, "RN-5");
  assert.equal(request.cubeJobNumber, "RN-5");
  assert.equal(request.client, "Acme");
  assert.equal(request.customerBilling, "Acme");
  assert.equal(request.project, "Bridge");
  assert.equal(request.concreteGrade, "C30/37");
  assert.equal(request.reportGrade, "C30/37");
  assert.equal(request.locationRepresented, "Pier 3");
  assert.equal(request.additionalInformation, "From notes field");
  assert.equal(request.internalDate, "2026-01-02");
  assert.equal(request.dateOfCast, "2026-01-02");
  assert.equal(request.projectCode, "PC-1");
  assert.equal(request.projectErp, "PC-1");
  assert.equal(request.method, "Compressive");
  assert.equal(request.testItem, "Compressive");
});

test("dashboardEditToCubeRequest skips blank candidates in the fallback chain", () => {
  // Empty primary value should fall through to the populated alternate.
  const request = dashboardEditToCubeRequest(formDataFrom({
    cubeJobNumber: "   ",
    reportNo: "RN-9",
    customerBilling: "",
    client: "Fallback Client"
  }));

  assert.equal(request.cubeJobNumber, "RN-9");
  assert.equal(request.reportNo, "RN-9");
  assert.equal(request.client, "Fallback Client");
});

test("dashboardEditToCubeRequest flags enableManualCubeJobNumber when present", () => {
  const checked = dashboardEditToCubeRequest(formDataFrom({ enableManualCubeJobNumber: "on" }));
  assert.equal(checked.enableManualCubeJobNumber, true);

  // Present but empty string still counts as present (checkbox in the form).
  const present = dashboardEditToCubeRequest(formDataFrom({ enableManualCubeJobNumber: "" }));
  assert.equal(present.enableManualCubeJobNumber, true);
});

test("dashboardEditToCubeRequest coerces blank slump values to null", () => {
  const request = dashboardEditToCubeRequest(formDataFrom({
    slumpMeasured: "",
    slumpSpecified: "abc"
  }));
  assert.equal(request.slumpMeasured, null);
  assert.equal(request.slumpSpecified, null);
});

test("getCubeRequestFormValue returns empty string for falsy data", () => {
  assert.equal(getCubeRequestFormValue(null, "cubeJobNumber"), "");
  assert.equal(getCubeRequestFormValue(undefined, "cubeJobNumber"), "");
});

test("getCubeRequestFormValue returns a boolean for checkbox fields", () => {
  assert.equal(getCubeRequestFormValue({ enableManualCubeJobNumber: true }, "enableManualCubeJobNumber"), true);
  assert.equal(getCubeRequestFormValue({}, "enableManualCubeJobNumber"), false);
});

test("getCubeRequestFormValue follows fallback fields", () => {
  assert.equal(getCubeRequestFormValue({ reportNo: "RN-1" }, "cubeJobNumber"), "RN-1");
  assert.equal(getCubeRequestFormValue({ client: "Acme" }, "customerBilling"), "Acme");
});

test("getCubeRequestFormValue truncates dateOfCast to YYYY-MM-DD", () => {
  assert.equal(
    getCubeRequestFormValue({ dateOfCast: "2026-06-25T10:30:00.000Z" }, "dateOfCast"),
    "2026-06-25"
  );
  // Falls back to dateTimeSampled and still truncates.
  assert.equal(
    getCubeRequestFormValue({ dateTimeSampled: "2026-06-25T00:00:00Z" }, "dateOfCast"),
    "2026-06-25"
  );
});

test("getCubeRequestFormValue returns empty string when no fallback matches", () => {
  assert.equal(getCubeRequestFormValue({ unrelated: "x" }, "cubeJobNumber"), "");
});
