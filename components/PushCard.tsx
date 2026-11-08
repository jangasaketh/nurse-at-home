"use client";

// "Notifications on this phone" card (phase 8). Patient: Profile and the "Finding a nurse" screen.
// Caregiver: Profile and the Jobs screen while online. Signed-in (live) mode only; the demo shows nothing.

import { useEffect, useState } from "react";
import { disablePush, enablePush, pushState, type PushState } from "@/lib/push";
import { t } from "@/lib/i18n";
import { Icon } from "./Icon";

type Props = { app: "patient" | "caregiver"; userId: string | null; lang: string; live: boolean; compact?: boolean };

export function PushCard({ app, userId, lang, live, compact }: Props) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!live || !userId) return;
    let gone = false;
    pushState(app, userId).then((s) => { if (!gone) setState(s); }).catch(() => { if (!gone) setState("unsupported"); });
    return () => { gone = true; };
  }, [app, userId, live]);

  // Keep the saved language in step, so notifications arrive in the language chosen.
  useEffect(() => {
    if (state === "on" && userId) enablePush(app, userId, lang).catch(() => {});
  }, [lang]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!live || !userId || state === null || state === "not-set-up" || state === "unsupported") return null;
  // A short nudge (Jobs, Finding a nurse) only while it is off and can be switched on.
  if (compact && state !== "off") return null;

  const turnOn = async () => {
    setBusy(true); setFailed(false);
    try { setState(await enablePush(app, userId, lang)); } catch { setFailed(true); }
    setBusy(false);
  };
  const turnOff = async () => {
    setBusy(true);
    try { setState(await disablePush(app, userId)); } catch { setFailed(true); }
    setBusy(false);
  };

  const why = app === "caregiver"
    ? t("Your phone rings for new requests, even when the app is closed.")
    : t("We tell you when your nurse accepts, is on the way and arrives, even when the app is closed.");

  return (
    <div className="card stack" style={{ gap: 12 }} data-push-state={state}>
      <div className="install-card">
        <span className="app-icon"><Icon name="bell" size={24} /></span>
        <div className="stack-xs">
          <div className="strong">{state === "on" ? t("Notifications are on") : t("Turn on notifications")}</div>
          <div className="small" style={{ color: "var(--ink-soft)" }}>
            {state === "blocked"
              ? t("Notifications are blocked for this site. Allow them in your browser's site settings, then come back.")
              : state === "ios-install"
                ? t("On iPhone, first add the app to your Home Screen (see “App on your phone”), then open it from there.")
                : why}
          </div>
        </div>
      </div>
      {failed && <div className="small error" role="alert">{t("That did not work. Check your internet and try again.")}</div>}
      {state === "off" && (
        <button type="button" className="btn btn-primary" disabled={busy} onClick={turnOn}>
          <Icon name="bell" size={20} />{busy ? t("Please wait…") : t("Turn on")}
        </button>
      )}
      {state === "on" && !compact && (
        <button type="button" className="btn btn-outline" disabled={busy} onClick={turnOff}>{t("Turn off on this phone")}</button>
      )}
    </div>
  );
}
