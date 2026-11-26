"use client";

// "Continue with Google" button (shown only when Google sign-in is switched on in Supabase), and the
// one-time "Your mobile number" screen for Google accounts. Used by the patient and caregiver apps.

import { useState, type FormEvent } from "react";
import { googleProblem, saveMyPhone, startGoogle, useGoogleEnabled } from "@/lib/google";
import { t } from "@/lib/i18n";

const digits = (value: string, max: number) => value.replace(/\D/g, "").slice(0, max);

/** Google's "G" in its four colours (the brand mark Google asks sign-in buttons to use). */
function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z" />
      <path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.8l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
    </svg>
  );
}

export function GoogleButton({ app, path, onError, alone = false }: { app: "patient" | "caregiver"; path: string; onError: (message: string) => void; alone?: boolean }) {
  const enabled = useGoogleEnabled();
  const [busy, setBusy] = useState(false);
  if (!enabled) return null;
  const go = async () => {
    onError("");
    setBusy(true);
    try { await startGoogle(app, path); } catch { setBusy(false); onError(t(googleProblem("other"))); }
  };
  return (
    <>
      {!alone && <div className="or-line" aria-hidden="true"><span>{t("or")}</span></div>}
      <button type="button" className={`btn btn-google${alone ? " btn-google-main" : ""}`} onClick={go} disabled={busy}>
        <GoogleMark />{busy ? t("Opening Google…") : t("Continue with Google")}
      </button>
    </>
  );
}

/** Asked once after a Google sign-in: caregivers, SOS and our team need a number to call. */
export function PhoneScreen({ app, initial, onSaved, onSignOut }: { app: "patient" | "caregiver"; initial: string; onSaved: () => Promise<void>; onSignOut: () => void }) {
  const [phone, setPhone] = useState(digits(initial, 10));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!/^[6-9]\d{9}$/.test(phone)) { setError(t("Enter a 10-digit mobile number.")); return; }
    setBusy(true);
    try {
      await saveMyPhone(app, phone);
      await onSaved();
    } catch {
      setBusy(false);
      setError(t("Something went wrong. Try again."));
    }
  };
  return (
    <form className="screen screen-white" onSubmit={submit} noValidate>
      <div className="scroll gap-lg" style={{ padding: "40px 24px 24px" }}>
        <div className="stack" style={{ gap: 8 }}>
          <h1 style={{ fontSize: 30 }}>{t("Your mobile number")}</h1>
          <p className="muted">
            {app === "patient"
              ? t("The caregiver and our support team call you on this number about your visits. It is never shown to the caregiver.")
              : t("Patients and our team reach you on this number through the app. Patients never see it.")}
          </p>
        </div>
        <div className="stack" style={{ gap: 8 }}>
          <label htmlFor="g-phone">{t("Mobile number")}</label>
          <div className="field">
            <span className="strong" style={{ fontSize: 18 }}>+91</span>
            <input id="g-phone" type="tel" inputMode="numeric" autoComplete="tel-national" value={phone}
              onChange={(e) => { setPhone(digits(e.target.value, 10)); setError(""); }} />
          </div>
          {error && <div role="alert" className="error">{error}</div>}
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? t("Saving…") : t("Continue")}</button>
        <button type="button" className="link-btn small" onClick={onSignOut}>{t("Log out")}</button>
      </div>
    </form>
  );
}
