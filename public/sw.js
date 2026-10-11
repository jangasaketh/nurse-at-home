// Service worker: lets the installed apps (patient and caregiver) open quickly and work without internet.
// Registered from app/page.tsx as sw.js?v=<app version>. A new version installs a new cache and removes the old one.
//
//   Pages:                       network first, saved copy when offline
//   /_next/static/ (fingerprinted, never change): saved copy first
//   Google Fonts:                saved copy first, refreshed in the background
//   Anything else from other sites: not touched

const VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const PREFIX = "nurse-at-home-";
const CACHE = PREFIX + VERSION;
const SCOPE = self.registration.scope; // e.g. https://user.github.io/nurse-at-home/

// Both apps live on this site: the patient app at the scope root, the caregiver app at caregiver/.
const PAGES = [SCOPE, SCOPE + "caregiver/"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const urls = new Set(["manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "caregiver/manifest.webmanifest", "caregiver/icons/icon-192.png"].map((p) => SCOPE + p));
      // Save each app page, then every script and stylesheet it uses, so both apps open offline.
      for (const page of PAGES) {
        try {
          const res = await fetch(page, { cache: "no-store" });
          if (!res.ok) continue;
          const html = await res.clone().text();
          await cache.put(page, res);
          for (const m of html.matchAll(/(?:src|href)="([^"]+\.(?:js|css|woff2))"/g)) urls.add(new URL(m[1], page).href);
        } catch {
          // Offline during install: the page is saved the next time it is opened.
        }
      }
      await Promise.all([...urls].map((u) => cache.add(u).catch(() => {})));
      await self.skipWaiting();
    })(),
  );
});

/** The saved copy for a page address: /caregiver/... pages share the caregiver app page. */
const pageKey = (url) => (url.pathname.startsWith(new URL(SCOPE).pathname + "caregiver") ? SCOPE + "caregiver/" : SCOPE);

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  if (req.mode === "navigate" && sameOrigin) {
    const key = pageKey(url);
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(key, res.clone()));
          return res;
        })
        .catch(async () => (await caches.match(key)) || Response.error()),
    );
    return;
  }

  if (sameOrigin && url.pathname.includes("/_next/static/")) {
    event.respondWith(cacheFirst(req));
    return;
  }

  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  if (sameOrigin) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(async () => (await caches.match(req)) || Response.error()),
    );
  }
});

async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  const fresh = fetch(req)
    .then((res) => {
      if (res.ok || res.type === "opaque") cache.put(req, res.clone());
      return res;
    })
    .catch(() => hit || Response.error());
  return hit || fresh;
}
