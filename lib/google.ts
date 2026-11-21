"use client";

// CONTINUE WITH GOOGLE (2.1.0). The patient and caregiver apps can sign in with a Google account instead of
// an SMS code. Google sends the person back to the same app with the sign-in in the address (#access_token=…),
// which is read once and removed. Google accounts have no mobile number, so the apps ask for it once.

import { useEffect, useRef, useState } from "react";
import { db, SUPABASE_KEY, SUPABASE_URL, type AppName } from "./supabase";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Is Google sign-in switched on in Supabase (Authentication → Providers)? The button shows only then. */
let enabledCache: Promise<boolean> | null = null;
export function googleEnabled(): Promise<boolean> {
  enabledCache ??= fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_KEY } })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => !!j?.external?.google)
    .catch(() => false);
  return enabledCache;
}
export function useGoogleEnabled() {
  const [on, setOn] = useState(false);
  useEffect(() => { let live = true; void googleEnabled().then((v) => { if (live) setOn(v); }); return () => { live = false; }; }, []);
  return on;
}

/** Go to Google. `path` is where Google sends the person back: "/" or "/caregiver/". */
export async function startGoogle(app: Exclude<AppName, "admin">, path: string) {
  const redirectTo = `${window.location.origin}${BASE}${path}`;
  const { error } = await db(app).auth.signInWithOAuth({ provider: "google", options: { redirectTo, queryParams: { prompt: "select_account" } } });
  if (error) throw error;
}

export type GoogleReturn = { userId: string } | { failed: "provider" | "cancelled" | "other" } | null;

/** Read the sign-in Google sent back (once), and remove it from the address bar. Null when there is none. */
export async function takeGoogleReturn(app: Exclude<AppName, "admin">): Promise<GoogleReturn> {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash;
  const query = window.location.search;
  const looksLikeOAuth = /access_token=|error=|error_description=/.test(hash) || /error=|error_description=/.test(query);
  if (!looksLikeOAuth || /type=recovery/.test(hash)) return null;
  const h = new URLSearchParams(hash.slice(1));
  const q = new URLSearchParams(query.slice(1));
  history.replaceState(null, "", window.location.pathname); // the token must not stay in the address bar
  const err = [h.get("error"), q.get("error"), h.get("error_description"), q.get("error_description")].filter(Boolean).join(" ");
  if (err) {
    const text = err.toLowerCase();
    if (/provider is not enabled|unsupported provider|not enabled/.test(text)) return { failed: "provider" };
    if (/access_denied|cancel|denied/.test(text)) return { failed: "cancelled" };
    return { failed: "other" };
  }
  const access = h.get("access_token"), refresh = h.get("refresh_token");
  if (!access || !refresh) return { failed: "other" };
  const { data, error } = await db(app).auth.setSession({ access_token: access, refresh_token: refresh });
  if (error || !data.user) return { failed: "other" };
  return { userId: data.user.id };
}

/** On the login screen: finish a Google sign-in that just came back. */
export function useGoogleReturn(app: Exclude<AppName, "admin">, onUser: (userId: string) => Promise<void>, onFail: (kind: "provider" | "cancelled" | "other") => void) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    void (async () => {
      const r = await takeGoogleReturn(app);
      if (!r) return;
      if ("userId" in r) {
        try { await onUser(r.userId); } catch { onFail("other"); }
      } else onFail(r.failed);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** The account's mobile number (91XXXXXXXXXX), or null when a Google account has not given one yet. */
export async function myPhone(app: Exclude<AppName, "admin">): Promise<string | null> {
  const { data, error } = await db(app).rpc("my_phone");
  if (error) {
    if (error.code === "PGRST202") return "unknown"; // database part 12 not run yet: do not block sign-in
    throw error;
  }
  return (data as string | null) ?? null;
}

export async function saveMyPhone(app: Exclude<AppName, "admin">, tenDigits: string) {
  const { error } = await db(app).rpc("set_my_phone", { p_phone: tenDigits });
  if (error) throw error;
}

/** The message for a failed Google sign-in. English keys; the screens translate them. */
export function googleProblem(kind: "provider" | "cancelled" | "other") {
  switch (kind) {
    case "provider": return "Sign-in with Google is not switched on yet. Use your mobile number for now.";
    case "cancelled": return "Google sign-in was cancelled.";
    default: return "Google sign-in did not work. Try again.";
  }
}
