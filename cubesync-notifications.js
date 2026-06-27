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
    }

    function prime(forms) {
      seen = currentIds(forms);
      primed = true;
    }

    function reset() {
      seen = new Set();
      primed = false;
    }

    async function show(newForms) {
      if (!newForms.length || getPermission(win) !== "granted") {
        return false;
      }
      const payload = buildNotification(newForms);

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

    async function process(forms) {
      if (!primed) {
        prime(forms);
        return [];
      }

      const newForms = detectNewSubmissions(seen, forms);
      // Union, not replace: a form that briefly drops out of view (e.g. an
      // errored reload) must not be re-announced when it returns.
      remember(forms);

      if (newForms.length) {
        await show(newForms);
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
    createNotifier: createNotifier
  };
});
