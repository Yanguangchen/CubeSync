import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getAnalytics, isSupported as isAnalyticsSupported } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-analytics.js";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  serverTimestamp,
  setDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

const COLLECTION_NAME = "cubeRequests";
const SETTINGS_COLLECTION = "settings";
const FORM_FIELD_CONFIG_DOC_ID = "formFieldConfig";
const firebaseConfig = {
  apiKey: "AIzaSyDovmjClkov6q1qRQkkgCExH31rEbX0X2M",
  authDomain: "crewhub-43647.firebaseapp.com",
  projectId: "crewhub-43647",
  storageBucket: "crewhub-43647.firebasestorage.app",
  messagingSenderId: "847443127747",
  appId: "1:847443127747:web:c005227c10ce8a8913a176",
  measurementId: "G-RKNRK0XHYL"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();
const CUBESYNC_ALLOWED_EMAILS = [
  "yanguangchensp@gmail.com",
  "yanguangchen@outlook.com",
  "mushfiqsiddqiue@gmail.com",
  "desmond@rakmat.com.sg",
  "theresaongpohkuan@gmail.com",
  "theresa@rakmat.com.sg",
  "ken@rakmat.com.sg",
  "fondlekc@gmail.com",
  "account@rakmat.com.sg",
  "account1@rakmat.com.sg",
  "feichin@rakmat.com.sg",
  "taiheng@rakmat.com.sg",
  "oakkar@rakmat.com.sg",
  "agga@rakmat.com.sg",
  "ma@rakmat.com.sg",
  "khun@rakmat.com.sg",
  "yanguangchen@webwizardsg.com",
  "santofokir605@gmail.com",
  "nckeyong@gmail.com",
  "nck@rakmat.com.sg",
  "ernestngcy@gmail.com",
  "jlee.j.m9382@gmail.com"
];

googleProvider.setCustomParameters({
  prompt: "select_account"
});

isAnalyticsSupported()
  .then((supported) => {
    if (supported) {
      getAnalytics(app);
    }
  })
  .catch(() => {});

function cubeRequestsCollection() {
  return collection(db, COLLECTION_NAME);
}

function cubeRequestDocument(id) {
  return doc(db, COLLECTION_NAME, id);
}

function settingsDocument(id) {
  return doc(db, SETTINGS_COLLECTION, id);
}

function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

function currentUser() {
  return auth.currentUser;
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isAllowedEmail(email) {
  return CUBESYNC_ALLOWED_EMAILS.includes(normalizeEmail(email));
}

function isAllowedUser(user) {
  return Boolean(user && isAllowedEmail(user.email));
}

async function signInWithGoogle() {
  const credential = await signInWithPopup(auth, googleProvider);
  return credential.user;
}

async function signOutUser() {
  await signOut(auth);
}

function isPlainObject(value) {
  if (!value || typeof value !== "object") {
    return false;
  }

  // Cross-realm safe plain-object check: a plain object's prototype is either
  // null or an object whose own prototype is null (Object.prototype). Class
  // instances such as FieldValue (serverTimestamp), Timestamp, and Date have a
  // deeper prototype chain, so they are left untouched.
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || Object.getPrototypeOf(prototype) === null;
}

function withoutUndefined(value) {
  if (Array.isArray(value)) {
    return value.map(withoutUndefined);
  }

  // Only recurse into plain data objects. Firestore sentinels such as
  // serverTimestamp() (FieldValue), Timestamp, and Date are class instances —
  // copying them via Object.entries() would strip their identity and write a
  // plain map instead, which the security rules reject (permission-denied).
  if (isPlainObject(value)) {
    return Object.entries(value).reduce((clean, [key, entry]) => {
      if (entry !== undefined) {
        clean[key] = withoutUndefined(entry);
      }
      return clean;
    }, {});
  }

  return value;
}

function snapshotToCubeRequest(snapshot) {
  return {
    id: snapshot.id,
    ...snapshot.data()
  };
}

function sortByUpdatedAtDesc(left, right) {
  const leftValue = left.updatedAt && typeof left.updatedAt.toMillis === "function"
    ? left.updatedAt.toMillis()
    : Date.parse(left.updatedAt || "") || 0;
  const rightValue = right.updatedAt && typeof right.updatedAt.toMillis === "function"
    ? right.updatedAt.toMillis()
    : Date.parse(right.updatedAt || "") || 0;

  return rightValue - leftValue;
}

async function listCubeRequests() {
  const snapshot = await getDocs(cubeRequestsCollection());
  return snapshot.docs.map(snapshotToCubeRequest).sort(sortByUpdatedAtDesc);
}

async function getCubeRequest(id) {
  const snapshot = await getDoc(cubeRequestDocument(id));
  return snapshot.exists() ? snapshotToCubeRequest(snapshot) : null;
}

async function saveCubeRequest(payload, id) {
  const cleanPayload = withoutUndefined({
    ...payload,
    updatedAt: serverTimestamp()
  });

  if (id) {
    await setDoc(cubeRequestDocument(id), cleanPayload, { merge: true });
    return id;
  }

  const reference = await addDoc(cubeRequestsCollection(), withoutUndefined({
    ...cleanPayload,
    createdAt: serverTimestamp()
  }));
  return reference.id;
}

async function savePublicCubeRequest(payload, id, recaptchaToken) {
  const response = await fetch("/api/cube-request-submit", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(withoutUndefined({
      id,
      payload,
      recaptchaToken
    }))
  });
  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 405) {
      throw new Error(result.error || "Submission API is not running. Use Vercel or vercel dev; Live Server cannot run /api functions.");
    }
    throw new Error(result.error || "Form submission failed");
  }

  return result.id;
}

async function updateCubeRequest(id, updates) {
  await updateDoc(cubeRequestDocument(id), withoutUndefined({
    ...updates,
    updatedAt: serverTimestamp()
  }));
  return id;
}

async function deleteCubeRequest(id) {
  await deleteDoc(cubeRequestDocument(id));
  return id;
}

async function getFormFieldConfig() {
  const snapshot = await getDoc(settingsDocument(FORM_FIELD_CONFIG_DOC_ID));
  return snapshot.exists() ? snapshot.data() : null;
}

async function saveFormFieldConfig(config) {
  await setDoc(settingsDocument(FORM_FIELD_CONFIG_DOC_ID), withoutUndefined({
    ...config,
    updatedAt: serverTimestamp()
  }));
  return FORM_FIELD_CONFIG_DOC_ID;
}

window.CubeSyncFirestore = {
  COLLECTION_NAME,
  SETTINGS_COLLECTION,
  FORM_FIELD_CONFIG_DOC_ID,
  firebaseConfig,
  listCubeRequests,
  getCubeRequest,
  savePublicCubeRequest,
  saveCubeRequest,
  updateCubeRequest,
  deleteCubeRequest,
  getFormFieldConfig,
  saveFormFieldConfig
};

window.CubeSyncAuth = {
  CUBESYNC_ALLOWED_EMAILS,
  onAuthChange,
  currentUser,
  isAllowedEmail,
  isAllowedUser,
  signInWithGoogle,
  signOutUser
};
