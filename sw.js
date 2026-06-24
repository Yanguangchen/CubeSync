// CubeSync Service Worker — enables PWA install and offline shell caching.
// Strategy:
// - pre-cache the static app shell on install
// - use stale-while-revalidate for same-origin static assets and pages
// - bypass caching for live APIs, Firebase, auth, and runtime env

const CACHE_NAME = "cubesync-v4";

const APP_SHELL = [
  "./",
  "./dashboard.html",
  "./glassmorphic.html",
  "./index.html",
  "./rpa-dashboard.html",
  "./rpa-view.html",
  "./app.js",
  "./barcode.js",
  "./chime.js",
  "./cubesync-autocomplete.js",
  "./cubesync-dashboard-filters.js",
  "./cubesync-form-data.js",
  "./cubesync-export.js",
  "./cubesync-form-markup.js",
  "./cubesync-table-manager.js",
  "./dashboard.js",
  "./rpa-dashboard.js",
  "./rpa-view.js",
  "./css/styles.css",
  "./css/glassmorphic.css",
  "./css/shared/tokens-rakmat-base.css",
  "./css/shared/barcode.css",
  "./css/shared/throbber.css",
  "./css/dashboard.css",
  "./css/dashboard/field-config.css",
  "./css/dashboard/tokens.css",
  "./css/rpa-dashboard.css",
  "./css/xp-taskbar.css",
  "./dropdown-options/project erp.txt",
  "./dropdown-options/customer billing.txt",
  "./dropdown-options/supplier.txt",
  "./dropdown-options/Grade.txt",
  "./dropdown-options/person-in-charge.txt",
  "./dropdown-options/manager-in-charge.txt",
  "./dropdown-options/testitem.txt",
  "./dropdown-options/size.txt",
  "./favicon.png",
  "./assets/logo.png",
  "./assets/logoBanner.png",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./manifest.json"
];

function isBypassRequest(url) {
  return (
    url.pathname.endsWith("/env.js") ||
    url.pathname.startsWith("/api/") ||
    url.hostname.includes("firebaseio.com") ||
    url.hostname.includes("googleapis.com") ||
    url.hostname.includes("google.com") ||
    url.hostname.includes("gstatic.com") ||
    url.hostname.includes("google-analytics.com") ||
    url.hostname.includes("firebaseapp.com") ||
    url.hostname.includes("firebasestorage.app")
  );
}

function isCacheableRequest(request, url) {
  if (!request || request.method !== "GET") {
    return false;
  }

  if (isBypassRequest(url)) {
    return false;
  }

  if (url.origin !== self.location.origin) {
    return false;
  }

  const destination = request.destination || "";
  if (destination === "document" || destination === "script" || destination === "style" || destination === "image" || destination === "font") {
    return true;
  }

  return (
    url.pathname === "/" ||
    url.pathname.endsWith(".html") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".ico") ||
    url.pathname.endsWith(".json") ||
    url.pathname.endsWith(".txt")
  );
}

function shouldCacheResponse(request, response, url) {
  return Boolean(
    response &&
    response.status === 200 &&
    response.type !== "opaque" &&
    url.origin === self.location.origin &&
    request.method === "GET"
  );
}

// Install — pre-cache the app shell.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// Activate — remove old caches.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

function updateCache(request) {
  const url = new URL(request.url);
  return fetch(request)
    .then((response) => {
      if (shouldCacheResponse(request, response, url)) {
        const clone = response.clone();
        return caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, clone);
          return response;
        });
      }

      return response;
    });
}

// Fetch — bypass live backends, stale-while-revalidate for same-origin static assets.
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (!request || request.method !== "GET") {
    return;
  }

  const url = new URL(event.request.url);

  if (!isCacheableRequest(request, url)) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        event.waitUntil(updateCache(request).catch(() => {}));
        return cached;
      }

      return updateCache(request);
    })
  );
});
