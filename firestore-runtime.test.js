const { JSDOM } = require("jsdom");
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

test("firestore.js runtime tests", async (t) => {
  const source = fs.readFileSync("firestore.js", "utf8");
  const runnableSource = source.replace(/import\s+{([^}]+)}\s+from\s+['"][^'"]+['"];/g, (match, imports) => {
    const destructured = imports.replace(/\bas\b/g, ':');
    return `const { ${destructured} } = window;`;
  });

  function setupDom() {
    const dom = new JSDOM('', { runScripts: "dangerously" });
    const win = dom.window;

    // Track calls
    win.calls = {
      initializeApp: 0,
      getAuth: 0,
      getFirestore: 0,
      collection: [],
      doc: [],
      getDocs: 0,
      getDoc: [],
      setDoc: [],
      addDoc: [],
      deleteDoc: [],
      signInWithPopup: 0,
      signOut: 0,
      onAuthStateChanged: 0,
      fetch: []
    };

    win.initializeApp = () => { win.calls.initializeApp++; return { name: "mockApp" }; };
    win.getAnalytics = () => {};
    win.isSupported = async () => false;

    win.getAuth = () => { win.calls.getAuth++; return { currentUser: { email: "test@example.com" } }; };
    win.GoogleAuthProvider = class { setCustomParameters() {} };
    win.signInWithPopup = async () => { win.calls.signInWithPopup++; return { user: { email: "new@example.com" } }; };
    win.signOut = async () => { win.calls.signOut++; };
    win.onAuthStateChanged = (auth, cb) => { win.calls.onAuthStateChanged++; cb({ email: "user@example.com" }); return () => {}; };

    win.getFirestore = () => { win.calls.getFirestore++; return { name: "mockDb" }; };
    win.collection = (db, name) => { win.calls.collection.push(name); return `collection_${name}`; };
    win.doc = (db, col, id) => { win.calls.doc.push({ col, id }); return `doc_${col}_${id}`; };
    
    win.getDocs = async () => {
      win.calls.getDocs++;
      return {
        docs: [
          { id: "req1", data: () => ({ name: "Request 1", updatedAt: { toMillis: () => 2000 } }) },
          { id: "req2", data: () => ({ name: "Request 2", updatedAt: { toMillis: () => 1000 } }) }
        ]
      };
    };
    
    win.getDoc = async (docRef) => {
      win.calls.getDoc.push(docRef);
      return {
        exists: () => docRef !== "doc_settings_missing",
        data: () => ({ someData: true }),
        id: "mock_id"
      };
    };

    win.setDoc = async (docRef, data, options) => {
      win.calls.setDoc.push({ docRef, data, options });
    };

    win.addDoc = async (coll, data) => {
      win.calls.addDoc.push({ coll, data });
      return { id: "new_doc_id" };
    };

    win.deleteDoc = async (docRef) => {
      win.calls.deleteDoc.push(docRef);
    };

    win.calls.updateDoc = [];
    win.updateDoc = async (docRef, data) => {
      win.calls.updateDoc.push({ docRef, data });
    };
    // Mirror the real modular SDK: serverTimestamp() returns a FieldValue
    // class instance (an object sentinel), NOT a string.
    win.FieldValue = class FieldValue {
      constructor(methodName) {
        this._methodName = methodName;
      }
    };
    win.serverTimestamp = () => new win.FieldValue("serverTimestamp");

    win.fetch = async (url, options) => {
      win.calls.fetch.push({ url, options });
      return {
        ok: true,
        json: async () => ({ id: "fetch_id" })
      };
    };

    // Execute the transformed script
    win.eval(runnableSource);

    return dom;
  }

  await t.test("initialization", () => {
    const dom = setupDom();
    assert.equal(dom.window.calls.initializeApp, 1);
    assert.equal(dom.window.calls.getAuth, 1);
    assert.equal(dom.window.calls.getFirestore, 1);
    assert.ok(dom.window.CubeSyncFirestore);
    assert.ok(dom.window.CubeSyncAuth);
  });

  await t.test("listCubeRequests", async () => {
    const dom = setupDom();
    const requests = await dom.window.CubeSyncFirestore.listCubeRequests();
    assert.equal(dom.window.calls.collection.includes("cubeRequests"), true);
    assert.equal(dom.window.calls.getDocs, 1);
    assert.equal(requests.length, 2);
    // ordered by updatedAt desc
    assert.equal(requests[0].id, "req1");
  });

  await t.test("saveCubeRequest (new)", async () => {
    const dom = setupDom();
    const id = await dom.window.CubeSyncFirestore.saveCubeRequest({ testData: 123 });
    assert.equal(id, "new_doc_id");
    assert.equal(dom.window.calls.addDoc.length, 1);
    assert.equal(dom.window.calls.addDoc[0].data.testData, 123);
    // The serverTimestamp() sentinel must survive sanitization unchanged.
    assert.ok(dom.window.calls.addDoc[0].data.createdAt instanceof dom.window.FieldValue);
    assert.equal(dom.window.calls.addDoc[0].data.createdAt._methodName, "serverTimestamp");
    assert.ok(dom.window.calls.addDoc[0].data.updatedAt instanceof dom.window.FieldValue);
  });

  await t.test("saveCubeRequest (update)", async () => {
    const dom = setupDom();
    const id = await dom.window.CubeSyncFirestore.saveCubeRequest({ testData: 456 }, "existing_id");
    assert.equal(id, "existing_id");
    assert.equal(dom.window.calls.setDoc.length, 1);
    assert.equal(dom.window.calls.setDoc[0].docRef, "doc_cubeRequests_existing_id");
    assert.equal(dom.window.calls.setDoc[0].data.testData, 456);
    assert.ok(dom.window.calls.setDoc[0].data.updatedAt instanceof dom.window.FieldValue);
  });

  await t.test("updateCubeRequest preserves serverTimestamp sentinel and nested data", async () => {
    const dom = setupDom();
    await dom.window.CubeSyncFirestore.updateCubeRequest("existing_id", {
      status: "Ready",
      extraFields: { foo: "bar", skip: undefined },
      results: [{ setNo: 1, size: "150" }]
    });

    assert.equal(dom.window.calls.updateDoc.length, 1);
    const { data } = dom.window.calls.updateDoc[0];

    // updatedAt must remain the real FieldValue sentinel, not a flattened map.
    assert.ok(data.updatedAt instanceof dom.window.FieldValue);
    assert.equal(data.updatedAt._methodName, "serverTimestamp");

    // Plain data objects/arrays should still be sanitized (undefined dropped).
    assert.equal(data.status, "Ready");
    assert.equal(data.extraFields.foo, "bar");
    assert.ok(!("skip" in data.extraFields));
    assert.equal(data.results.length, 1);
    assert.equal(data.results[0].setNo, 1);
    assert.equal(data.results[0].size, "150");
  });

  await t.test("currentUser", () => {
    const dom = setupDom();
    const user = dom.window.CubeSyncAuth.currentUser();
    assert.equal(user.email, "test@example.com");
  });

  await t.test("signInWithGoogle", async () => {
    const dom = setupDom();
    const user = await dom.window.CubeSyncAuth.signInWithGoogle();
    assert.equal(dom.window.calls.signInWithPopup, 1);
    assert.equal(user.email, "new@example.com");
  });
  
  await t.test("signOutUser", async () => {
    const dom = setupDom();
    await dom.window.CubeSyncAuth.signOutUser();
    assert.equal(dom.window.calls.signOut, 1);
  });

  await t.test("isAllowedUser", () => {
    const dom = setupDom();
    assert.equal(dom.window.CubeSyncAuth.isAllowedUser({ email: "yanguangchen@outlook.com" }), true);
    assert.equal(dom.window.CubeSyncAuth.isAllowedUser({ email: "notallowed@example.com" }), false);
  });

  await t.test("savePublicCubeRequest", async () => {
    const dom = setupDom();
    const id = await dom.window.CubeSyncFirestore.savePublicCubeRequest({ someData: true }, "public_id", "token");
    assert.equal(id, "fetch_id");
    assert.equal(dom.window.calls.fetch.length, 1);
    const fetchArgs = dom.window.calls.fetch[0];
    assert.equal(fetchArgs.url, "/api/cube-request-submit");
    assert.equal(fetchArgs.options.method, "POST");
    const body = JSON.parse(fetchArgs.options.body);
    assert.equal(body.id, "public_id");
    assert.equal(body.recaptchaToken, "token");
  });
});
