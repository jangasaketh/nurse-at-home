"use client";

// "Try the demo" on the login screens (1.8.0). The owner switches it off in the admin panel
// (Settings → Launch); the login screens read the setting. Shown while unknown (offline, or before
// supabase/008_launch.sql is run), so nobody is ever left without a way in during testing.

import { useEffect, useState } from "react";
import { db, type AppName } from "./supabase";

const KEY = "nurse-at-home-demo:v1";

export function useDemoAllowed(app: AppName) {
  const [show, setShow] = useState<boolean>(() => {
    try { return localStorage.getItem(KEY) !== "off"; } catch { return true; }
  });
  useEffect(() => {
    let gone = false;
    db(app).from("settings").select("value").eq("key", "demo").maybeSingle().then(({ data, error }) => {
      if (gone || error || !data) return;
      const on = (data.value as { show?: boolean } | null)?.show !== false;
      setShow(on);
      try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* private mode */ }
    }, () => {});
    return () => { gone = true; };
  }, [app]);
  return show;
}

// "Send OTP" on the patient and caregiver login screens (2.2.0). Until SMS codes work for real numbers
// (DLT and an SMS provider), the owner can hide it so people use Continue with Google. It is hidden only
// when Google sign-in is switched on, so there is always a way in.
const PHONE_KEY = "nurse-at-home-phone-signin:v1";
export function usePhoneSignIn(app: AppName) {
  const [show, setShow] = useState<boolean>(() => {
    try { return localStorage.getItem(PHONE_KEY) !== "off"; } catch { return true; }
  });
  useEffect(() => {
    let gone = false;
    db(app).from("settings").select("value").eq("key", "signin").maybeSingle().then(({ data, error }) => {
      if (gone || error) return;
      const on = (data?.value as { phone?: boolean } | null)?.phone !== false;
      setShow(on);
      try { localStorage.setItem(PHONE_KEY, on ? "on" : "off"); } catch { /* private mode */ }
    }, () => {});
    return () => { gone = true; };
  }, [app]);
  return show;
}
