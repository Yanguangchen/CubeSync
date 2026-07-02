const { readFileSync } = require("node:fs");
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
