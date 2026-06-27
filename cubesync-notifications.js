(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.CubeSyncNotifications = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // Collapse repeat alerts under one tag so a burst of submissions does not
  // stack dozens of OS notifications.
  const NOTIFICATION_TAG = "cubesync-new-submission";
  const ICON = "assets/icon-192.png";
  const TARGET_URL = "dashboard.html";
  const MAX_NAMES = 3; // report numbers listed before an "+N more" overflow

  function notificationApi(win) {
    return win && typeof win.Notification !== "undefined" ? win.Notification : null;
  }

  // True when the runtime can show notifications at all. The service worker is
  // optional — we fall back to the Notification constructor when absent.
  function isSupported(win) {
    return Boolean(notificationApi(win));
  }

  function getPermission(win) {
    const api = notificationApi(win);
    return api ? api.permission : "unsupported";
  }

  // Ask for permission, but only when it is still "default" — calling
  // requestPermission again once decided is pointless and some browsers warn.
  function requestPermission(win) {
    const api = notificationApi(win);
    if (!api) {
      return Promise.resolve("unsupported");
    }
    if (api.permission === "granted" || api.permission === "denied") {
      return Promise.resolve(api.permission);
    }
    return Promise.resolve(api.requestPermission());
  }

  function submissionKey(form) {
    if (!form || form.id == null || form.id === "") {
      return "";
    }
    return String(form.id);
  }

  function toIdSet(seen) {
    if (seen instanceof Set) {
      return seen;
    }
    return new Set(Array.isArray(seen) ? seen.map((value) => String(value)) : []);
  }

  // Forms present in `forms` whose id has not been seen before.
  function detectNewSubmissions(seen, forms) {
    const seenSet = toIdSet(seen);
    const list = Array.isArray(forms) ? forms : [];
    return list.filter((form) => {
      const key = submissionKey(form);
      return key && !seenSet.has(key);
    });
  }

  function describeForm(form) {
    const report = submissionKey(form) ? (form.reportNo || form.id) : "New request";
    const who = [form && form.client, form && form.project].filter(Boolean).join(" · ");
    return who ? report + " — " + who : String(report);
  }

  // Build the { title, options } pair passed to showNotification / Notification.
  function buildNotification(newForms) {
    const list = Array.isArray(newForms) ? newForms.filter(Boolean) : [];
    const count = list.length;

    const title = count === 1
      ? "New cube request submitted"
      : count + " new cube requests submitted";

    let body;
    if (count === 1) {
      body = describeForm(list[0]);
    } else {
      const names = list.slice(0, MAX_NAMES).map((form) => form.reportNo || form.id || "request");
      const overflow = count - names.length;
      body = names.join(", ") + (overflow > 0 ? ", +" + overflow + " more" : "");
    }

    return {
      title: title,
      options: {
        body: body,
        tag: NOTIFICATION_TAG,
        renotify: true,
        icon: ICON,
        badge: ICON,
        data: {
          url: TARGET_URL,
          ids: list.map((form) => submissionKey(form)).filter(Boolean)
        }
      }
    };
  }

  // Record-status fields tracked across snapshots. A change to any of these on
  // an already-seen record can raise a lifecycle notification.
  const TRACKED_FIELDS = ["status", "rpaStatus", "erpStatus"];

  // Maps a status transition to the alert copy it should raise. `from` is
  // optional; when present the previous value must match for the rule to fire
  // (so e.g. "missing information" only fires on a Ready -> Draft kick-back, not
  // on a brand-new Draft). Order is irrelevant — every matching rule fires.
  const STATUS_NOTIFICATION_RULES = [
    { field: "status", to: "Ready", title: "Form ready for ERP processing" },
    { field: "status", to: "Draft", from: "Ready", title: "Form missing required information" },
    { field: "rpaStatus", to: "In Progress", title: "RPA automation started" },
    { field: "rpaStatus", to: "Submitted to ERP", title: "RPA automation completed" },
    { field: "rpaStatus", to: "Failed", title: "RPA automation failed" },
    { field: "erpStatus", to: "Success", title: "Record successfully processed" },
    { field: "erpStatus", to: "Error", title: "Record requires manual review" }
  ];

  // Read a tracked field from a form, falling back to its raw Firestore record.
  // The dashboard normalizes forms (which keeps `status`) but rpaStatus/erpStatus
  // live on the raw record, so both shapes must be supported.
  function readField(form, field) {
    if (!form) {
      return undefined;
    }
    if (form[field] != null) {
      return form[field];
    }
    if (form.raw && form.raw[field] != null) {
      return form.raw[field];
    }
    return undefined;
  }

  function snapshotFields(form) {
    const snapshot = {};
    TRACKED_FIELDS.forEach((field) => {
      snapshot[field] = readField(form, field);
    });
    return snapshot;
  }

  // Compare the previous per-id field snapshot against the current forms and
  // return one { form, rule } event per matching transition.
  function detectStatusChanges(previousById, forms, rules) {
    const previous = previousById instanceof Map ? previousById : new Map();
    const ruleList = Array.isArray(rules) ? rules : STATUS_NOTIFICATION_RULES;
    const list = Array.isArray(forms) ? forms : [];
    const events = [];

    list.forEach((form) => {
      const key = submissionKey(form);
      if (!key || !previous.has(key)) {
        return; // brand-new records are handled as "new submissions" instead
      }
      const before = previous.get(key) || {};
      ruleList.forEach((rule) => {
        const current = readField(form, rule.field);
        const prior = before[rule.field];
        if (current !== rule.to || current === prior) {
          return; // must now equal the target value AND have actually changed
        }
        if (rule.from != null && prior !== rule.from) {
          return; // honour the optional from-constraint
        }
        events.push({ form: form, rule: rule });
      });
    });

    return events;
  }

  // Build the { title, options } pair for a status-transition rule. Mirrors
  // buildNotification but keys the tag per rule so distinct lifecycle alerts do
  // not collapse into one another.
  function buildStatusNotification(rule, forms) {
    const list = Array.isArray(forms) ? forms.filter(Boolean) : [];
    const count = list.length;
    const title = count > 1 ? count + " · " + rule.title : rule.title;

    let body;
    if (count === 1) {
      body = describeForm(list[0]);
    } else {
      const names = list.slice(0, MAX_NAMES).map((form) => form.reportNo || form.id || "request");
      const overflow = count - names.length;
      body = names.join(", ") + (overflow > 0 ? ", +" + overflow + " more" : "");
    }

    return {
      title: title,
      options: {
        body: body,
        tag: NOTIFICATION_TAG + "-" + rule.field + "-" + rule.to,
        renotify: true,
        icon: ICON,
        badge: ICON,
        data: {
          url: TARGET_URL,
          ids: list.map((form) => submissionKey(form)).filter(Boolean)
        }
      }
    };
  }

  // Stateful controller used by the dashboard. It remembers which submission
  // ids have already been observed so only genuinely new ones raise a
  // notification, and it primes silently on the first load (so an existing
  // backlog does not trigger a flood).
  //
  // options:
  //   window          - window-like object exposing Notification
  //   getRegistration - optional async () => ServiceWorkerRegistration|null
  //   notify          - optional async (payload) => void, overrides display
  //                     (used in tests; production uses the SW registration)
  function createNotifier(options) {
    const opts = options || {};
    const win = opts.window;
    const getRegistration = opts.getRegistration;
    const notifyOverride = opts.notify;

    let seen = new Set();
    let fieldsById = new Map();
    let primed = false;

    function currentIds(forms) {
      const list = Array.isArray(forms) ? forms : [];
      const ids = new Set();
      list.forEach((form) => {
        const key = submissionKey(form);
        if (key) {
          ids.add(key);
        }
      });
      return ids;
    }

    function remember(forms) {
      currentIds(forms).forEach((id) => seen.add(id));
      // Update tracked field values to the latest seen. Records that drop out of
      // view keep their last-known state, so a transient disappearance does not
      // replay an alert when they return unchanged.
      (Array.isArray(forms) ? forms : []).forEach((form) => {
        const key = submissionKey(form);
        if (key) {
          fieldsById.set(key, snapshotFields(form));
        }
      });
    }

    function prime(forms) {
      seen = currentIds(forms);
      fieldsById = new Map();
      (Array.isArray(forms) ? forms : []).forEach((form) => {
        const key = submissionKey(form);
        if (key) {
          fieldsById.set(key, snapshotFields(form));
        }
      });
      primed = true;
    }

    function reset() {
      seen = new Set();
      fieldsById = new Map();
      primed = false;
    }

    async function deliver(payload) {
      if (typeof notifyOverride === "function") {
        await notifyOverride(payload);
        return true;
      }

      if (typeof getRegistration === "function") {
        const registration = await getRegistration();
        if (registration && typeof registration.showNotification === "function") {
          await registration.showNotification(payload.title, payload.options);
          return true;
        }
      }

      const NotificationCtor = notificationApi(win);
      if (NotificationCtor) {
        const note = new NotificationCtor(payload.title, payload.options);
        return Boolean(note);
      }

      return false;
    }

    async function show(newForms) {
      if (!newForms.length || getPermission(win) !== "granted") {
        return false;
      }
      return deliver(buildNotification(newForms));
    }

    // Group transition events by rule so all records that hit the same
    // transition in one snapshot collapse into a single alert, then deliver one
    // notification per rule.
    async function showStatusEvents(events) {
      if (!events.length || getPermission(win) !== "granted") {
        return;
      }
      const groups = new Map();
      events.forEach((event) => {
        const key = event.rule.field + ":" + event.rule.to;
        if (!groups.has(key)) {
          groups.set(key, { rule: event.rule, forms: [] });
        }
        groups.get(key).forms.push(event.form);
      });

      for (const group of groups.values()) {
        await deliver(buildStatusNotification(group.rule, group.forms));
      }
    }

    async function process(forms) {
      if (!primed) {
        prime(forms);
        return [];
      }

      const newForms = detectNewSubmissions(seen, forms);
      const statusEvents = detectStatusChanges(fieldsById, forms, STATUS_NOTIFICATION_RULES);
      // Union, not replace: a form that briefly drops out of view (e.g. an
      // errored reload) must not be re-announced when it returns.
      remember(forms);

      if (newForms.length) {
        await show(newForms);
      }
      if (statusEvents.length) {
        await showStatusEvents(statusEvents);
      }
      return newForms;
    }

    return {
      prime: prime,
      process: process,
      reset: reset,
      hasPrimed: function () { return primed; },
      ensurePermission: function () { return requestPermission(win); }
    };
  }

  return {
    isSupported: isSupported,
    getPermission: getPermission,
    requestPermission: requestPermission,
    submissionKey: submissionKey,
    detectNewSubmissions: detectNewSubmissions,
    buildNotification: buildNotification,
    createNotifier: createNotifier,
    STATUS_NOTIFICATION_RULES: STATUS_NOTIFICATION_RULES,
    detectStatusChanges: detectStatusChanges,
    buildStatusNotification: buildStatusNotification
  };
});
