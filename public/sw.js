// Service worker: lets the installed app open quickly and work without internet for screens already loaded.
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

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Save the app page, then every script and stylesheet it uses, so the app opens offline.
      const res = await fetch(SCOPE, { cache: "no-store" });
      const html = await res.clone().text();
      await cache.put(SCOPE, res);
      const urls = new Set(["manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png"].map((p) => SCOPE + p));
      for (const m of html.matchAll(/(?:src|href)="([^"]+\.(?:js|css|woff2))"/g)) urls.add(new URL(m[1], SCOPE).href);
      await Promise.all([...urls].map((u) => cache.add(u).catch(() => {})));
      await self.skipWaiting();
    })(),
  );
});

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
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(SCOPE, res.clone()));
          return res;
        })
        .catch(async () => (await caches.match(SCOPE)) || Response.error()),
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
