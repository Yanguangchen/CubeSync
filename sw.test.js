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
      clients: {
        claim: () => {},
        matchAll: () => Promise.resolve([]),
        openWindow: () => Promise.resolve(null)
      },
      registration: {
        showNotification: () => Promise.resolve()
      },
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

  test("registers push and notificationclick listeners", () => {
    assert.ok(listeners.push, "push listener registered");
    assert.ok(listeners.notificationclick, "notificationclick listener registered");
  });

  test("push event shows a notification from the payload", async () => {
    let shown = null;
    global.self.registration.showNotification = (title, options) => {
      shown = { title, options };
      return Promise.resolve();
    };

    let waitUntilPromise = null;
    const event = {
      data: { json: () => ({ title: "New cube request", body: "REPORT-9", data: { url: "dashboard.html" } }) },
      waitUntil: (p) => { waitUntilPromise = p; }
    };

    listeners.push(event);
    await waitUntilPromise;

    assert.ok(shown, "showNotification was called");
    assert.strictEqual(shown.title, "New cube request");
    assert.strictEqual(shown.options.body, "REPORT-9");
  });

  test("push event falls back to a default title when payload is empty", async () => {
    let shown = null;
    global.self.registration.showNotification = (title, options) => {
      shown = { title, options };
      return Promise.resolve();
    };

    let waitUntilPromise = null;
    const event = {
      data: null,
      waitUntil: (p) => { waitUntilPromise = p; }
    };

    listeners.push(event);
    await waitUntilPromise;

    assert.ok(shown, "showNotification was called");
    assert.strictEqual(shown.title, "CubeSync");
  });

  test("notificationclick focuses an existing dashboard window", async () => {
    let focused = false;
    let openedUrl = null;
    const dashboardClient = {
      url: "http://localhost/dashboard.html",
      focus: () => { focused = true; return Promise.resolve(); }
    };
    global.self.clients.matchAll = () => Promise.resolve([dashboardClient]);
    global.self.clients.openWindow = (url) => { openedUrl = url; return Promise.resolve(null); };

    let closed = false;
    let waitUntilPromise = null;
    const event = {
      notification: { close: () => { closed = true; }, data: { url: "dashboard.html" } },
      waitUntil: (p) => { waitUntilPromise = p; }
    };

    listeners.notificationclick(event);
    await waitUntilPromise;

    assert.strictEqual(closed, true, "notification is closed on click");
    assert.strictEqual(focused, true, "existing window is focused");
    assert.strictEqual(openedUrl, null, "no new window opened when one exists");
  });

  test("notificationclick opens a new window when none is open", async () => {
    let openedUrl = null;
    global.self.clients.matchAll = () => Promise.resolve([]);
    global.self.clients.openWindow = (url) => { openedUrl = url; return Promise.resolve(null); };

    let waitUntilPromise = null;
    const event = {
      notification: { close: () => {}, data: { url: "dashboard.html" } },
      waitUntil: (p) => { waitUntilPromise = p; }
    };

    listeners.notificationclick(event);
    await waitUntilPromise;

    assert.match(openedUrl, /dashboard\.html/);
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
    assert.ok(addAllCalledWith.includes("./cubesync-autocomplete.js"), "precaches autocomplete helper");
    assert.ok(addAllCalledWith.includes("./cubesync-table-manager.js"), "precaches table manager");
    assert.ok(addAllCalledWith.includes("./cubesync-dashboard-filters.js"), "precaches dashboard filters");
    assert.ok(addAllCalledWith.includes("./chime.js"), "precaches chime helper");
    assert.ok(addAllCalledWith.includes("./dropdown-options/supplier.txt"), "precaches dropdown option files");
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

  test("fetch event ignores non-GET requests", async () => {
    let respondWithCalled = false;
    const event = {
      request: { url: "http://localhost/dashboard.html", method: "POST" },
      respondWith: () => { respondWithCalled = true; }
    };

    listeners.fetch(event);

    assert.strictEqual(respondWithCalled, false);
  });

  test("fetch event serves same-origin static assets from cache and revalidates", async () => {
    let respondWithPromise = null;
    let waitUntilPromise = null;
    let fetchCalled = false;

    global.caches.match = () => Promise.resolve("cached-response");
    global.fetch = () => {
      fetchCalled = true;
      return Promise.resolve({
        status: 200,
        type: "basic",
        clone: () => ({})
      });
    };

    const event = {
      request: { url: "http://localhost/cubesync-autocomplete.js", method: "GET", destination: "script" },
      respondWith: (p) => { respondWithPromise = p; },
      waitUntil: (p) => { waitUntilPromise = p; }
    };

    listeners.fetch(event);

    const response = await respondWithPromise;
    await waitUntilPromise;

    assert.strictEqual(response, "cached-response");
    assert.strictEqual(fetchCalled, true);
  });

  test("CACHE_NAME has been bumped past cubesync-v3 to bust stale caches on deploy", () => {
    assert.ok(!swContent.includes('"cubesync-v3"'), "old cubesync-v3 cache name must not be present — bump it to invalidate stale JS/CSS on next deploy");
    assert.match(swContent, /CACHE_NAME = "cubesync-v\d+"/);
  });

  test("APP_SHELL includes shared CSS files so they are invalidated on version bump", () => {
    assert.ok(swContent.includes("./css/shared/tokens-rakmat-base.css"), "tokens-rakmat-base.css must be precached");
    assert.ok(swContent.includes("./css/shared/barcode.css"), "barcode.css must be precached");
    assert.ok(swContent.includes("./css/shared/throbber.css"), "throbber.css must be precached");
  });

  test("fetch event caches dropdown option files", async () => {
    let cachedRequest = null;

    global.caches.match = () => Promise.resolve(null);
    global.caches.open = () => Promise.resolve({
      addAll: () => Promise.resolve(),
      put: (request) => {
        cachedRequest = request;
        return Promise.resolve();
      }
    });
    global.fetch = () => Promise.resolve({
      status: 200,
      type: "basic",
      clone: () => ({})
    });

    let respondWithPromise = null;
    const event = {
      request: { url: "http://localhost/dropdown-options/supplier.txt", method: "GET", destination: "" },
      respondWith: (p) => { respondWithPromise = p; },
      waitUntil: () => {}
    };

    listeners.fetch(event);
    await respondWithPromise;

    assert.ok(cachedRequest, "dropdown option request should be cached");
    assert.strictEqual(cachedRequest.url, "http://localhost/dropdown-options/supplier.txt");
  });
});
