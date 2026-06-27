const test = require("node:test");
const assert = require("node:assert/strict");

const {
  isSupported,
  getPermission,
  requestPermission,
  submissionKey,
  detectNewSubmissions,
  buildNotification,
  createNotifier
} = require("./cubesync-notifications");

// A minimal window stub exposing a Notification constructor that records the
// notifications it was asked to create, plus a controllable permission state.
function fakeWindow(permission) {
  const created = [];
  function Notification(title, options) {
    created.push({ title, options });
  }
  Notification.permission = permission || "default";
  Notification.requestPermission = async function () {
    Notification.permission = "granted";
    return "granted";
  };
  return { Notification, _created: created };
}

function form(overrides) {
  return Object.assign({ id: "x", reportNo: "R", client: "", project: "", status: "Ready" }, overrides);
}

/* ----------------------------------------------------------------------- *
 * support & permission
 * ----------------------------------------------------------------------- */

test("isSupported reflects whether the window exposes Notification", () => {
  assert.equal(isSupported(fakeWindow()), true);
  assert.equal(isSupported({}), false);
  assert.equal(isSupported(null), false);
});

test("getPermission returns the current permission or 'unsupported'", () => {
  assert.equal(getPermission(fakeWindow("granted")), "granted");
  assert.equal(getPermission(fakeWindow("denied")), "denied");
  assert.equal(getPermission(fakeWindow("default")), "default");
  assert.equal(getPermission({}), "unsupported");
});

test("requestPermission returns 'unsupported' when notifications are unavailable", async () => {
  assert.equal(await requestPermission({}), "unsupported");
});

test("requestPermission short-circuits when already granted or denied", async () => {
  const granted = fakeWindow("granted");
  let asked = false;
  granted.Notification.requestPermission = async () => { asked = true; return "granted"; };
  assert.equal(await requestPermission(granted), "granted");
  assert.equal(asked, false);

  const denied = fakeWindow("denied");
  assert.equal(await requestPermission(denied), "denied");
});

test("requestPermission prompts when the permission is still default", async () => {
  const win = fakeWindow("default");
  assert.equal(await requestPermission(win), "granted");
  assert.equal(win.Notification.permission, "granted");
});

/* ----------------------------------------------------------------------- *
 * submissionKey & detectNewSubmissions
 * ----------------------------------------------------------------------- */

test("submissionKey returns the form id as a string, or '' when absent", () => {
  assert.equal(submissionKey(form({ id: 42 })), "42");
  assert.equal(submissionKey({}), "");
  assert.equal(submissionKey(null), "");
});

test("detectNewSubmissions returns forms whose id is not already seen", () => {
  const seen = ["1", "2"];
  const forms = [form({ id: "1" }), form({ id: "2" }), form({ id: "3" }), form({ id: "4" })];
  const result = detectNewSubmissions(seen, forms);
  assert.deepEqual(result.map((f) => f.id), ["3", "4"]);
});

test("detectNewSubmissions accepts a Set of seen ids", () => {
  const result = detectNewSubmissions(new Set(["1"]), [form({ id: "1" }), form({ id: "2" })]);
  assert.deepEqual(result.map((f) => f.id), ["2"]);
});

test("detectNewSubmissions treats everything as new when nothing has been seen", () => {
  const forms = [form({ id: "1" }), form({ id: "2" })];
  assert.deepEqual(detectNewSubmissions([], forms).map((f) => f.id), ["1", "2"]);
});

test("detectNewSubmissions ignores forms without an id and tolerates junk", () => {
  const result = detectNewSubmissions(["1"], [form({ id: "1" }), {}, null, form({ id: "2" })]);
  assert.deepEqual(result.map((f) => f.id), ["2"]);
  assert.deepEqual(detectNewSubmissions(["1"], null), []);
});

/* ----------------------------------------------------------------------- *
 * buildNotification
 * ----------------------------------------------------------------------- */

test("buildNotification describes a single new submission", () => {
  const payload = buildNotification([form({ id: "9", reportNo: "REPORT-9", client: "Acme", project: "Tower" })]);
  assert.equal(payload.title, "New cube request submitted");
  assert.match(payload.options.body, /REPORT-9/);
  assert.match(payload.options.body, /Acme/);
  assert.match(payload.options.body, /Tower/);
  assert.equal(payload.options.tag, "cubesync-new-submission");
  assert.deepEqual(payload.options.data.ids, ["9"]);
});

test("buildNotification summarises multiple submissions with an overflow count", () => {
  const forms = [
    form({ id: "1", reportNo: "R-1" }),
    form({ id: "2", reportNo: "R-2" }),
    form({ id: "3", reportNo: "R-3" }),
    form({ id: "4", reportNo: "R-4" })
  ];
  const payload = buildNotification(forms);
  assert.equal(payload.title, "4 new cube requests submitted");
  assert.match(payload.options.body, /R-1/);
  assert.match(payload.options.body, /\+1 more/);
  assert.deepEqual(payload.options.data.ids, ["1", "2", "3", "4"]);
});

test("buildNotification points clicks at the dashboard", () => {
  const payload = buildNotification([form({ id: "1" })]);
  assert.match(payload.options.data.url, /dashboard\.html/);
});

/* ----------------------------------------------------------------------- *
 * createNotifier
 * ----------------------------------------------------------------------- */

test("createNotifier primes silently on the first process call", async () => {
  const win = fakeWindow("granted");
  const shown = [];
  const notifier = createNotifier({ window: win, notify: (p) => shown.push(p) });

  const result = await notifier.process([form({ id: "1" }), form({ id: "2" })]);
  assert.deepEqual(result, []);
  assert.equal(shown.length, 0);
  assert.equal(notifier.hasPrimed(), true);
});

test("createNotifier notifies about forms that appear after priming", async () => {
  const win = fakeWindow("granted");
  const shown = [];
  const notifier = createNotifier({ window: win, notify: (p) => shown.push(p) });

  await notifier.process([form({ id: "1" })]);
  const result = await notifier.process([form({ id: "1" }), form({ id: "2", reportNo: "R-2" })]);

  assert.deepEqual(result.map((f) => f.id), ["2"]);
  assert.equal(shown.length, 1);
  assert.match(shown[0].options.body, /R-2/);
});

test("createNotifier stays silent when permission is not granted", async () => {
  const win = fakeWindow("default");
  const shown = [];
  const notifier = createNotifier({ window: win, notify: (p) => shown.push(p) });

  await notifier.process([form({ id: "1" })]);
  const result = await notifier.process([form({ id: "1" }), form({ id: "2" })]);

  assert.deepEqual(result.map((f) => f.id), ["2"]); // detection still works
  assert.equal(shown.length, 0); // but nothing is shown
});

test("createNotifier never re-notifies an already-seen form", async () => {
  const win = fakeWindow("granted");
  const shown = [];
  const notifier = createNotifier({ window: win, notify: (p) => shown.push(p) });

  await notifier.process([form({ id: "1" })]);
  await notifier.process([form({ id: "1" }), form({ id: "2" })]);
  const again = await notifier.process([form({ id: "1" }), form({ id: "2" })]);

  assert.deepEqual(again, []);
  assert.equal(shown.length, 1);
});

test("createNotifier does not re-notify after a form transiently disappears", async () => {
  const win = fakeWindow("granted");
  const shown = [];
  const notifier = createNotifier({ window: win, notify: (p) => shown.push(p) });

  await notifier.process([form({ id: "1" }), form({ id: "2" })]); // prime
  await notifier.process([form({ id: "1" })]); // 2 dropped from view
  const result = await notifier.process([form({ id: "1" }), form({ id: "2" })]); // 2 back

  assert.deepEqual(result, []);
  assert.equal(shown.length, 0);
});

test("createNotifier reset clears priming so the next load re-baselines", async () => {
  const win = fakeWindow("granted");
  const shown = [];
  const notifier = createNotifier({ window: win, notify: (p) => shown.push(p) });

  await notifier.process([form({ id: "1" })]);
  notifier.reset();
  assert.equal(notifier.hasPrimed(), false);

  const result = await notifier.process([form({ id: "2" })]); // re-primes, no notify
  assert.deepEqual(result, []);
  assert.equal(shown.length, 0);
});

test("createNotifier shows via the service worker registration when available", async () => {
  const win = fakeWindow("granted");
  const calls = [];
  const registration = {
    showNotification: (title, options) => { calls.push({ title, options }); return Promise.resolve(); }
  };
  const notifier = createNotifier({ window: win, getRegistration: () => Promise.resolve(registration) });

  await notifier.process([form({ id: "1" })]);
  await notifier.process([form({ id: "1" }), form({ id: "2", reportNo: "R-2" })]);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].title, "New cube request submitted");
  assert.match(calls[0].options.body, /R-2/);
});

test("createNotifier falls back to the Notification constructor without a registration", async () => {
  const win = fakeWindow("granted");
  const notifier = createNotifier({ window: win });

  await notifier.process([form({ id: "1" })]);
  await notifier.process([form({ id: "1" }), form({ id: "2" })]);

  assert.equal(win._created.length, 1);
  assert.equal(win._created[0].title, "New cube request submitted");
});

test("createNotifier ensurePermission delegates to requestPermission", async () => {
  const win = fakeWindow("default");
  const notifier = createNotifier({ window: win });
  assert.equal(await notifier.ensurePermission(), "granted");
  assert.equal(win.Notification.permission, "granted");
});

test("createNotifier process tolerates non-array input", async () => {
  const win = fakeWindow("granted");
  const notifier = createNotifier({ window: win });
  const result = await notifier.process(null);
  assert.deepEqual(result, []);
  assert.equal(notifier.hasPrimed(), true);
});
