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
