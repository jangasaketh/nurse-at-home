"use client";

// Installing the web app on the phone's home screen.
//
// Android (Chrome, Edge, Samsung Internet): the browser fires "beforeinstallprompt". We keep that event and
// show our own Install button, which opens the browser's install dialog.
// iPhone and iPad: there is no install event. The person adds it from Safari's Share menu, so we show the steps.
// Already installed (opened from the home screen): nothing is shown.

import { useEffect, useReducer, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferred: InstallPromptEvent | null = null;
let installedNow = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((f) => f());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // stop the browser's own small banner; we show ours
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installedNow = true;
    notify();
  });
}

export type InstallInfo = {
  installed: boolean; // running from the home screen, or just installed
  canPrompt: boolean; // the browser offered its install dialog (Android)
  ios: boolean; // iPhone or iPad: show the Share → Add to Home Screen steps
  prompt: () => Promise<boolean>;
};

export function useInstall(): InstallInfo {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const [env, setEnv] = useState({ standalone: false, ios: false });

  useEffect(() => {
    listeners.add(rerender);
    const nav = navigator as Navigator & { standalone?: boolean };
    setEnv({
      standalone: window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true,
      ios: /iphone|ipad|ipod/i.test(nav.userAgent) || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1),
    });
    return () => { listeners.delete(rerender); };
  }, []);

  return {
    installed: env.standalone || installedNow,
    canPrompt: deferred !== null,
    ios: env.ios,
    prompt: async () => {
      if (!deferred) return false;
      const event = deferred;
      deferred = null;
      await event.prompt();
      const choice = await event.userChoice;
      notify();
      return choice.outcome === "accepted";
    },
  };
}

/** Registers the service worker, so the installed app opens offline. Production builds only. */
export function registerServiceWorker() {
  if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";
  navigator.serviceWorker.register(`${base}/sw.js?v=${version}`, { scope: `${base}/` }).catch(() => {
    // Not supported or blocked: the app still works online.
  });
}
