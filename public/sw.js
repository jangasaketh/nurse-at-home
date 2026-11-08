// Service worker: lets the installed apps (patient and caregiver) open quickly and work without internet.
// The admin panel at admin/ is not handled: it always loads from the network.
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

  // The admin panel (admin/) is for the team, online only: leave its pages to the network.
  if (sameOrigin && url.pathname.startsWith(new URL(SCOPE).pathname + "admin")) return;

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

// ---------------------------------------------------------------------------------------------------------
// Notifications on the phone (1.6.0). The "push" Edge Function sends each notification here, even when the
// app is closed. It arrives as a key and values ({"k": "{name} is on the way", "v": {"name": "Anjali"}}) and is
// shown in the phone's language, using push-strings.json (built with the site).

let pushWords = null;
async function words() {
  if (pushWords) return pushWords;
  try {
    const url = SCOPE + "push-strings.json";
    let res = await fetch(url).catch(() => null);
    if (res && res.ok) (await caches.open(CACHE)).put(url, res.clone());
    else res = await caches.match(url);
    pushWords = res ? await res.json() : {};
  } catch {
    pushWords = {};
  }
  return pushWords;
}

/** A saved message as text: a plain string, {k, v}, or {j: [...], s} (see lib/booking.ts). */
function msgText(m, lang, table) {
  if (m == null) return "";
  if (typeof m === "string" || typeof m === "number") return String(m);
  if (Array.isArray(m.j)) return m.j.map((x) => msgText(x, lang, table)).join(m.s || "");
  if (typeof m.k === "string") {
    const col = lang === "te" ? 0 : lang === "kn" ? 1 : -1;
    let out = (col >= 0 && table[m.k] && table[m.k][col]) || m.k;
    const v = m.v || {};
    return out.replace(/\{(\w+)\}/g, (all, key) => (key in v ? msgText(v[key], lang, table) : all));
  }
  if (m.date) return m.date + (m.slot ? ", " + m.slot : "");
  return "";
}

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let data = {};
      try { data = event.data ? event.data.json() : {}; } catch { data = { title: event.data ? event.data.text() : "" }; }
      const table = await words();
      const caregiver = data.app === "caregiver";
      const title = msgText(data.title, data.lang, table) || "Nurse at Home";
      const body = msgText(data.body, data.lang, table);
      const icon = SCOPE + (caregiver ? "caregiver/icons/icon-192.png" : "icons/icon-192.png");
      await self.registration.showNotification(title, {
        body, icon, badge: icon, tag: data.id || undefined, lang: data.lang || "en",
        // A new request keeps ringing until it is looked at.
        requireInteraction: data.kind === "request", renotify: !!data.id, vibrate: data.kind === "request" ? [300, 150, 300, 150, 300] : [200],
        data: { url: SCOPE + (caregiver ? "caregiver/" : ""), target: data.target || null },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || SCOPE;
  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Bring the app forward if it is already open (the caregiver app for caregiver notifications).
      const caregiverUrl = url.endsWith("caregiver/");
      for (const c of open) {
        const isCaregiver = new URL(c.url).pathname.includes("/caregiver");
        if (isCaregiver === caregiverUrl && "focus" in c) {
          c.postMessage({ type: "notification-open", target: event.notification.data && event.notification.data.target });
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});
