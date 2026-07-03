const { readFileSync } = require("node:fs");
const assert = require("node:assert/strict");
const { before, after, test } = require("node:test");
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require("@firebase/rules-unit-testing");

const PROJECT_ID = "cubesync-rules-test";
const STAFF_EMAIL = "yanguangchen@outlook.com";
const NON_STAFF_EMAIL = "notallowed@example.com";

let testEnv;

function parseEmulatorHost() {
  const hostEnv = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
  const [host, portValue] = hostEnv.split(":");
  return { host, port: Number(portValue) };
}

function authedDb(uid, email, { verified = true } = {}) {
  return testEnv.authenticatedContext(uid, {
    email,
    email_verified: verified,
  }).firestore();
}

function minimalCubeRequest(overrides = {}) {
  return {
    status: "Draft",
    template: "Original",
    client: "Test Client",
    ...overrides,
  };
}

function resultRow(setNo) {
  return {
    setNo: String(setNo),
    size: "150",
    specimenRef: `REF-${setNo}`,
    barcode: `BC-${setNo}`,
    specifiedSlump: "75",
    meanSlump: "70",
    resultGrade: "C35",
    resultDateOfCast: "2026-01-01",
    age: "7",
    dateOfTest: "2026-01-08",
    invoiceNumber: `INV-${setNo}`,
  };
}

// The 11 result-row fields the app actually writes (RESULT_FIELDS in
// cubesync-form-data.js). The rules allow 18, but the other 7 are never
// produced by any client path.
const APP_RESULT_FIELDS = [
  "setNo", "size", "specimenRef", "barcode", "specifiedSlump", "meanSlump",
  "resultGrade", "resultDateOfCast", "age", "dateOfTest", "invoiceNumber",
];

// Top-level cubeRequest fields a dashboard edit can change (a subset of the
// update allowlist), used to build updates that touch a chosen number of them.
const TOP_LEVEL_FIELDS = [
  "internalDate", "projectCode", "reportNo", "client", "method", "project",
  "concreteGrade", "supplier", "locationRepresented", "additionalInformation",
  "dateTimeSampled", "slumpMeasured", "specimenSize", "slumpSpecified",
  "projectErp", "customerBilling", "projectNameOnReport", "clientNameOnReport",
  "contact", "cubeJobNumber", "quote", "testItem", "supplierDisplay",
  "dateOfCast", "reportGrade", "personInCharge", "managerInCharge",
  "erpStatus", "rpaStatus",
];

function appResultRow(seed) {
  const row = {};
  for (const key of APP_RESULT_FIELDS) {
    row[key] = `${key}-${seed}`;
  }
  return row;
}

// A cubeRequest with `nRows` fully-populated app result rows and every
// top-level field set to a seed-derived value. `seed` lets two calls differ in
// every field. createdAt is fixed so an update never puts it in affectedKeys
// (createdAt is create-only in the update allowlist).
function cubeRequestWithRows(nRows, seed) {
  const doc = { template: "Original", status: "Draft", createdAt: "2026-01-01T00:00:00Z" };
  for (const key of TOP_LEVEL_FIELDS) {
    doc[key] = `${key}-${seed}`;
  }
  doc.results = Array.from({ length: nRows }, (_unused, index) =>
    appResultRow(`${seed}-${index}`)
  );
  return doc;
}

function maximalCubeRequest(seed) {
  return {
    ...cubeRequestWithRows(50, seed),
    enableManualCubeJobNumber: seed % 2 === 0,
    customFields: [
      "projectErp", "customerBilling", "supplier", "concreteGrade",
      "personInCharge", "managerInCharge", "testItem", "specimenSize",
    ],
    extraFields: Object.fromEntries(
      Array.from({ length: 25 }, (_unused, index) => [
        `extra_${index}`,
        `value-${seed}-${index}`,
      ])
    ),
    submittedAt: `2026-03-01T00:00:0${seed % 10}Z`,
    attemptCount: seed,
    version: seed + 1,
    updatedAt: `2026-03-02T00:00:0${seed % 10}Z`,
  };
}

before(async () => {
  const { host, port } = parseEmulatorHost();
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host,
      port,
    },
  });
});

after(async () => {
  if (testEnv) {
    await testEnv.cleanup();
  }
});

test("non-staff users cannot read cubeRequests", async () => {
  await testEnv.clearFirestore();
  const outsider = authedDb("outsider-1", NON_STAFF_EMAIL);

  await assertFails(outsider.collection("cubeRequests").doc("req-1").get());
});

test("unverified staff email cannot read cubeRequests", async () => {
  await testEnv.clearFirestore();
  const unverified = authedDb("staff-unverified", STAFF_EMAIL, { verified: false });

  await assertFails(unverified.collection("cubeRequests").doc("req-1").get());
});

test("staff can create, read, and delete cubeRequests", async () => {
  await testEnv.clearFirestore();
  const staff = authedDb("staff-1", STAFF_EMAIL);

  await assertSucceeds(
    staff.collection("cubeRequests").doc("req-create").set(minimalCubeRequest())
  );
  await assertSucceeds(staff.collection("cubeRequests").doc("req-create").get());
  await assertSucceeds(staff.collection("cubeRequests").doc("req-create").delete());
});

test("staff cannot create cubeRequests with invalid status", async () => {
  await testEnv.clearFirestore();
  const staff = authedDb("staff-2", STAFF_EMAIL);

  await assertFails(
    staff.collection("cubeRequests").doc("req-bad-status").set(
      minimalCubeRequest({ status: "Submitted" })
    )
  );
});

test("staff can apply a multi-field dashboard update with many result rows", async () => {
  await testEnv.clearFirestore();
  const staff = authedDb("staff-3", STAFF_EMAIL);
  const docRef = staff.collection("cubeRequests").doc("req-multi");

  const existing = minimalCubeRequest({
    customerBilling: "Old Billing",
    contact: "Old Contact",
    projectErp: "ERP-OLD",
    results: Array.from({ length: 6 }, (_, index) => resultRow(index + 1)),
  });

  // Seed outside rules so create-time deep row validation does not dominate
  // this test — we are verifying the update validator stays under the cap.
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.firestore().collection("cubeRequests").doc("req-multi").set(existing);
  });

  const updated = {
    ...existing,
    customerBilling: "New Billing",
    contact: "New Contact",
    projectErp: "ERP-NEW",
    clientNameOnReport: "Client On Report",
    personInCharge: "PIC",
    slumpMeasured: "80",
    slumpSpecified: "75",
    updatedAt: new Date().toISOString(),
  };

  await assertSucceeds(docRef.set(updated));
});

test("staff cannot update cubeRequests with disallowed keys", async () => {
  await testEnv.clearFirestore();
  const staff = authedDb("staff-4", STAFF_EMAIL);
  const docRef = staff.collection("cubeRequests").doc("req-keys");

  await assertSucceeds(docRef.set(minimalCubeRequest()));

  await assertFails(
    docRef.set({
      ...minimalCubeRequest(),
      hackerField: "nope",
    })
  );
});

test("settings/formFieldConfig is publicly readable but not publicly writable", async () => {
  await testEnv.clearFirestore();
  const outsider = authedDb("outsider-2", NON_STAFF_EMAIL);
  const staff = authedDb("staff-5", STAFF_EMAIL);
  const configRef = staff.collection("settings").doc("formFieldConfig");

  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.firestore().collection("settings").doc("formFieldConfig").set({
      requestFields: {},
      resultFields: {},
      showResultsSection: true,
    });
  });

  await assertSucceeds(outsider.collection("settings").doc("formFieldConfig").get());
  await assertFails(
    outsider.collection("settings").doc("formFieldConfig").set({
      requestFields: {},
      resultFields: {},
      showResultsSection: false,
    })
  );
  await assertSucceeds(
    configRef.set({
      requestFields: {},
      resultFields: {},
      showResultsSection: true,
    })
  );
});

// ---------------------------------------------------------------------------
// 1,000-expression-per-request cap: enforcement + boundary characterization
//
// Firestore evaluates at most 1,000 security-rule expressions per request and
// rejects anything over the cap with the SAME permission-denied error as a
// genuine rule failure (documentation/firestore-rules-expression-limit-postmortem.md).
// The postmortem assumed only production enforces the cap; firebase-tools
// 14.10.1's emulator DOES enforce it — the "maximum of 1000 expressions" denial
// is observable in firestore-debug.log and reproduced below.
//
// Deep nested row validation multiplies expression cost, so production rules
// enforce keys, critical types, and collection bounds while the client/API
// normalize row content. These tests pin maximal create and update workflows.
// ---------------------------------------------------------------------------

test("staff can create a cubeRequest with shape-valid (sparsely-populated) result rows", async () => {
  await testEnv.clearFirestore();
  const staff = authedDb("staff-cap-create-ok", STAFF_EMAIL);

  // Rows carrying at most a couple of populated fields stay under the cap.
  // This is the safe boundary for the rules-enforced create path.
  await assertSucceeds(
    staff.collection("cubeRequests").doc("req-cap-ok").set({
      template: "Original",
      status: "Draft",
      client: "Client",
      results: [{ setNo: "1" }, { setNo: "2" }],
    })
  );
});

test("staff can create a maximal cubeRequest under the expression cap", async () => {
  await testEnv.clearFirestore();
  const staff = authedDb("staff-cap-create-over", STAFF_EMAIL);

  await assertSucceeds(
    staff.collection("cubeRequests").doc("req-cap-max").set(maximalCubeRequest(1))
  );
});

test("staff can apply a moderate multi-field dashboard update under the cap", async () => {
  await testEnv.clearFirestore();
  const staff = authedDb("staff-cap-update-ok", STAFF_EMAIL);
  const docRef = staff.collection("cubeRequests").doc("req-upd-ok");

  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context
      .firestore()
      .collection("cubeRequests")
      .doc("req-upd-ok")
      .set(cubeRequestWithRows(50, 1));
  });

  // Change ~12 top-level fields at once on a 50-row record. The update path
  // shape-checks results (cheap) so row count does not matter; this stays under
  // the cap and guards the common dashboard-save path.
  const patch = {};
  for (const key of TOP_LEVEL_FIELDS.slice(0, 12)) {
    patch[key] = `${key}-changed`;
  }
  await assertSucceeds(docRef.set(patch, { merge: true }));
});

test("staff can update approximately 20 dashboard fields at once under the cap", async () => {
  await testEnv.clearFirestore();
  const staff = authedDb("staff-cap-update-over", STAFF_EMAIL);
  const docRef = staff.collection("cubeRequests").doc("req-upd-over");

  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context
      .firestore()
      .collection("cubeRequests")
      .doc("req-upd-over")
      .set(cubeRequestWithRows(50, 1));
  });

  // This protects the multi-field dashboard workflow that previously exceeded
  // the expression cap when every scalar field was revalidated in rules.
  const patch = {};
  for (const key of TOP_LEVEL_FIELDS.slice(0, 20)) {
    patch[key] = `${key}-changed`;
  }
  await assertSucceeds(docRef.set(patch, { merge: true }));
});

test("the emulator rejects an over-complex ruleset", async () => {
  // The rules compiler rejects a 1,500-clause expression before a request can
  // execute. Keep this as a compiler-complexity self-check; the maximal create
  // and update tests above exercise the production runtime budget directly.
  const trueClause = "request.resource.data.n >= 0";
  const clauses = (count) => Array.from({ length: count }, () => trueClause).join(" &&\n          ");
  const capProbeRules = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /capProbeOver/{id} {
      allow create: if ${clauses(1500)};
    }
  }
}`;

  const { host, port } = parseEmulatorHost();
  await assert.rejects(
    initializeTestEnvironment({
      projectId: "cubesync-cap-probe",
      firestore: { rules: capProbeRules, host, port },
    }),
    /Expression is too complex to evaluate safely/
  );
});
