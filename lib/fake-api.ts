"use client";

// Stand-ins for real network calls, so the loading and error screens can be seen and tested now.
// When the backend exists: replace the timers below with real requests and keep the same return shape.

import { useEffect, useRef, useState } from "react";

const LOAD_MS = 500;
const ACTION_MS = 700;

export type LoadStatus = "loading" | "error" | "ready";

// "Simulated failure" (a prototype tool in Profile) makes the FIRST try fail and the next one work,
// so both the error message and the recovery can be seen without getting stuck.

/** For a screen that fetches a list: shows "loading", then "ready" or "error". */
export function useLoad(simulateFailure: boolean) {
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setStatus("loading");
    const timer = setTimeout(() => setStatus(simulateFailure && attempt === 0 ? "error" : "ready"), LOAD_MS);
    return () => clearTimeout(timer);
  }, [attempt, simulateFailure]);

  return { status, retry: () => setAttempt((n) => n + 1) };
}

/** For a button that saves something: "busy" while it runs, "failed" if it did not go through. */
export function useAction(simulateFailure: boolean) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failedOnce = useRef(false);

  // If the person leaves the screen mid-save, drop the pending action.
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const run = (onSuccess: () => void) => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    timer.current = setTimeout(() => {
      setBusy(false);
      if (simulateFailure && !failedOnce.current) {
        failedOnce.current = true;
        setFailed(true);
      } else {
        onSuccess();
      }
    }, ACTION_MS);
  };

  return { busy, failed, run };
}
