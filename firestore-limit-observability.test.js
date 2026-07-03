const assert = require("node:assert/strict");
const test = require("node:test");

const { Observability } = require("./cubesync-form-data");
const { classifyFirestoreError, formatClientError } = Observability;

// These tests pin the client-side detection of Firestore's hard limits — most
// importantly the 1,000-expression security-rule cap, which surfaces as an
// ordinary permission-denied and is otherwise indistinguishable from a genuine
// auth failure (see documentation/firestore-rules-expression-limit-postmortem.md).

test("definitive expression-cap message is classified as a rules cap hit", () => {
  const err = {
    code: "permission-denied",
    message:
      "7 PERMISSION_DENIED: Unable to evaluate the expression as the maximum of 1000 expressions to evaluate has been reached. for 'update' @ L1359",
  };
  const result = classifyFirestoreError(err);
  assert.equal(result.category, "FirestoreRulesExpressionCap");
  assert.equal(result.likelyExpressionCap, true);
  assert.match(result.hint, /1,000 security-rule expressions/);
});

test("multi-field permission-denied from an allowlisted user is flagged as a suspected cap hit", () => {
  const err = { code: "permission-denied", message: "Missing or insufficient permissions." };
  const result = classifyFirestoreError(err, {
    allowlistedUser: true,
    changedFieldCount: 20,
    operation: "updateCubeRequest",
  });
  assert.equal(result.category, "FirestoreRulesExpressionCapSuspected");
  assert.equal(result.likelyExpressionCap, true);
});

test("single-field permission-denied is treated as a plain access denial, not a cap hit", () => {
  const err = { code: "permission-denied", message: "Missing or insufficient permissions." };
  const result = classifyFirestoreError(err, { allowlistedUser: true, changedFieldCount: 1 });
  assert.equal(result.category, "FirestorePermissionDenied");
  assert.equal(result.likelyExpressionCap, false);
});

test("multi-field permission-denied from a non-allowlisted user is NOT a suspected cap hit", () => {
  const err = { code: "permission-denied", message: "Missing or insufficient permissions." };
  const result = classifyFirestoreError(err, { allowlistedUser: false, changedFieldCount: 20 });
  assert.equal(result.category, "FirestorePermissionDenied");
  assert.equal(result.likelyExpressionCap, false);
});

test("document-size limit is classified as too large", () => {
  const err = {
    code: "invalid-argument",
    message: "The value of property is longer than 1048487 bytes.",
  };
  const result = classifyFirestoreError(err);
  assert.equal(result.category, "FirestoreDocumentTooLarge");
  assert.match(result.hint, /1 MiB/);
});

test("resource-exhausted is classified as a quota limit", () => {
  const result = classifyFirestoreError({ code: "resource-exhausted", message: "Quota exceeded." });
  assert.equal(result.category, "FirestoreQuotaExhausted");
});

test("transient backend errors are classified as unavailable", () => {
  assert.equal(
    classifyFirestoreError({ code: "unavailable", message: "The service is currently unavailable." }).category,
    "FirestoreUnavailable"
  );
  assert.equal(
    classifyFirestoreError({ code: "deadline-exceeded", message: "Deadline exceeded" }).category,
    "FirestoreUnavailable"
  );
});

test("a non-Firestore error is not misclassified (returns null)", () => {
  assert.equal(classifyFirestoreError(new Error("Something unrelated broke")), null);
  assert.equal(classifyFirestoreError(null), null);
  assert.equal(classifyFirestoreError(undefined), null);
});

test("formatClientError surfaces a cap hint instead of a raw permission error", () => {
  const capErr = {
    code: "permission-denied",
    message: "Unable to evaluate the expression as the maximum of 1000 expressions to evaluate has been reached.",
  };
  const message = formatClientError(capErr, "fallback");
  assert.match(message, /security-rule size limit/);
  assert.doesNotMatch(message, /1000 expressions/);
});

test("formatClientError still prioritizes offline/network detection", () => {
  assert.match(formatClientError({ message: "Failed to fetch" }), /network connection/);
});

test("formatClientError explains the document-size limit in plain language", () => {
  const message = formatClientError({ code: "invalid-argument", message: "longer than 1048487 bytes" });
  assert.match(message, /too large/);
});
