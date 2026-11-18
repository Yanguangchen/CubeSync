const { JSDOM } = require("jsdom");
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const guidedHtml = fs.readFileSync("guided.html", "utf8");
const Guided = require("./guided.js");

const DETAILS = {
  customerBilling: "Acme Billing",
  contact: "Ada 9123 4567",
  projectErp: "PRJ-001",
  concreteGrade: "G40",
  reportGrade: "G40",
  specimenSize: "150 x 150 x 150",
  slumpSpecified: "100",
  slumpMeasured: "110",
  supplier: "MixCo",
  supplierDisplay: "MixCo Display",
  locationRepresented: "Level 12 slab",
  personInCharge: "Pat",
  managerInCharge: "Mo"
};

function installDom(url) {
  const dom = new JSDOM(guidedHtml, { url: url || "http://localhost/guided.html" });
  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.URLSearchParams = dom.window.URLSearchParams;
  global.Event = dom.window.Event;
  global.localStorage = dom.window.localStorage;
  global.scrollTo = () => {};
  global.window.scrollTo = () => {};
  global.window.Element.prototype.scrollIntoView = () => {};
  global.window.fetch = async () => ({ ok: true, text: async () => "Option A\nOption B" });
  global.window.CubeSyncBarcode = require("./barcode.js");
  global.window.CubeSyncFormMarkup = require("./cubesync-form-markup.js");
  global.window.CubeSyncFormData = require("./cubesync-form-data.js");
  global.window.CubeSyncFormPrefs = require("./cubesync-form-prefs.js");
  global.window.CubeSyncFormHistory = require("./cubesync-form-history.js");
  global.window.CubeSyncAutocomplete = require("./cubesync-autocomplete.js");
  global.window.CubeSyncTableManager = require("./cubesync-table-manager.js");
  global.window.CubeSyncEnv = { RECAPTCHA_SITE_KEY: "test-site-key" };
  global.window.grecaptcha = { render: () => 0, getResponse: () => "test-token", reset: () => {} };

  delete require.cache[require.resolve("./app.js")];
  require("./app.js");
  return dom;
}

// Load guided.html, let app.js initialise, then start the guided controller.
function start(options = {}) {
  const dom = installDom(options.url);
  const document = dom.window.document;
  const saved = { payload: null, calls: 0 };
  dom.window.CubeSyncFirestore = {
    savePublicCubeRequest: async (payload, id, token) => {
      assert.equal(id, undefined);
      assert.equal(token, "test-token");
      saved.calls += 1;
      saved.payload = payload;
      return "doc-123";
    }
  };
  if (options.before) options.before(document, dom.window);
  dom.window.dispatchEvent(new dom.window.Event("DOMContentLoaded"));
  const guided = Guided.init(document);
  return { dom, document, window: dom.window, guided, saved };
}

function fillDetails(document, values = DETAILS) {
  Object.entries(values).forEach(([name, value]) => {
    document.querySelector(`[name="${name}"]`).value = value;
  });
}

// Fill the details, save them to the remembered-details cookie, then empty the
// form again so app.js has to restore them like a real returning visit.
function rememberDetails(document, window) {
  const form = document.getElementById("cubeRequestForm");
  fillDetails(document);
  const result = window.CubeSyncFormPrefs.saveFormPreferences(form, window.CubeSyncFormData, document);
  assert.equal(result.ok, true);
  Object.keys(DETAILS).forEach((name) => {
    form.elements[name].value = "";
  });
}

function current(document) {
  const form = document.getElementById("cubeRequestForm");
  const shown = form.querySelector(".request-grid [data-guided-current], td[data-guided-current]");
  const control = shown ? shown.querySelector("input, textarea, select") : null;
  return {
    kind: form.dataset.guidedKind,
    name: control ? control.name : null,
    control,
    eyebrow: document.getElementById("guidedEyebrow").textContent,
    question: document.getElementById("guidedQuestion").textContent,
    next: document.getElementById("guidedNext").textContent
  };
}

function type(control, value) {
  control.value = value;
  control.dispatchEvent(new control.ownerDocument.defaultView.Event("input", { bubbles: true }));
  control.dispatchEvent(new control.ownerDocument.defaultView.Event("change", { bubbles: true }));
}

function clickNext(document) {
  document.getElementById("guidedNext").click();
}

const wait = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

// Answer every request question (required ones from DETAILS, optional ones
// skipped) until the walk reaches the test results.
function answerAllDetails(document) {
  const seen = [];
  for (let guard = 0; guard < 40 && current(document).kind === "req"; guard += 1) {
    const step = current(document);
    seen.push(step.name);
    if (DETAILS[step.name] && !step.control.value) type(step.control, DETAILS[step.name]);
    clickNext(document);
  }
  return seen;
}

test("guided helpers clean labels and format dates", () => {
  assert.equal(Guided.cleanLabel("Customer (Billing) * :"), "Customer (Billing)");
  assert.equal(Guided.cleanLabel("Site ref :"), "Site ref");
  assert.match(Guided.formatDate("2026-11-25"), /25 Nov 2026/);
  const noonUtc = Date.UTC(2026, 10, 18, 4, 0, 0); // 12:00 SGT on 18 Nov
  assert.equal(Guided.relativeDayLabel("2026-11-18", noonUtc), "Today");
  assert.equal(Guided.relativeDayLabel("2026-11-19", noonUtc), "Tomorrow");
  assert.equal(Guided.relativeDayLabel("2026-12-01", noonUtc), "");
});

test("first visit asks for the company details one field at a time", () => {
  const { document } = start();

  let step = current(document);
  assert.equal(step.kind, "req");
  assert.equal(step.name, "customerBilling");
  assert.equal(step.question, "Customer (Billing)");
  assert.match(step.eyebrow, /Company details · 1 of 5/);
  assert.equal(document.querySelectorAll("[data-guided-current]").length, 1, "only one field is on screen");
  assert.equal(document.getElementById("guidedIntro").hidden, false, "first-timers are told details are remembered");

  clickNext(document);
  assert.equal(current(document).name, "customerBilling", "a required question cannot be skipped");
  const error = document.getElementById("guidedError");
  assert.equal(error.hidden, false);
  assert.match(error.textContent, /Customer \(Billing\) is required/);

  type(current(document).control, "Acme Billing");
  assert.equal(error.hidden, true, "typing clears the error");
  clickNext(document);
  step = current(document);
  assert.equal(step.name, "contact");
  assert.equal(document.getElementById("guidedIntro").hidden, true);

  type(step.control, "Ada");
  clickNext(document);
  step = current(document);
  assert.equal(step.name, "projectErp");
  assert.equal(step.next, "Skip", "optional questions offer Skip while empty");

  document.getElementById("guidedBack").click();
  assert.equal(current(document).name, "contact");
});

test("Enter moves to the next question instead of submitting the form", () => {
  const { document, window } = start();
  const step = current(document);
  type(step.control, "Acme Billing");

  const enter = new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
  step.control.dispatchEvent(enter);

  assert.equal(enter.defaultPrevented, true, "implicit form submission is blocked");
  assert.equal(current(document).name, "contact");
});

test("details lead into test results, one specimen field at a time", async () => {
  const { document } = start();
  const asked = answerAllDetails(document);

  assert.deepEqual(asked.slice(0, 5), ["customerBilling", "contact", "projectErp", "projectNameOnReport", "clientNameOnReport"]);
  assert.ok(asked.includes("dateOfCast"));
  assert.ok(!asked.includes("testItem"), "the locked test item is never asked");
  assert.ok(!asked.includes("cubeJobNumber"), "cube job # is only asked when manual numbering is on");

  let step = current(document);
  assert.equal(step.kind, "res");
  assert.equal(step.name, "specimenRef1");
  assert.match(step.eyebrow, /Specimen 1 of 1/);
  assert.match(document.getElementById("guidedContext").textContent, /Acme Billing · cast/);

  type(step.control, "CUBE-01");
  clickNext(document);
  step = current(document);
  assert.equal(step.name, "barcode1");
  type(step.control, "PYY-0002/00166");
  clickNext(document);

  step = current(document);
  assert.equal(step.name, "age1");
  const chips = Array.from(document.querySelectorAll("#guidedChips .guided-chip"));
  assert.deepEqual(chips.map((chip) => chip.textContent), ["7 days", "14 days", "28 days", "56 days"]);
  chips[0].click();
  assert.equal(document.querySelector('[name="age1"]').value, "7");
  const cast = document.querySelector('[name="dateOfCast"]').value;
  const expectedTest = new Date(`${cast}T00:00:00Z`);
  expectedTest.setUTCDate(expectedTest.getUTCDate() + 7);
  assert.equal(document.querySelector('[name="dateOfTest1"]').value, expectedTest.toISOString().slice(0, 10));
  assert.match(document.getElementById("guidedNote").textContent, /Date of test:/);

  await wait(300);
  step = current(document);
  assert.equal(step.kind, "another", "picking an age moves on by itself");
  assert.match(step.question, /1 specimen added/);

  document.getElementById("addRowButton").click();
  step = current(document);
  assert.equal(step.name, "specimenRef2");
  assert.equal(step.control.value, "CUBE-02", "specimen refs count on");
  assert.equal(document.querySelector('[name="age2"]').value, "7", "the age is carried down");
  assert.equal(document.querySelector('[name="size2"]').value, "150 x 150 x 150", "request details are copied into the row");
});

test("returning visitor with remembered details goes straight to test results", () => {
  const { document, window, guided } = start({ before: rememberDetails });

  let step = current(document);
  assert.equal(step.kind, "welcome");
  assert.equal(step.question, "Submitting for Acme Billing");
  assert.equal(step.next, "Continue to test results");
  assert.equal(document.querySelector('[name="contact"]').value, "Ada 9123 4567", "app.js restored the cookie");
  assert.ok(!guided.buildFlow().some((key) => key.indexOf("req:") === 0), "no company questions in the flow");
  assert.match(document.getElementById("guidedWelcomeSummary").textContent, /Date of cast/);
  assert.equal(document.getElementById("guidedWelcomeActions").hidden, false);

  clickNext(document);
  step = current(document);
  assert.equal(step.kind, "res");
  assert.equal(step.name, "specimenRef1");
  assert.equal(document.getElementById("guidedWelcomeActions").hidden, true);

  document.getElementById("guidedBack").click();
  assert.equal(current(document).kind, "welcome");
  assert.equal(window.CubeSyncFormPrefs.hasStoredPreferences(document), true);
});

test("a remembered detail can be changed from the welcome screen", () => {
  const { document } = start({ before: rememberDetails });

  const dateRow = Array.from(document.querySelectorAll("#guidedWelcomeSummary .guided-summary-row"))
    .find((row) => /Date of cast/.test(row.textContent));
  dateRow.click();
  let step = current(document);
  assert.equal(step.name, "dateOfCast");
  assert.equal(step.next, "Done");

  type(step.control, "2026-11-02");
  clickNext(document);
  step = current(document);
  assert.equal(step.kind, "welcome");
  assert.match(document.getElementById("guidedWelcomeSummary").textContent, /2 Nov 2026/);
});

test("forgetting remembered details clears them and asks again", () => {
  const { document, window } = start({ before: rememberDetails });
  const cast = document.querySelector('[name="dateOfCast"]').value;

  document.getElementById("guidedForgetDetails").click();

  assert.equal(window.CubeSyncFormPrefs.hasStoredPreferences(document), false);
  const step = current(document);
  assert.equal(step.name, "customerBilling");
  assert.equal(step.control.value, "");
  assert.equal(document.querySelector('[name="dateOfCast"]').value, cast, "the cast date default is kept");
});

test("submitting from review saves a Guided request and remembers the details", async () => {
  const { document, window, saved } = start({ before: (doc) => fillDetails(doc) });
  assert.equal(current(document).kind, "welcome", "filled details count as present");

  clickNext(document);
  type(current(document).control, "CUBE-01");
  clickNext(document);
  type(current(document).control, "PYY-0002/00166");
  clickNext(document);
  type(current(document).control, "28");
  clickNext(document);
  assert.equal(current(document).kind, "another");

  // An extra specimen left blank is not sent.
  document.getElementById("addRowButton").click();
  document.querySelector('[name="specimenRef2"]').value = "";
  document.querySelector('[name="age2"]').value = "";
  document.getElementById("guidedNext").click(); // specimenRef2 → barcode2
  document.getElementById("guidedNext").click(); // barcode2 → age2
  document.getElementById("guidedNext").click(); // age2 → another
  clickNext(document);
  assert.equal(current(document).kind, "review");
  assert.match(document.getElementById("guidedReviewResults").textContent, /won't be sent/);
  assert.equal(document.getElementById("guidedRememberDetails").checked, true);

  document.getElementById("saveFormButton").click();
  await wait(30);

  assert.equal(saved.calls, 1);
  assert.equal(saved.payload.template, "Guided");
  assert.equal(saved.payload.customerBilling, "Acme Billing");
  assert.equal(saved.payload.results.length, 1);
  assert.equal(saved.payload.results[0].specimenRef, "CUBE-01");
  assert.equal(saved.payload.results[0].barcode, "PYY-0002/00166");
  assert.equal(saved.payload.results[0].age, 28);
  assert.equal(saved.payload.results[0].size, "150 x 150 x 150");
  assert.equal(saved.payload.results[0].resultGrade, "G40");

  assert.equal(current(document).kind, "done");
  assert.match(document.getElementById("guidedDoneText").textContent, /Reference: doc-123/);
  assert.equal(window.CubeSyncFormPrefs.hasStoredPreferences(document), true);
});

test("a missing required detail at submit opens that question and returns to review", async () => {
  const { document, saved, guided } = start({ before: (doc) => fillDetails(doc) });
  guided.go("screen:review");
  document.querySelector('[name="contact"]').value = "";

  document.getElementById("saveFormButton").click();
  await wait(30);

  assert.equal(saved.calls, 0, "nothing is sent");
  let step = current(document);
  assert.equal(step.name, "contact");
  assert.equal(step.next, "Done");
  assert.match(document.getElementById("guidedError").textContent, /Contact is required/);

  type(step.control, "Ada");
  clickNext(document);
  step = current(document);
  assert.equal(step.kind, "review");
});

test("unticking remember keeps details off this device", async () => {
  const { document, window, guided, saved } = start({ before: (doc) => fillDetails(doc) });
  guided.go("screen:review");
  document.getElementById("guidedRememberDetails").checked = false;

  document.getElementById("saveFormButton").click();
  await wait(30);

  assert.equal(saved.calls, 1);
  assert.equal(window.CubeSyncFormPrefs.hasStoredPreferences(document), false);
});

test("hidden fields are skipped and custom fields keep their values when a specimen is added", () => {
  const { document } = start({
    before(doc, win) {
      win.localStorage.setItem(win.CubeSyncFormData.FORM_FIELD_CONFIG_STORAGE_KEY, JSON.stringify({
        requestFields: { projectErp: false },
        customRequestFields: [{ id: "siteRef", label: "Site ref", type: "text", required: true, enabled: true }]
      }));
    }
  });

  const asked = answerAllDetails(document).filter(Boolean);
  // answerAllDetails stops at the required custom field it has no answer for.
  assert.ok(!asked.includes("projectErp"), "a field turned off in settings is not asked");
  let step = current(document);
  assert.equal(step.name, "custom__siteRef");
  assert.equal(step.question, "Site ref");
  assert.match(step.eyebrow, /Other details/);

  type(step.control, "Block 7");
  clickNext(document);
  assert.equal(current(document).kind, "res");

  document.getElementById("addRowButton").click();
  assert.equal(document.querySelector('[name="custom__siteRef"]').value, "Block 7");
});

test("guided page keeps the shared form contract", () => {
  const document = new JSDOM(guidedHtml).window.document;
  const form = document.getElementById("cubeRequestForm");

  assert.equal(form.dataset.template, "Guided");
  assert.ok(document.querySelector(".results-table[data-lock-testing-team]"));
  assert.ok(document.getElementById("saveFormButton"));
  assert.ok(document.getElementById("recaptchaContainer"));
  assert.equal(document.querySelector(".form-step"), null, "app.js step logic stays off");
  assert.equal(document.getElementById("nextStep"), null);
  require("./cubesync-form-data.js").FORM_FIELDS.forEach((field) => {
    assert.ok(form.elements[field], `${field} is present`);
  });

  const scripts = Array.from(document.querySelectorAll("script[src]"), (node) => node.getAttribute("src"));
  assert.ok(scripts.indexOf("guided.js") > scripts.indexOf("app.js"), "guided.js runs after app.js");

  for (const file of ["index.html", "glassmorphic.html", "guided.html"]) {
    const html = fs.readFileSync(file, "utf8");
    const toggle = new JSDOM(html).window.document.querySelector(".mode-toggle");
    const links = Array.from(toggle.querySelectorAll("a"), (link) => link.getAttribute("href"));
    assert.deepEqual(links, ["glassmorphic.html", "index.html", "guided.html"], `${file} links every form version`);
  }

  const css = fs.readFileSync("css/guided.css", "utf8");
  assert.match(css, /@import url\("shared\/tokens-rakmat-base\.css"\)/, "[hidden] stays enforced");
  assert.match(css, /font-size: 18px/, "inputs are large enough that iOS does not zoom");
});
