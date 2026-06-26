const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildEditHistoryChanges,
  changesRequireReason,
  EDIT_HISTORY_SENSITIVE_FIELDS
} = require("./cubesync-form-data");

test("buildEditHistoryChanges logs a scalar field change with its display label", () => {
  const changes = buildEditHistoryChanges(
    { customerBilling: "Acme" },
    { customerBilling: "Acme Pte Ltd" }
  );

  assert.equal(changes.length, 1);
  assert.deepEqual(changes[0], {
    field: "customerBilling",
    displayName: "Customer (Billing)",
    previousValue: "Acme",
    newValue: "Acme Pte Ltd",
    dataType: "text"
  });
});

test("buildEditHistoryChanges fills an empty previous value for a newly set field", () => {
  const changes = buildEditHistoryChanges({}, { quote: "Q-100" });

  assert.equal(changes.length, 1);
  assert.equal(changes[0].previousValue, "");
  assert.equal(changes[0].newValue, "Q-100");
});

test("buildEditHistoryChanges skips legacy alias keys so an edit is not double-logged", () => {
  const changes = buildEditHistoryChanges(
    { customerBilling: "Acme", client: "Acme" },
    { customerBilling: "Acme Pte Ltd", client: "Acme Pte Ltd" }
  );

  const fields = changes.map((change) => change.field);
  assert.deepEqual(fields, ["customerBilling"]);
});

test("buildEditHistoryChanges ignores technical fields (custom/extra/workflow)", () => {
  const changes = buildEditHistoryChanges(
    {},
    { extraFields: { foo: "bar" }, erpStatus: "Pending", rpaStatus: "Disabled" }
  );

  assert.equal(changes.length, 0);
});

test("buildEditHistoryChanges formats checkbox values as Yes/No", () => {
  const changes = buildEditHistoryChanges(
    { enableManualCubeJobNumber: true },
    { enableManualCubeJobNumber: false }
  );

  assert.equal(changes.length, 1);
  assert.equal(changes[0].previousValue, "Yes");
  assert.equal(changes[0].newValue, "No");
  assert.equal(changes[0].dataType, "boolean");
});

test("buildEditHistoryChanges diffs result rows into Set N · Field entries", () => {
  const changes = buildEditHistoryChanges(
    { results: [{ barcode: "CUBE 10291" }] },
    { results: [{ barcode: "CUBE 10219" }] }
  );

  assert.equal(changes.length, 1);
  assert.equal(changes[0].field, "barcode");
  assert.equal(changes[0].displayName, "Set 1 · Barcode");
  assert.equal(changes[0].previousValue, "CUBE 10291");
  assert.equal(changes[0].newValue, "CUBE 10219");
});

test("buildEditHistoryChanges returns an empty list when nothing meaningful changed", () => {
  assert.deepEqual(buildEditHistoryChanges({ quote: "Q" }, {}), []);
});

test("changesRequireReason is true when a sensitive field changed", () => {
  const sensitive = buildEditHistoryChanges(
    { results: [{ barcode: "A" }] },
    { results: [{ barcode: "B" }] }
  );
  assert.equal(changesRequireReason(sensitive), true);

  const benign = buildEditHistoryChanges({ quote: "A" }, { quote: "B" });
  assert.equal(changesRequireReason(benign), false);
});

test("EDIT_HISTORY_SENSITIVE_FIELDS covers the documented sensitive fields", () => {
  ["customerBilling", "projectNameOnReport", "concreteGrade", "cubeJobNumber",
   "barcode", "dateOfTest", "invoiceNumber"].forEach((field) => {
    assert.ok(EDIT_HISTORY_SENSITIVE_FIELDS.has(field), `${field} should be sensitive`);
  });
});
