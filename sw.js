// CubeSync Service Worker — enables PWA install and offline shell caching.
// Strategy: cache the app shell on install, serve cache-first for shell assets,
// and go network-first for Firebase/API requests.

const CACHE_NAME = "cubesync-v1";

const APP_SHELL = [
  "./",
  "./dashboard.html",
  "./glassmorphic.html",
  "./index.html",
  "./rpa-dashboard.html",
  "./rpa-view.html",
  "./app.js",
  "./barcode.js",
  "./cubesync-form-data.js",
  "./cubesync-export.js",
  "./dashboard.js",
  "./rpa-dashboard.js",
  "./rpa-view.js",
  "./styles.css",
  "./glassmorphic.css",
  "./dashboard.css",
  "./rpa-dashboard.css",
  "./favicon.png",
  "./assets/logo.png",
  "./assets/logoBanner.png",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./manifest.json"
];

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

// Fetch — network-first for Firebase/API, cache-first for everything else.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Always go to network for runtime env, Firebase, Google APIs, App Check, and analytics.
  if (
    url.pathname.endsWith("/env.js") ||
    url.hostname.includes("firebaseio.com") ||
    url.hostname.includes("googleapis.com") ||
    url.hostname.includes("google.com") ||
    url.hostname.includes("gstatic.com") ||
    url.hostname.includes("google-analytics.com") ||
    url.hostname.includes("firebaseapp.com") ||
    url.hostname.includes("firebasestorage.app")
  ) {
    return;
  }

  // For app shell assets: cache-first, falling back to network.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        // Stale-while-revalidate: return cached now, update in the background.
        fetch(event.request)
          .then((response) => {
            if (response && response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, clone);
              });
            }
          })
          .catch(() => {});

        return cached;
      }

      // Not in cache — fetch from network and cache the response.
      return fetch(event.request).then((response) => {
        if (response && response.ok && url.origin === self.location.origin) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      });
    })
  );
});
