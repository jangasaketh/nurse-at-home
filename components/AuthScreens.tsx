"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useApp } from "@/lib/store";
import { SELF } from "@/lib/booking";
import { t } from "@/lib/i18n";
import { LanguageChips } from "./LanguageChips";
import { Icon } from "./Icon";
import { CheckRow, Header, TextField } from "./ui";
import { authProblem, db, intlPhone } from "@/lib/supabase";

/** The message for a failed sign-in step, in the app's language. */
export function authMessage(kind: ReturnType<typeof authProblem>) {
  switch (kind) {
    case "provider": return t("Sign-in by SMS is not switched on yet. Try the demo for now.");
    case "code": return t("That code is wrong or has expired. Check it, or ask for a new one.");
    case "rate": return t("Too many tries. Wait a minute and try again.");
    case "network": return t("No internet connection. Check it and try again.");
    default: return t("Something went wrong. Try again.");
  }
}

const digits = (value: string, max: number) => value.replace(/\D/g, "").slice(0, max);

/** English / తెలుగు / ಕನ್ನಡ. Each name is written in its own script so people can find theirs. */
export function LanguagePicker() {
  const { state, set } = useApp();
  return <LanguageChips value={state.lang} onChange={(lang) => set({ lang })} />;
}

export function LoginScreen() {
  const { state, set } = useApp();
  const [error, setError] = useState(false);
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);

  // Real sign-in: the database sends a 6-digit code by SMS (or accepts the fixed code of a test number).
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setProblem("");
    if (state.phone.length !== 10) { setError(true); return; }
    setBusy(true);
    const { error: err } = await db("patient").auth.signInWithOtp({ phone: intlPhone(state.phone) });
    setBusy(false);
    if (err) { setProblem(authMessage(authProblem(err))); return; }
    set({ mode: "live", screen: "otp", trail: [] });
  };
  // The demo: sample data, any 6 digits work, nothing is saved to an account.
  const demo = () => set({ mode: "demo", userId: null, screen: "otp", trail: [] });

  return (
    <form className="screen screen-white login" onSubmit={submit} noValidate>
      <div className="row-inline" style={{ gap: 10 }}>
        <div className="logo"><Icon name="logo" size={24} /></div>
        <div className="brand">Nurse at Home</div>
      </div>
      <LanguagePicker />
      <div className="stack">
        <h1>{t("A verified nurse at your door.")}</h1>
        <p className="muted" style={{ fontSize: 17 }}>
          {t("Injections, IV drips, wound dressing and medication visits at home.")}
        </p>
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <label htmlFor="phone">{t("Mobile number")}</label>
        <div className="field">
          <span className="strong" style={{ fontSize: 18 }}>+91</span>
          <input
            id="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            value={state.phone}
            onChange={(e) => { set({ phone: digits(e.target.value, 10) }); setError(false); }}
          />
        </div>
        {error && <div role="alert" className="error">{t("Enter a 10-digit mobile number.")}</div>}
        {problem && <div role="alert" className="error">{problem}</div>}
        <button type="submit" className="btn btn-primary" style={{ marginTop: 8 }} disabled={busy}>{busy ? t("Sending…") : t("Send OTP")}</button>
        <button type="button" className="link-btn small" onClick={demo}>{t("Try the demo (sample data, no account)")}</button>
      </div>
      <div className="spacer" />
      {/* The caregiver app lives on the same site, at /caregiver/. */}
      <a className="link-btn small" href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/caregiver/`}>{t("Are you a nurse or compounder? Work with us")}</a>
      <p className="tiny muted">{t("Your name, family and addresses are saved to your account. Caregivers, bookings and ratings are still examples while we finish the app.")}</p>
    </form>
  );
}

export function OtpScreen() {
  const { state, set, go, signedIn } = useApp();
  const [otp, setOtp] = useState("");
  const [error, setError] = useState(false);
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(60); // seconds before a new code can be asked for
  const live = state.mode === "live";
  useEffect(() => {
    if (!live || wait <= 0) return;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [live, wait]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setProblem("");
    if (otp.length !== 6) return setError(true);
    if (!live) {
      // Demo: any 6 digits pass. First login asks for a name and consent; returning users go straight in.
      set({ screen: state.profileDone ? "home" : "setup", trail: [] });
      return;
    }
    setBusy(true);
    const { data, error: err } = await db("patient").auth.verifyOtp({ phone: intlPhone(state.phone), token: otp, type: "sms" });
    if (err || !data.user) { setBusy(false); setProblem(authMessage(authProblem(err))); return; }
    try {
      await signedIn(data.user.id);
    } catch (e2) {
      setBusy(false);
      setProblem(authMessage(authProblem(e2)));
    }
  };
  const resend = async () => {
    setProblem("");
    const { error: err } = await db("patient").auth.signInWithOtp({ phone: intlPhone(state.phone) });
    if (err) setProblem(authMessage(authProblem(err)));
    else setWait(60);
  };

  return (
    <form className="screen screen-white" onSubmit={submit} noValidate>
      <Header title="" onBack={() => go("login")} />
      <div className="scroll gap-lg" style={{ padding: "16px 24px 24px" }}>
        <div className="stack" style={{ gap: 8 }}>
          <h1 style={{ fontSize: 30 }}>{t("Enter the 6-digit code")}</h1>
          <p className="muted">{t("Sent by SMS to +91 {phone}", { phone: state.phone })}</p>
        </div>
        <div className="stack" style={{ gap: 8 }}>
          <label htmlFor="otp">{t("One-time code")}</label>
          <input
            id="otp"
            className="otp-input"
            type="tel"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={otp}
            onChange={(e) => { setOtp(digits(e.target.value, 6)); setError(false); }}
          />
          {error && <div role="alert" className="error">{t("Enter all 6 digits of the code.")}</div>}
          {problem && <div role="alert" className="error">{problem}</div>}
          {live ? (
            wait > 0
              ? <p className="small muted">{t("You can ask for a new code in {n} seconds.", { n: wait })}</p>
              : <button type="button" className="link-btn small" onClick={resend}>{t("Send a new code")}</button>
          ) : <p className="small muted">{t("Demo: any 6 digits work.")}</p>}
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? t("Checking…") : t("Verify and continue")}</button>
      </div>
    </form>
  );
}

/* First login only: the person's name, and the one consent the app cannot work without. */
export function SetupScreen() {
  const { state, set, open } = useApp();
  const [tried, setTried] = useState(false);
  const name = state.nameDraft.trim();
  // One tick covers both required consents: the terms and privacy policy, and storing health details.
  const agreed = state.consent.terms && state.consent.health;
  const setAgreed = (value: boolean) => set({ consent: { terms: value, health: value, updates: false } });

  const nameError = tried && name.length < 2 ? t("Enter your name.") : undefined;
  const consentMissing = tried && !agreed;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (name.length < 2 || !agreed) return;
    // TODO: save the profile and the consent (with date and time) through the API.
    set({
      patients: [{ id: "me", name, relation: SELF, age: null, gender: "" }],
      patientId: "me",
      profileDone: true,
      // Next step: the first address. Back or Skip from there lands on Home.
      screen: "address",
      editingId: null,
      trail: ["home"],
    });
  };

  return (
    <form className="screen screen-white" onSubmit={submit} noValidate>
      <div className="scroll gap-lg" style={{ padding: "40px 24px 24px" }}>
        <div className="stack" style={{ gap: 8 }}>
          <h1 style={{ fontSize: 30 }}>{t("Welcome. What should we call you?")}</h1>
          <p className="muted">{t("Nurses see this name when they come to your home.")}</p>
        </div>

        <TextField
          id="full-name"
          label={t("Your full name")}
          value={state.nameDraft}
          onChange={(value) => set({ nameDraft: value })}
          error={nameError}
          autoComplete="name"
        />

        <div className="stack">
          <CheckRow id="consent-all" checked={agreed} onChange={setAgreed}>
            {t("I agree to the Terms of Use and the Privacy Policy, and I allow my health details (prescriptions, visit notes and readings) to be stored and shown to the caregiver I book.")}
          </CheckRow>
          {consentMissing && (
            <div role="alert" className="error">{t("Tick the box to continue. The app cannot book a visit without it.")}</div>
          )}
          <p className="small muted">
            {t("Read:")}{" "}
            <button type="button" className="text-link" onClick={() => open("legal", { legalDoc: "terms" })}>{t("Terms of Use")}</button>
            {" · "}
            <button type="button" className="text-link" onClick={() => open("legal", { legalDoc: "privacy" })}>{t("Privacy Policy")}</button>
          </p>
        </div>

        <button type="submit" className="btn btn-primary">{t("Continue")}</button>
      </div>
    </form>
  );
}
