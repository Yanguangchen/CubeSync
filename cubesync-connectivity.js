/**
 * CubeSync connectivity + page-load feedback.
 *
 * Two small, dependency-free pieces of UX shared across every page:
 *
 *  1. Offline banner — watches `navigator.onLine` and the browser's
 *     `online`/`offline` events and shows a fixed banner while the device has
 *     no connection. Submitting the request form offline silently fails (or, on
 *     flaky links, risks a half-completed write that the user retries — creating
 *     duplicates), so callers also use `isOnline()` to block the submit.
 *
 *  2. Page loader — a full-screen throbber shown immediately on load (so users
 *     get feedback while Firebase, fonts, and the auth state resolve) and hidden
 *     once the window finishes loading. `showLoader()/hideLoader()` let flows
 *     such as the Google sign-in popup reuse it.
 *
 * Exposes `window.CubeSyncConnectivity`.
 */
(function (global) {
  "use strict";

  const doc = global.document;
  const listeners = new Set();

  function isOnline() {
    // navigator.onLine is unreliable as a positive signal (it can report true
    // on a captive portal) but a reliable negative one: false means there is
    // definitely no connection, which is all we need to block a submit.
    const nav = global.navigator;
    return !nav || typeof nav.onLine !== "boolean" ? true : nav.onLine;
  }

  function ensureBanner() {
    if (!doc) return null;
    let banner = doc.getElementById("offlineBanner");
    if (!banner) {
      banner = doc.createElement("div");
      banner.id = "offlineBanner";
      banner.className = "offline-banner";
      banner.setAttribute("role", "alert");
      banner.setAttribute("aria-live", "assertive");
      banner.hidden = true;
      banner.innerHTML =
        '<span class="offline-banner-dot" aria-hidden="true"></span>' +
        "<span>You're offline. Saved changes won't go through — " +
        "reconnect before submitting to avoid duplicates.</span>";
      if (doc.body) {
        doc.body.insertBefore(banner, doc.body.firstChild);
      }
    }
    return banner;
  }

  function render() {
    const online = isOnline();
    const banner = ensureBanner();
    if (banner) {
      banner.hidden = online;
    }
    if (doc && doc.body) {
      doc.body.classList.toggle("is-offline", !online);
    }
    listeners.forEach((cb) => {
      try {
        cb(online);
      } catch {
        // A misbehaving listener must not break connectivity tracking.
      }
    });
  }

  function onChange(callback) {
    if (typeof callback !== "function") return function () {};
    listeners.add(callback);
    return function () {
      listeners.delete(callback);
    };
  }

  function loaderElement() {
    return doc ? doc.getElementById("pageLoader") : null;
  }

  function showLoader() {
    const loader = loaderElement();
    if (loader) loader.classList.remove("is-hidden");
  }

  function hideLoader() {
    const loader = loaderElement();
    if (loader) loader.classList.add("is-hidden");
  }

  function init() {
    render();
    global.addEventListener("online", render);
    global.addEventListener("offline", render);
    // Hide the boot throbber once everything (Firebase SDK, fonts) has loaded.
    if (doc && doc.readyState === "complete") {
      hideLoader();
    } else {
      global.addEventListener("load", hideLoader);
    }
  }

  if (doc) {
    if (doc.readyState === "loading") {
      doc.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }

  global.CubeSyncConnectivity = {
    isOnline,
    onChange,
    showLoader,
    hideLoader,
    refresh: render
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
