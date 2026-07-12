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

// ---------------------------------------------------------------------------
// WorkGrid / cross-collection fixtures.
//
// STAFF_EMAIL (yanguangchen@outlook.com) is ALSO a hard-coded WorkGrid master,
// so a context authed with it passes isAdmin() with no users/{uid} profile.
// gavidarshini18@gmail.com is the hard-coded worker-onboarding email — the only
// address isConfiguredAllowedEmail() accepts for a self-created worker profile.
// ---------------------------------------------------------------------------
const WORKGRID_ADMIN_EMAIL = STAFF_EMAIL;
const ONBOARDING_WORKER_EMAIL = "gavidarshini18@gmail.com";
const WORKER_EMAIL = "worker@example.com";

function unauthedDb() {
  return testEnv.unauthenticatedContext().firestore();
}

async function seedDoc(collectionPath, docId, data) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.firestore().collection(collectionPath).doc(docId).set(data);
  });
}

// A full, schema-valid users/{uid} profile (matches isValidUser).
function userProfile(overrides = {}) {
  return {
    name: "Test User",
    email: WORKER_EMAIL,
    teamId: "",
    role: "worker",
    status: "active",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

// A full, schema-valid bookings/{id} document (matches isValidBooking).
function validBooking(uid, overrides = {}) {
  return {
    ownerUserId: uid,
    projectName: "Test Project",
    userName: "Test User",
    contact: "91234567",
    details: "Job details",
    address: "1 Test Street",
    startTime: "2026-01-01T08:00:00Z",
    endTime: "2026-01-01T10:00:00Z",
    status: "active",
    collisionStatus: "none",
    createdBy: uid,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

// A full, schema-valid appConfig/access document (matches isValidAccessConfig).
function validAccessConfig(overrides = {}) {
  return {
    masterEmails: ["master@example.com"],
    updatedAt: "2026-01-01T00:00:00Z",
    updatedBy: "admin",
    ...overrides,
  };
}

// A full, schema-valid teams/{id} document (matches isValidTeam).
function validTeam(overrides = {}) {
  return {
    name: "Team A",
    status: "active",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

// A full, schema-valid notificationSubscriptions/{id} document.
function validSubscription(uid, overrides = {}) {
  return {
    token: "fcm-token-abc",
    userId: uid,
    userName: "Test User",
    userEmail: WORKER_EMAIL,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

// A full, schema-valid collisions/{id} document (matches isValidCollision).
function validCollision(uid, overrides = {}) {
  return {
    affectedBookingId: "bk-1",
    teamId: "team-1",
    issue: "Bookings overlap",
    status: "open",
    loggedBy: uid,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
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

// ---------------------------------------------------------------------------
// cubeRequests — authorization + validation negatives
//
// The suite above proves valid staff writes stay under the expression cap.
// These pin the security boundary the other direction: non-staff cannot write,
// and the retained enum/bound/shape checks still REJECT bad input (so a future
// edit that loosens them fails loudly instead of passing silently).
// ---------------------------------------------------------------------------
test("non-staff users cannot create, update, or delete cubeRequests", async () => {
  await testEnv.clearFirestore();
  const outsider = authedDb("outsider-write", NON_STAFF_EMAIL);

  await seedDoc("cubeRequests", "req-outsider", minimalCubeRequest());

  await assertFails(
    outsider.collection("cubeRequests").doc("req-new").set(minimalCubeRequest())
  );
  await assertFails(
    outsider.collection("cubeRequests").doc("req-outsider").set({ status: "Ready" }, { merge: true })
  );
  await assertFails(outsider.collection("cubeRequests").doc("req-outsider").delete());
});

test("staff cannot create a cubeRequest with an invalid template", async () => {
  await testEnv.clearFirestore();
  const staff = authedDb("staff-tpl", STAFF_EMAIL);

  await assertFails(
    staff.collection("cubeRequests").doc("req-tpl").set(
      minimalCubeRequest({ template: "Neon" })
    )
  );
});

test("staff cannot create a cubeRequest with out-of-range version or attemptCount", async () => {
  await testEnv.clearFirestore();
  const staff = authedDb("staff-bounds", STAFF_EMAIL);

  await assertFails(
    staff.collection("cubeRequests").doc("req-ver").set(
      minimalCubeRequest({ version: 0 })
    )
  );
  await assertFails(
    staff.collection("cubeRequests").doc("req-att").set(
      minimalCubeRequest({ attemptCount: 20000 })
    )
  );
});

test("staff cannot create a cubeRequest whose results is not a list", async () => {
  await testEnv.clearFirestore();
  const staff = authedDb("staff-results", STAFF_EMAIL);

  await assertFails(
    staff.collection("cubeRequests").doc("req-bad-results").set(
      minimalCubeRequest({ results: { "0": { setNo: "1" } } })
    )
  );
});

// ---------------------------------------------------------------------------
// cubeRequests/{id}/editHistory — append-only changelog
// ---------------------------------------------------------------------------
test("editHistory entries are append-only: staff create allowed, update and delete denied", async () => {
  await testEnv.clearFirestore();
  const staff = authedDb("staff-history", STAFF_EMAIL);
  const entry = { changes: ["client"], createdAt: "2026-01-01T00:00:00Z" };

  await assertSucceeds(
    staff.collection("cubeRequests").doc("req-h").collection("editHistory").doc("s1").set(entry)
  );

  await seedDoc("cubeRequests/req-h/editHistory", "s2", entry);
  await assertFails(
    staff.collection("cubeRequests").doc("req-h").collection("editHistory").doc("s2")
      .set({ reason: "tamper" }, { merge: true })
  );
  await assertFails(
    staff.collection("cubeRequests").doc("req-h").collection("editHistory").doc("s2").delete()
  );
});

test("staff can read editHistory across requests via a collection-group query; others cannot", async () => {
  await testEnv.clearFirestore();
  const entry = { changes: ["client"], createdAt: "2026-01-01T00:00:00Z" };
  await seedDoc("cubeRequests/req-cg1/editHistory", "s1", entry);
  await seedDoc("cubeRequests/req-cg2/editHistory", "s2", entry);

  const staff = authedDb("staff-cg", STAFF_EMAIL);
  const snapshot = await assertSucceeds(staff.collectionGroup("editHistory").get());
  assert.equal(snapshot.size, 2);

  const outsider = authedDb("outsider-cg", NON_STAFF_EMAIL);
  await assertFails(outsider.collectionGroup("editHistory").get());
  await assertFails(unauthedDb().collectionGroup("editHistory").get());
});

// ---------------------------------------------------------------------------
// settings/dropdownOptions — public read, staff-only write, no delete
// ---------------------------------------------------------------------------
test("dropdownOptions is publicly readable, staff-writable, and non-deletable", async () => {
  await testEnv.clearFirestore();
  await seedDoc("settings", "dropdownOptions", { supplier: ["A", "B"] });

  const staff = authedDb("staff-dd", STAFF_EMAIL);
  const outsider = authedDb("outsider-dd", NON_STAFF_EMAIL);

  await assertSucceeds(unauthedDb().collection("settings").doc("dropdownOptions").get());
  await assertFails(
    outsider.collection("settings").doc("dropdownOptions").set({ supplier: ["X"] })
  );
  await assertSucceeds(
    staff.collection("settings").doc("dropdownOptions").set({ supplier: ["A", "B", "C"] })
  );
  await assertFails(staff.collection("settings").doc("dropdownOptions").delete());
});

// ---------------------------------------------------------------------------
// users/{uid} — self-service is name/phone only; role/status/teamId are locked
// (self-privilege-escalation surface). PII is owner-or-admin readable.
// ---------------------------------------------------------------------------
test("a worker can edit their own name but cannot escalate their role or status", async () => {
  await testEnv.clearFirestore();
  const uid = "worker-self";
  await seedDoc("users", uid, userProfile());
  const db = authedDb(uid, WORKER_EMAIL);

  await assertSucceeds(
    db.collection("users").doc(uid).set(userProfile({ name: "Renamed", updatedAt: "2026-02-01T00:00:00Z" }))
  );
  await assertFails(
    db.collection("users").doc(uid).set(userProfile({ role: "admin", updatedAt: "2026-02-01T00:00:00Z" }))
  );
  await assertFails(
    db.collection("users").doc(uid).set(userProfile({ status: "inactive", updatedAt: "2026-02-01T00:00:00Z" }))
  );
  await assertFails(
    db.collection("users").doc(uid).set(userProfile({ teamId: "team-x", updatedAt: "2026-02-01T00:00:00Z" }))
  );
});

test("an admin can change another user's role", async () => {
  await testEnv.clearFirestore();
  const targetUid = "worker-target";
  await seedDoc("users", targetUid, userProfile());
  const admin = authedDb("admin-master", WORKGRID_ADMIN_EMAIL);

  await assertSucceeds(
    admin.collection("users").doc(targetUid).set(
      userProfile({ role: "engineer", updatedAt: "2026-02-01T00:00:00Z" })
    )
  );
});

test("a worker cannot read another user's profile (PII), but the owner and admins can", async () => {
  await testEnv.clearFirestore();
  const ownerUid = "pii-owner";
  const otherUid = "pii-other";
  await seedDoc("users", ownerUid, userProfile());
  await seedDoc("users", otherUid, userProfile({ email: "other@example.com" }));

  const other = authedDb(otherUid, "other@example.com");
  const owner = authedDb(ownerUid, WORKER_EMAIL);
  const admin = authedDb("admin-reader", WORKGRID_ADMIN_EMAIL);

  await assertFails(other.collection("users").doc(ownerUid).get());
  await assertSucceeds(owner.collection("users").doc(ownerUid).get());
  await assertSucceeds(admin.collection("users").doc(ownerUid).get());
});

test("self-created profiles must be an active worker on the onboarding allowlist", async () => {
  await testEnv.clearFirestore();

  // Off-allowlist email cannot self-create even a valid worker profile.
  const stranger = authedDb("stranger-uid", WORKER_EMAIL);
  await assertFails(
    stranger.collection("users").doc("stranger-uid").set(userProfile())
  );

  // Allowlisted email can self-create a worker profile...
  const onboardUid = "onboard-uid";
  const onboarder = authedDb(onboardUid, ONBOARDING_WORKER_EMAIL);
  await assertSucceeds(
    onboarder.collection("users").doc(onboardUid).set(
      userProfile({ email: ONBOARDING_WORKER_EMAIL })
    )
  );

  // ...but cannot self-anoint as admin.
  await testEnv.clearFirestore();
  await assertFails(
    authedDb(onboardUid, ONBOARDING_WORKER_EMAIL).collection("users").doc(onboardUid).set(
      userProfile({ email: ONBOARDING_WORKER_EMAIL, role: "admin" })
    )
  );
});

// ---------------------------------------------------------------------------
// bookings/{id} — shared active-user access; createdBy/createdAt are immutable
// ---------------------------------------------------------------------------
test("an active worker can create a booking, but createdBy must be their own uid", async () => {
  await testEnv.clearFirestore();
  const uid = "booker";
  await seedDoc("users", uid, userProfile());
  const db = authedDb(uid, WORKER_EMAIL);

  await assertSucceeds(
    db.collection("bookings").doc("bk-ok").set(validBooking(uid))
  );
  await assertFails(
    db.collection("bookings").doc("bk-spoof").set(validBooking(uid, { createdBy: "someone-else" }))
  );
});

test("a user without an active profile cannot create bookings", async () => {
  await testEnv.clearFirestore();
  const uid = "no-profile";
  const db = authedDb(uid, WORKER_EMAIL); // no users/{uid} doc seeded

  await assertFails(db.collection("bookings").doc("bk-np").set(validBooking(uid)));
});

test("booking updates cannot change immutable createdBy/createdAt and reject unknown keys", async () => {
  await testEnv.clearFirestore();
  const uid = "editor";
  await seedDoc("users", uid, userProfile());
  await seedDoc("bookings", "bk-edit", validBooking(uid));
  const db = authedDb(uid, WORKER_EMAIL);
  const ref = db.collection("bookings").doc("bk-edit");

  // A normal field/enum change is allowed.
  await assertSucceeds(ref.set({ status: "completed", updatedAt: "2026-02-01T00:00:00Z" }, { merge: true }));

  await assertFails(ref.set({ createdBy: "someone-else" }, { merge: true }));
  await assertFails(ref.set({ createdAt: "2027-01-01T00:00:00Z" }, { merge: true }));
  await assertFails(ref.set({ hackerField: "nope" }, { merge: true }));
});

// ---------------------------------------------------------------------------
// counters/reportNumbers + reportNumbers — monotonic sequence integrity.
// This is the compliance-critical registry: report numbers must never repeat.
// ---------------------------------------------------------------------------
test("reportNumbers counter starts at 1 and only ever advances by exactly one", async () => {
  await testEnv.clearFirestore();
  const uid = "counter-user";
  await seedDoc("users", uid, userProfile());
  const db = authedDb(uid, WORKER_EMAIL);
  const ref = db.collection("counters").doc("reportNumbers");

  // Create must seed value 1.
  await assertFails(ref.set({ value: 2, updatedAt: "2026-01-01T00:00:00Z", updatedBy: uid }));
  await assertSucceeds(ref.set({ value: 1, updatedAt: "2026-01-01T00:00:00Z", updatedBy: uid }));

  // Update must be exactly +1: skipping ahead or holding steady is rejected.
  await assertFails(ref.set({ value: 3, updatedAt: "2026-01-02T00:00:00Z", updatedBy: uid }));
  await assertFails(ref.set({ value: 1, updatedAt: "2026-01-02T00:00:00Z", updatedBy: uid }));
  await assertSucceeds(ref.set({ value: 2, updatedAt: "2026-01-02T00:00:00Z", updatedBy: uid }));
});

test("a reportNumber can be claimed only when its sequence matches the counter, and is immutable after", async () => {
  await testEnv.clearFirestore();
  const uid = "rpt-user";
  await seedDoc("users", uid, userProfile());
  const db = authedDb(uid, WORKER_EMAIL);

  // Claiming a number and advancing the counter to a MATCHING value in one
  // atomic batch is allowed (getAfter sees the counter's post-write value).
  const okBatch = db.batch();
  okBatch.set(db.collection("counters").doc("reportNumbers"), {
    value: 1, updatedAt: "2026-01-01T00:00:00Z", updatedBy: uid,
  });
  okBatch.set(db.collection("reportNumbers").doc("RPT-000001"), {
    value: "RPT-000001", sequence: 1, createdBy: uid,
    createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
  });
  await assertSucceeds(okBatch.commit());

  // A sequence that does NOT match the counter is rejected.
  await testEnv.clearFirestore();
  const badBatch = db.batch();
  badBatch.set(db.collection("counters").doc("reportNumbers"), {
    value: 1, updatedAt: "2026-01-01T00:00:00Z", updatedBy: uid,
  });
  badBatch.set(db.collection("reportNumbers").doc("RPT-000002"), {
    value: "RPT-000002", sequence: 2, createdBy: uid,
    createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
  });
  await assertFails(badBatch.commit());

  // Existing report numbers are immutable (allow update: if false).
  await seedDoc("reportNumbers", "RPT-000009", {
    value: "RPT-000009", sequence: 9, createdBy: uid,
    createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
  });
  await assertFails(
    db.collection("reportNumbers").doc("RPT-000009").set({ value: "RPT-999999" }, { merge: true })
  );
});

// ---------------------------------------------------------------------------
// appConfig/access — the master allowlist. Admin-only read/write, never deleted.
// ---------------------------------------------------------------------------
test("appConfig/access is admin-only to read and write, and cannot be deleted", async () => {
  await testEnv.clearFirestore();
  const admin = authedDb("admin-cfg", WORKGRID_ADMIN_EMAIL);
  const outsider = authedDb("outsider-cfg", NON_STAFF_EMAIL);

  await assertSucceeds(
    admin.collection("appConfig").doc("access").set(validAccessConfig())
  );
  await assertSucceeds(admin.collection("appConfig").doc("access").get());

  await assertFails(outsider.collection("appConfig").doc("access").get());
  await assertFails(outsider.collection("appConfig").doc("access").set(validAccessConfig()));

  // An empty masterEmails list is invalid even from an admin.
  await assertFails(
    admin.collection("appConfig").doc("access").set(validAccessConfig({ masterEmails: [] }))
  );
  await assertFails(admin.collection("appConfig").doc("access").delete());
});

// ---------------------------------------------------------------------------
// teams/{id} — readable by any active user; writable by admins only.
// ---------------------------------------------------------------------------
test("teams are readable by active users but writable only by admins", async () => {
  await testEnv.clearFirestore();
  const workerUid = "team-worker";
  await seedDoc("users", workerUid, userProfile());
  await seedDoc("teams", "team-seed", validTeam());

  const worker = authedDb(workerUid, WORKER_EMAIL);
  const admin = authedDb("admin-team", WORKGRID_ADMIN_EMAIL);
  const outsider = authedDb("outsider-team", NON_STAFF_EMAIL);

  // Read: active user yes, user with no profile no.
  await assertSucceeds(worker.collection("teams").doc("team-seed").get());
  await assertFails(outsider.collection("teams").doc("team-seed").get());

  // Write: admin yes, active worker no.
  await assertSucceeds(admin.collection("teams").doc("team-new").set(validTeam()));
  await assertFails(worker.collection("teams").doc("team-worker-made").set(validTeam()));

  // Even an admin cannot rewrite createdAt on update.
  await assertFails(
    admin.collection("teams").doc("team-seed").set(
      validTeam({ createdAt: "2027-01-01T00:00:00Z", name: "Renamed" })
    )
  );
});

// ---------------------------------------------------------------------------
// notificationSubscriptions/{id} — a user manages only their own FCM tokens.
// ---------------------------------------------------------------------------
test("a user can manage only their own notification subscription", async () => {
  await testEnv.clearFirestore();
  const uid = "sub-owner";
  const otherUid = "sub-other";
  await seedDoc("users", uid, userProfile());
  await seedDoc("notificationSubscriptions", "sub-1", validSubscription(uid));

  const owner = authedDb(uid, WORKER_EMAIL);
  const other = authedDb(otherUid, "other@example.com");

  // Create must carry the caller's own userId.
  await assertSucceeds(
    owner.collection("notificationSubscriptions").doc("sub-new").set(validSubscription(uid))
  );
  await assertFails(
    owner.collection("notificationSubscriptions").doc("sub-spoof").set(
      validSubscription(uid, { userId: "someone-else" })
    )
  );

  // Read/delete are owner-scoped.
  await assertSucceeds(owner.collection("notificationSubscriptions").doc("sub-1").get());
  await assertFails(other.collection("notificationSubscriptions").doc("sub-1").get());
  await assertSucceeds(owner.collection("notificationSubscriptions").doc("sub-1").delete());
});

// ---------------------------------------------------------------------------
// collisions/{id} — shared active-user access; loggedBy must be the caller.
// ---------------------------------------------------------------------------
test("collision logs require an active profile and an honest loggedBy", async () => {
  await testEnv.clearFirestore();
  const uid = "collision-user";
  await seedDoc("users", uid, userProfile());

  const active = authedDb(uid, WORKER_EMAIL);
  const noProfile = authedDb("collision-noprofile", "other@example.com");

  await assertSucceeds(
    active.collection("collisions").doc("col-ok").set(validCollision(uid))
  );
  await assertFails(
    active.collection("collisions").doc("col-spoof").set(
      validCollision(uid, { loggedBy: "someone-else" })
    )
  );
  await assertFails(
    noProfile.collection("collisions").doc("col-np").set(validCollision("collision-noprofile"))
  );
});

// ---------------------------------------------------------------------------
// passwordChangeLogs/{id} — server-only (Admin SDK). Admin read, no client write.
// ---------------------------------------------------------------------------
test("passwordChangeLogs are admin-readable and reject all client writes", async () => {
  await testEnv.clearFirestore();
  await seedDoc("passwordChangeLogs", "log-1", {
    targetUid: "u1", changedBy: "admin", createdAt: "2026-01-01T00:00:00Z",
  });

  const admin = authedDb("admin-log", WORKGRID_ADMIN_EMAIL);
  const outsider = authedDb("outsider-log", NON_STAFF_EMAIL);

  await assertSucceeds(admin.collection("passwordChangeLogs").doc("log-1").get());
  await assertFails(outsider.collection("passwordChangeLogs").doc("log-1").get());

  // No client — not even an admin — may write this collection.
  await assertFails(
    admin.collection("passwordChangeLogs").doc("log-2").set({
      targetUid: "u2", changedBy: "admin", createdAt: "2026-01-01T00:00:00Z",
    })
  );
});
