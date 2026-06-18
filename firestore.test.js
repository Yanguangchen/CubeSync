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

  for (const operation of [
    "listCubeRequests",
    "getCubeRequest",
    "savePublicCubeRequest",
    "saveCubeRequest",
    "updateCubeRequest",
    "deleteCubeRequest"
  ]) {
    assert.match(js, new RegExp(`function ${operation}\\b`));
    assert.match(js, new RegExp(`CubeSyncFirestore[\\s\\S]*${operation}`));
  }

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

test("Firestore rules keep direct CubeSync client access signed-in only", () => {
  const rules = fs.readFileSync("firestore.rules", "utf8");

  assert.match(rules, /CUBESYNC-ONLY RULES/);
  assert.match(rules, /NEVER edit the WorkGrid rules/);
  assert.match(rules, /match \/cubeRequests\/\{requestId\}/);
  assert.match(rules, /reCAPTCHA v2 server-side/);
  assert.match(rules, /allow read, write: if isSignedIn\(\);/);
  assert.doesNotMatch(rules, /ernestngcy@gmail\.com/);
  assert.match(rules, /match \/bookings\/\{bookingId\}/);
  assert.match(rules, /match \/collisions\/\{collisionId\}/);
  assert.match(rules, /match \/\{document=\*\*\}/);
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
