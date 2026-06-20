const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const swContent = fs.readFileSync(path.join(__dirname, "sw.js"), "utf8");

describe("sw.js", () => {
  let listeners = {};
  
  beforeEach(() => {
    listeners = {};
    global.self = {
      addEventListener: (evt, cb) => { listeners[evt] = cb; },
      skipWaiting: () => {},
      clients: { claim: () => {} },
      location: { origin: "http://localhost" }
    };
    
    global.caches = {
      open: () => Promise.resolve({
        addAll: () => Promise.resolve(),
        put: () => Promise.resolve()
      }),
      keys: () => Promise.resolve(["old-cache"]),
      delete: () => Promise.resolve(),
      match: () => Promise.resolve(null)
    };
    
    global.fetch = () => Promise.resolve({ ok: true, clone: () => ({}) });
    
    // Evaluate sw.js in the current context
    eval(swContent);
  });

  test("registers install, activate, and fetch listeners", () => {
    assert.ok(listeners.install, "install listener registered");
    assert.ok(listeners.activate, "activate listener registered");
    assert.ok(listeners.fetch, "fetch listener registered");
  });

  test("install event precaches app shell", async () => {
    let addAllCalledWith = null;
    global.caches.open = () => Promise.resolve({
      addAll: (urls) => { addAllCalledWith = urls; return Promise.resolve(); }
    });
    
    let waitUntilPromise = null;
    const event = {
      waitUntil: (p) => { waitUntilPromise = p; }
    };
    
    listeners.install(event);
    await waitUntilPromise;
    assert.ok(addAllCalledWith, "addAll was called");
    assert.ok(addAllCalledWith.includes("./index.html"), "precaches index.html");
  });

  test("activate event deletes old caches", async () => {
    let deletedCaches = [];
    global.caches.delete = (name) => {
      deletedCaches.push(name);
      return Promise.resolve();
    };
    global.caches.keys = () => Promise.resolve(["cubesync-v1", "old-cache-1", "old-cache-2"]);
    
    let waitUntilPromise = null;
    const event = {
      waitUntil: (p) => { waitUntilPromise = p; }
    };
    
    listeners.activate(event);
    await waitUntilPromise;
    
    assert.deepStrictEqual(deletedCaches, ["cubesync-v1", "old-cache-1", "old-cache-2"]);
  });

  test("fetch event network-first for api routes", async () => {
    let matchCalled = false;
    
    global.fetch = () => Promise.resolve();
    global.caches.match = () => { matchCalled = true; return Promise.resolve(); };
    
    const event = {
      request: { url: "https://firebaseio.com/data.json" },
      respondWith: () => {}
    };
    
    listeners.fetch(event);
    
    assert.strictEqual(matchCalled, false);
  });
});
