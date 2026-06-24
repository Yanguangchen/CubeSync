const { JSDOM } = require("jsdom");
const test = require("node:test");
const assert = require("node:assert/strict");

const autocomplete = require("./cubesync-autocomplete.js");

function installDom() {
  const dom = new JSDOM(
    `<!doctype html><html><body><label><input name="supplier" type="text"></label></body></html>`,
    { url: "http://localhost/" }
  );
  global.window = dom.window;
  global.document = dom.window.document;
  global.localStorage = dom.window.localStorage;
  global.window.Element.prototype.scrollIntoView = () => {};
  // No network in tests — exercise the missing-source catch and use extraOptions.
  global.window.fetch = async () => { throw new Error("offline"); };
  return dom;
}

function input() {
  return global.document.querySelector('input[name="supplier"]');
}

function dropdown() {
  return global.document.querySelector(".erp-dropdown");
}

function keydown(key) {
  const event = new global.window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  input().dispatchEvent(event);
  return event;
}

function dispatch(type) {
  input().dispatchEvent(new global.window.Event(type, { bubbles: true }));
}

async function setup(options = ["Apple", "Apricot", "Banana"]) {
  installDom();
  await autocomplete.setupAutocomplete("supplier", "options.txt", "supplierOptions", options);
}

test("focus renders a dropdown of all options", async () => {
  await setup();
  dispatch("focus");
  assert.equal(dropdown().style.display, "block");
  assert.equal(dropdown().querySelectorAll(".erp-dropdown-item").length, 3);
});

test("ArrowDown moves focus and highlights the item", async () => {
  await setup();
  dispatch("focus");

  const event = keydown("ArrowDown");
  assert.ok(event.defaultPrevented, "ArrowDown should preventDefault");
  const items = dropdown().querySelectorAll(".erp-dropdown-item");
  assert.ok(items[0].classList.contains("selected"));

  keydown("ArrowDown");
  const after = dropdown().querySelectorAll(".erp-dropdown-item");
  assert.ok(after[1].classList.contains("selected"));
  assert.ok(!after[0].classList.contains("selected"));
});

test("ArrowDown wraps around to the first item", async () => {
  await setup();
  dispatch("focus");
  keydown("ArrowDown"); // 0
  keydown("ArrowDown"); // 1
  keydown("ArrowDown"); // 2
  keydown("ArrowDown"); // wraps to 0
  const items = dropdown().querySelectorAll(".erp-dropdown-item");
  assert.ok(items[0].classList.contains("selected"));
});

test("ArrowUp wraps from the top to the last item", async () => {
  await setup();
  dispatch("focus");
  const event = keydown("ArrowUp");
  assert.ok(event.defaultPrevented);
  const items = dropdown().querySelectorAll(".erp-dropdown-item");
  assert.ok(items[items.length - 2].classList.contains("selected"));
});

test("Enter selects the focused option and closes the dropdown", async () => {
  await setup();
  dispatch("focus");
  keydown("ArrowDown"); // focus first item "Apple"
  const event = keydown("Enter");
  assert.ok(event.defaultPrevented, "Enter on a focused item should preventDefault");
  assert.equal(input().value, "Apple");
  assert.equal(input().dataset.selectedFromDropdown, "true");
  assert.equal(dropdown().style.display, "none");
});

test("Enter without a focused item does nothing", async () => {
  await setup();
  dispatch("focus");
  const event = keydown("Enter");
  assert.ok(!event.defaultPrevented, "Enter with no selection should not preventDefault");
  assert.equal(input().value, "");
  assert.equal(dropdown().style.display, "block");
});

test("Escape closes the dropdown", async () => {
  await setup();
  dispatch("focus");
  keydown("Escape");
  assert.equal(dropdown().style.display, "none");
});

test("keydown is a no-op when the dropdown is closed", async () => {
  await setup();
  // Never focused → dropdown still hidden; keydown must not throw or preventDefault.
  const event = keydown("ArrowDown");
  assert.ok(!event.defaultPrevented);
});

test("typing filters options and marks free-text entry", async () => {
  await setup();
  input().value = "ban";
  dispatch("input");
  const items = dropdown().querySelectorAll(".erp-dropdown-item");
  assert.equal(items.length, 1);
  assert.equal(items[0].textContent, "Banana");
  assert.equal(input().dataset.freeTextEntry, "true");
});

test("a query with no matches hides the dropdown", async () => {
  await setup();
  input().value = "zzz";
  dispatch("input");
  assert.equal(dropdown().style.display, "none");
});
