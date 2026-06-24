const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

test("Firestore module initializes Firebase and exposes cube request CRUD", () => {
  const js = fs.readFileSync("firestore.js", "utf8");

  assert.match(js, /firebasejs\/12\.15\.0\/firebase-app\.js/);
  assert.match(js, /firebasejs\/12\.15\.0\/firebase-auth\.js/);
  assert.match(js, /firebasejs\/12\.15\.0\/firebase-firestore\.js/);
  assert.match(js, /initializeApp\(firebaseConfig\)/);
  assert.match(js, /getAuth\(app\)/);
  assert.match(js, /GoogleAuthProvider/);
  assert.match(js, /signInWithPopup/);
  assert.match(js, /onAuthStateChanged/);
  assert.match(js, /getFirestore\(app\)/);
  assert.match(js, /COLLECTION_NAME\s*=\s*"cubeRequests"/);
  assert.match(js, /response\.status === 405/);
  assert.match(js, /Live Server cannot run \/api functions/);
  assert.match(js, /CUBESYNC_ALLOWED_EMAILS/);
  assert.match(js, /desmond@rakmat\.com\.sg/);
  assert.match(js, /nck@rakmat\.com\.sg/);
  assert.match(js, /ernestngcy@gmail\.com/);
  assert.match(js, /jlee\.j\.m9382@gmail\.com/);

  for (const operation of [
    "listCubeRequests",
    "getCubeRequest",
    "savePublicCubeRequest",
    "saveCubeRequest",
    "updateCubeRequest",
    "deleteCubeRequest",
    "getFormFieldConfig",
    "saveFormFieldConfig",
    "getDropdownOptions",
    "addDropdownOptions",
    "saveDropdownOptions"
  ]) {
    assert.match(js, new RegExp(`function ${operation}\\b`));
    assert.match(js, new RegExp(`CubeSyncFirestore[\\s\\S]*${operation}`));
  }

  // Shared option store uses arrayUnion for de-duplicated appends and
  // delegates normalization to the testable cubesync-form-data helpers.
  assert.match(js, /arrayUnion/);
  assert.match(js, /DROPDOWN_OPTIONS_DOC_ID\s*=\s*"dropdownOptions"/);
  assert.match(js, /buildSharedDropdownAddValues/);
  assert.match(js, /buildSharedDropdownSaveValues/);
  assert.match(js, /readSharedDropdownOptions/);

  for (const operation of [
    "onAuthChange",
    "currentUser",
    "isAllowedEmail",
    "isAllowedUser",
    "signInWithGoogle",
    "signOutUser"
  ]) {
    assert.match(js, new RegExp(`function ${operation}\\b`));
    assert.match(js, new RegExp(`CubeSyncAuth[\\s\\S]*${operation}`));
  }
});

test("Firestore rules enforce CubeSync staff allowlist for direct client access", () => {
  const rules = fs.readFileSync("firestore.rules", "utf8");

  assert.match(rules, /CUBESYNC-ONLY RULES/);
  assert.match(rules, /NEVER edit the WorkGrid rules/);
  assert.match(rules, /match \/cubeRequests\/\{requestId\}/);
  assert.match(rules, /reCAPTCHA v2 server-side/);
  assert.match(rules, /function isCubeSyncStaff\(\)/);
  assert.match(rules, /allow read: if isCubeSyncStaff\(\)/);
  assert.match(rules, /jlee\.j\.m9382@gmail\.com/);
  assert.match(rules, /match \/settings\/formFieldConfig/);
  assert.match(rules, /isValidFormFieldConfig/);
  // Shared dropdown options: public read, staff-only writes.
  assert.match(rules, /match \/settings\/dropdownOptions/);
  assert.match(rules, /isValidDropdownOptions/);
  assert.match(rules, /allow create, update: if isCubeSyncStaff\(\) &&\s*isValidDropdownOptions/);
  assert.match(rules, /customRequestFields/);
  assert.match(rules, /isValidExtraFields/);
  assert.match(rules, /'extraFields'/);
  // formFieldConfig is publicly readable so the customer forms can apply field visibility.
  assert.match(rules, /match \/settings\/formFieldConfig[\s\S]*allow get: if true/);
  // showResultsSection must be an allowed key so saving the toggle doesn't fail validation.
  assert.match(rules, /isValidFormFieldConfig[\s\S]*showResultsSection/);
  assert.doesNotMatch(rules, /allow read, write: if isSignedIn\(\);/);
  assert.match(rules, /match \/bookings\/\{bookingId\}/);
  assert.match(rules, /match \/collisions\/\{collisionId\}/);
  assert.match(rules, /match \/\{document=\*\*\}/);
});

test("WorkGrid rules normalize configured access emails", () => {
  const rules = fs.readFileSync("firestore.rules", "utf8");

  assert.match(
    rules,
    /function isConfiguredMasterEmail\(\)[\s\S]*request\.auth\.token\.email\.lower\(\) in accessConfig\(\)\.masterEmails/
  );
  assert.match(
    rules,
    /function isConfiguredAllowedEmail\(\)[\s\S]*request\.auth\.token\.email\.lower\(\) in accessConfig\(\)\.masterEmails[\s\S]*request\.auth\.token\.email\.lower\(\) in accessConfig\(\)\.allowedEmails/
  );
  assert.doesNotMatch(
    rules,
    /request\.auth\.token\.email in accessConfig\(\)\.(masterEmails|allowedEmails)/
  );
});

test("WorkGrid notification subscription updates preserve ownership", () => {
  const rules = fs.readFileSync("firestore.rules", "utf8");
  const subscriptionBlock = rules.match(/match \/notificationSubscriptions\/\{subscriptionId\} \{[\s\S]*?\s{4}\}/);

  assert.ok(subscriptionBlock, "notificationSubscriptions rule block should exist");
  assert.doesNotMatch(subscriptionBlock[0], /allow create, update: if isActiveUser\(\)/);

  const createRule = subscriptionBlock[0].match(
    /allow create: if isActiveUser\(\)[\s\S]*?request\.resource\.data\.userId == request\.auth\.uid;/
  );
  const updateRule = subscriptionBlock[0].match(
    /allow\s+update:\s+if\s+isActiveUser\(\)[\s\S]*?request\.resource\.data\.userId == request\.auth\.uid;/
  );

  assert.ok(createRule, "create rule should bind the new row to the signed-in user");
  assert.ok(updateRule, "update rule should bind the row to the signed-in user");
  assert.match(updateRule[0], /resource\.data\.userId == request\.auth\.uid/);
  assert.match(updateRule[0], /isValidNotificationSubscription\(request\.resource\.data\)/);
});

test("Firestore rules allow current CubeSync dashboard save payloads", () => {
  const rules = fs.readFileSync("firestore.rules", "utf8");

  for (const field of [
    "projectErp",
    "customerBilling",
    "projectNameOnReport",
    "clientNameOnReport",
    "contact",
    "enableManualCubeJobNumber",
    "cubeJobNumber",
    "quote",
    "testItem",
    "supplierDisplay",
    "dateOfCast",
    "reportGrade",
    "personInCharge",
    "managerInCharge",
    "customFields",
    "extraFields",
    "erpStatus",
    "rpaStatus"
  ]) {
    assert.match(rules, new RegExp(`'${field}'`));
  }

  for (const resultField of [
    "setNo",
    "size",
    "specimenRef",
    "barcode",
    "specifiedSlump",
    "meanSlump",
    "resultGrade",
    "resultDateOfCast",
    "age",
    "dateOfTest",
    "invoiceNumber"
  ]) {
    assert.match(rules, new RegExp(`'${resultField}'`));
  }

  assert.match(rules, /function isValidCubeCustomFields/);
  assert.match(rules, /isValidCubeCustomFields\(request\.resource\.data\.customFields\)/);
  assert.match(rules, /value is string && value\.size\(\) <= 64/);
});

test("Firestore rules permit submittedAt and attemptCount injected by dashboard saves", () => {
  const rules = fs.readFileSync("firestore.rules", "utf8");
  const js = fs.readFileSync("firestore.js", "utf8");

  // updateCubeRequest silently appends submittedAt:serverTimestamp() whenever
  // status is set to "Ready". If the rules don't list that field in the update
  // allowlist, Firestore rejects the write with "Missing or insufficient
  // permissions" for every user who saves a form as Ready from the dashboard.
  assert.match(
    js,
    /updates\.status\s*===\s*["']Ready["'][\s\S]{0,200}submittedAt\s*=\s*serverTimestamp\(\)/,
    "updateCubeRequest must inject submittedAt when status is set to Ready"
  );

  // Extract just the isValidCubeRequestUpdate body so we verify the field is
  // in that specific function's hasOnly list, not somewhere else in the file.
  const updateFn = rules.match(/function isValidCubeRequestUpdate\(\)[\s\S]*?(?=\n {4}(?:function|match))/);
  assert.ok(updateFn, "isValidCubeRequestUpdate function must exist in rules");
  assert.match(
    updateFn[0],
    /'submittedAt'/,
    "submittedAt must be in isValidCubeRequestUpdate allowlist — omitting it blocks every 'Save as Ready' write"
  );
  assert.match(
    updateFn[0],
    /'attemptCount'/,
    "attemptCount must be in isValidCubeRequestUpdate allowlist — omitting it blocks writes that include attempt tracking"
  );

  // Both fields must also appear in cubeRequestDataKeys so create-time writes
  // that include them are not rejected either.
  const dataKeysFn = rules.match(/function cubeRequestDataKeys\(\)[\s\S]*?(?=\n {4}(?:function|match))/);
  assert.ok(dataKeysFn, "cubeRequestDataKeys function must exist in rules");
  assert.match(dataKeysFn[0], /'submittedAt'/, "submittedAt must be in cubeRequestDataKeys");
  assert.match(dataKeysFn[0], /'attemptCount'/, "attemptCount must be in cubeRequestDataKeys");
});

test("public submission API verifies reCAPTCHA v2 before Admin SDK writes", () => {
  const api = fs.readFileSync("api/cube-request-submit.js", "utf8");

  assert.match(api, /CUBESYNC_RECAPTCHA_SECRET_KEY/);
  assert.match(api, /siteverify/);
  assert.match(api, /FIREBASE_SERVICE_ACCOUNT_JSON/);
  assert.match(api, /FIREBASE_SERVICE_ACCOUNT_JSON_BASE64/);
  assert.match(api, /admin\.firestore/);
  assert.match(api, /collection\(COLLECTION_NAME\)/);
});
