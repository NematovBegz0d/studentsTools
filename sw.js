// EduBot — Service Worker (offline cache for static shell)
// Strategy:
//   • dist/, EduBot.html, vendor CDN scripts -> cache-first
//   • API requests (BACKEND_URL/api/*)        -> network-only (never cache)
//   • Telegram WebApp SDK                     -> stale-while-revalidate
// Cache name bumped on each release so old assets are purged.
"use strict";

const VERSION    = "v13";
const CACHE_NAME = `edubot-shell-${VERSION}`;

// Pre-cached shell — what the app needs to render offline-first.
// dist paths are versioned with ?v=N in EduBot.html; the SW matches by URL
// path (search params are kept by default), so each release effectively
// creates a fresh cache entry.
const PRECACHE_URLS = [
  "./EduBot.html",
  "./dist/app.js",
  "./dist/components/components.js",
  "./dist/components/icons.js",
  "./dist/data/data.js",
  "./dist/features/service-sheet.js",
  "./dist/features/docxedit-pro.js",
  "./dist/features/mergepdf-pro.js",
  "./dist/features/age-pro.js",
  "./dist/features/math-pro.js",
  "./dist/pages/pages-1.js",
  "./dist/pages/pages-2.js",
  "./dist/services/handlers.js",
  "./dist/utils/ios-frame.js",
  "./dist/utils/tweaks-panel.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // addAll() is atomic — if one fails, none cache. Use Promise.all on
      // individual put()s so a single 404 on cache-buster mismatch doesn't
      // abort the whole shell pre-cache.
      Promise.all(
        PRECACHE_URLS.map((url) =>
          fetch(url, { cache: "reload" })
            .then((r) => r.ok && cache.put(url, r.clone()))
            .catch(() => null),
        ),
      ),
    ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((n) => n.startsWith("edubot-shell-") && n !== CACHE_NAME)
          .map((n) => caches.delete(n)),
      ),
    ),
  );
  self.clients.claim();
});

function isApiRequest(url) {
  // Backend API — never cache. Includes Railway and any future backend URL.
  return /\/api\//.test(url.pathname);
}

function isHtmlShell(url) {
  // Entry HTML — NOT versioned, so it must be network-first or new deploys
  // get stuck behind a cached copy that still points at old ?v= dist files.
  return url.origin === self.location.origin && /EduBot\.html$/.test(url.pathname);
}

function isDistAsset(url) {
  // dist/* — versioned with ?v=N in EduBot.html, so cache-first is safe:
  // a new release changes the URL and naturally misses the old cache entry.
  return url.origin === self.location.origin && /\/dist\//.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // API: always network, never cache (responses are user-specific)
  if (isApiRequest(url)) return;

  // Entry HTML: network-first → fallback to cache (offline). Guarantees a
  // fresh deploy is picked up immediately instead of a stale shell.
  if (isHtmlShell(url)) {
    event.respondWith(
      fetch(req)
        .then((resp) => {
          if (resp && resp.ok) {
            const copy = resp.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
          }
          return resp;
        })
        .catch(() => caches.match(req)),
    );
    return;
  }

  // Versioned dist assets: cache-first → network → stale fallback
  if (isDistAsset(url)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req)
          .then((resp) => {
            if (resp && resp.ok) {
              const copy = resp.clone();
              caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
            }
            return resp;
          })
          .catch(() => caches.match(req));
      }),
    );
    return;
  }

  // Default: network-first, fall back to cache (CDN scripts, etc.)
  event.respondWith(
    fetch(req)
      .then((resp) => {
        if (resp && resp.ok && url.origin !== self.location.origin) {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
        }
        return resp;
      })
      .catch(() => caches.match(req)),
  );
});
