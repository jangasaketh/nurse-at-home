// NOTIFICATIONS ON THE PHONE (phase 8, version 1.6.0)
//
// The phone says yes to notifications → the browser gives a "push address" → it is saved in
// push_subscriptions → each new notification for this person is sent there by the "push" Edge Function and
// shown by the service worker (public/sw.js), even when the app is closed.
//
// Works on Android (Chrome, Edge, Firefox, Samsung Internet) and on computers. On iPhone it works only after
// the app is added to the Home Screen (iOS 16.4 or newer); the card says so.

import { db, type AppName } from "./supabase";

export type PushState = "unsupported" | "ios-install" | "not-set-up" | "blocked" | "off" | "on";

const isIos = () => typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
const standalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true);

export const pushSupported = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

function keyBytes(base64url: string) {
  const s = atob(base64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((base64url.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

/** The public push key the owner made in the admin panel (Settings → Notifications), or "" if not made yet. */
export async function publicKey(app: AppName): Promise<string> {
  const { data } = await db(app).from("settings").select("value").eq("key", "push").maybeSingle();
  return String((data?.value as { publicKey?: string } | null)?.publicKey ?? "");
}

/** Was this push address made with the current key? (After new keys, every phone must turn notifications on again.) */
function sameKey(sub: PushSubscription, key: string) {
  const current = sub.options?.applicationServerKey;
  if (!current) return true;
  const a = new Uint8Array(current), b = keyBytes(key);
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

async function registration() {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const existing = await navigator.serviceWorker.getRegistration(`${base}/`);
  if (existing) return existing;
  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";
  await navigator.serviceWorker.register(`${base}/sw.js?v=${version}`, { scope: `${base}/` });
  return navigator.serviceWorker.ready;
}

/** Where this phone stands, for the card. */
export async function pushState(app: AppName, userId: string | null): Promise<PushState> {
  if (!pushSupported()) return isIos() && !standalone() ? "ios-install" : "unsupported";
  if (Notification.permission === "denied") return "blocked";
  const key = await publicKey(app).catch(() => "");
  if (!key) return "not-set-up";
  if (Notification.permission !== "granted" || !userId) return "off";
  const reg = await navigator.serviceWorker.getRegistration(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/`);
  const sub = await reg?.pushManager.getSubscription();
  if (!sub || !sameKey(sub, key)) return "off";
  const { data } = await db(app).from("push_subscriptions").select("id").eq("user_id", userId).eq("endpoint", sub.endpoint).eq("app", app).maybeSingle();
  return data ? "on" : "off";
}

/** Ask the phone, then save its push address. Returns the new state. */
export async function enablePush(app: AppName, userId: string, lang: string): Promise<PushState> {
  if (!pushSupported()) return isIos() && !standalone() ? "ios-install" : "unsupported";
  const key = await publicKey(app);
  if (!key) return "not-set-up";
  const permission = await Notification.requestPermission();
  if (permission === "denied") return "blocked";
  if (permission !== "granted") return "off";
  const reg = await registration();
  let sub = await reg.pushManager.getSubscription();
  // A push address made with an older key will not work: make a new one.
  if (sub && !sameKey(sub, key)) {
    await sub.unsubscribe().catch(() => {});
    sub = null;
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
  const json = sub.toJSON() as { endpoint: string; keys?: { p256dh?: string; auth?: string } };
  const { error } = await db(app).from("push_subscriptions").upsert(
    { user_id: userId, app, endpoint: json.endpoint, p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "", lang },
    { onConflict: "user_id,endpoint" },
  );
  if (error) throw error;
  return "on";
}

/** Stop notifications on this phone for this person. */
export async function disablePush(app: AppName, userId: string): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  const reg = await navigator.serviceWorker.getRegistration(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/`);
  const sub = await reg?.pushManager.getSubscription();
  if (sub) await db(app).from("push_subscriptions").delete().eq("user_id", userId).eq("endpoint", sub.endpoint);
  return "off";
}

/** On log out: forget this phone's push address for the person, so the next person does not get their notifications. */
export async function forgetPushOnSignOut(app: AppName, userId: string | null) {
  if (!userId || !pushSupported()) return;
  await disablePush(app, userId).catch(() => {});
}
