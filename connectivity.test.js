const { JSDOM } = require("jsdom");
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const MODULE_PATH = path.join(__dirname, "cubesync-connectivity.js");

// The module is an IIFE that binds to the global object at require time, so we
// stand up a jsdom window, mirror the bits it touches onto the Node global, and
// reload it fresh for each test.
async function loadModule({ online = true } = {}) {
  const dom = new JSDOM(
    `<!doctype html><html><body>` +
      `<div id="pageLoader" class="page-loader"></div>` +
      `</body></html>`,
    { url: "http://localhost/", pretendToBeVisual: true }
  );

  Object.defineProperty(dom.window.navigator, "onLine", {
    configurable: true,
    get() {
      return online;
    }
  });

  global.window = dom.window;
  global.document = dom.window.document;
  // Node defines a built-in read-only `navigator`, so a plain assignment is a
  // no-op; redefine it to point at the jsdom navigator the module will read.
  Object.defineProperty(global, "navigator", { configurable: true, value: dom.window.navigator });
  global.addEventListener = dom.window.addEventListener.bind(dom.window);
  global.removeEventListener = dom.window.removeEventListener.bind(dom.window);
  global.CubeSyncConnectivity = undefined;

  delete require.cache[MODULE_PATH];
  require(MODULE_PATH);

  // The module self-initialises on DOMContentLoaded (matching deferred-script
  // behaviour in the browser); let that fire before asserting.
  await new Promise((resolve) => setTimeout(resolve, 0));

  return {
    dom,
    api: global.CubeSyncConnectivity,
    setOnline(value) {
      online = value;
    }
  };
}

function banner() {
  return global.document.getElementById("offlineBanner");
}

test("reports online state and hides the offline banner when connected", async () => {
  const { api } = await loadModule({ online: true });
  assert.equal(api.isOnline(), true);
  assert.ok(banner(), "banner element should be created");
  assert.equal(banner().hidden, true);
  assert.equal(global.document.body.classList.contains("is-offline"), false);
});

test("shows the banner and marks the body offline when disconnected on load", async () => {
  const { api } = await loadModule({ online: false });
  assert.equal(api.isOnline(), false);
  assert.equal(banner().hidden, false);
  assert.equal(global.document.body.classList.contains("is-offline"), true);
});

test("reacts to online/offline events and notifies subscribers", async () => {
  const ctx = await loadModule({ online: true });
  const seen = [];
  ctx.api.onChange((value) => seen.push(value));

  ctx.setOnline(false);
  ctx.dom.window.dispatchEvent(new ctx.dom.window.Event("offline"));
  assert.equal(banner().hidden, false);
  assert.equal(ctx.api.isOnline(), false);

  ctx.setOnline(true);
  ctx.dom.window.dispatchEvent(new ctx.dom.window.Event("online"));
  assert.equal(banner().hidden, true);

  assert.deepEqual(seen, [false, true]);
});

test("page loader can be shown and hidden", async () => {
  const { api } = await loadModule({ online: true });
  const loader = global.document.getElementById("pageLoader");

  api.showLoader();
  assert.equal(loader.classList.contains("is-hidden"), false);

  api.hideLoader();
  assert.equal(loader.classList.contains("is-hidden"), true);
});

test("treats an unknown navigator.onLine as online (avoids false offline blocks)", () => {
  const dom = new JSDOM(`<!doctype html><html><body></body></html>`, { url: "http://localhost/" });
  Object.defineProperty(dom.window.navigator, "onLine", {
    configurable: true,
    get() {
      return undefined;
    }
  });
  global.window = dom.window;
  global.document = dom.window.document;
  // Node defines a built-in read-only `navigator`, so a plain assignment is a
  // no-op; redefine it to point at the jsdom navigator the module will read.
  Object.defineProperty(global, "navigator", { configurable: true, value: dom.window.navigator });
  global.addEventListener = dom.window.addEventListener.bind(dom.window);
  global.removeEventListener = dom.window.removeEventListener.bind(dom.window);

  delete require.cache[MODULE_PATH];
  require(MODULE_PATH);

  assert.equal(global.CubeSyncConnectivity.isOnline(), true);
});

test("misbehaving onChange listener does not throw or halt execution", async () => {
  const ctx = await loadModule({ online: true });
  let called = false;
  ctx.api.onChange(() => {
    throw new Error("Misbehaving listener");
  });
  ctx.api.onChange(() => {
    called = true;
  });

  ctx.setOnline(false);
  ctx.dom.window.dispatchEvent(new ctx.dom.window.Event("offline"));
  assert.equal(called, true);
});

test("onChange returns an unsubscribe function that removes the listener", async () => {
  const ctx = await loadModule({ online: true });
  let count = 0;
  const unsubscribe = ctx.api.onChange(() => {
    count++;
  });

  // Trigger change
  ctx.setOnline(false);
  ctx.dom.window.dispatchEvent(new ctx.dom.window.Event("offline"));
  assert.equal(count, 1);

  // Unsubscribe
  unsubscribe();

  // Trigger change again
  ctx.setOnline(true);
  ctx.dom.window.dispatchEvent(new ctx.dom.window.Event("online"));
  assert.equal(count, 1); // should still be 1
});

test("onChange ignores non-function callbacks", async () => {
  const ctx = await loadModule({ online: true });
  const unsubscribe = ctx.api.onChange("not-a-function");
  assert.equal(typeof unsubscribe, "function");
  unsubscribe(); // calling it shouldn't crash
});

test("initialises immediately if DOM readyState is complete", async () => {
  const dom = new JSDOM(`<!doctype html><html><body><div id="pageLoader"></div></body></html>`, { url: "http://localhost/" });
  
  // Set readyState to complete
  Object.defineProperty(dom.window.document, "readyState", {
    configurable: true,
    get() {
      return "complete";
    }
  });

  global.window = dom.window;
  global.document = dom.window.document;
  Object.defineProperty(global, "navigator", { configurable: true, value: dom.window.navigator });
  global.addEventListener = dom.window.addEventListener.bind(dom.window);
  global.removeEventListener = dom.window.removeEventListener.bind(dom.window);

  delete require.cache[MODULE_PATH];
  require(MODULE_PATH);

  // Verify it initialized immediately (loader hidden)
  await new Promise((resolve) => setTimeout(resolve, 0));
  const loader = global.document.getElementById("pageLoader");
  assert.ok(loader.classList.contains("is-hidden"));
});
