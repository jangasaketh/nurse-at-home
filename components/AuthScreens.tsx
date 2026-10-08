"use client";

import { useState, type FormEvent } from "react";
import { useApp } from "@/lib/store";
import { SELF } from "@/lib/booking";
import { LANGS, t } from "@/lib/i18n";
import { Icon } from "./Icon";
import { CheckRow, Header, TextField } from "./ui";

const digits = (value: string, max: number) => value.replace(/\D/g, "").slice(0, max);

/** English / తెలుగు / ಕನ್ನಡ. Each name is written in its own script so people can find theirs. */
export function LanguagePicker() {
  const { state, set } = useApp();
  return (
    <div className="lang-row" role="group" aria-label="Language / భాష / ಭಾಷೆ">
      {LANGS.map((l) => (
        <button key={l.id} type="button" className="chip" lang={l.id} aria-pressed={state.lang === l.id} onClick={() => set({ lang: l.id })}>
          {l.label}
        </button>
      ))}
    </div>
  );
}

export function LoginScreen() {
  const { state, set } = useApp();
  const [error, setError] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (state.phone.length === 10) set({ screen: "otp", trail: [] });
    else setError(true);
  };

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
        <button type="submit" className="btn btn-primary" style={{ marginTop: 8 }}>{t("Send OTP")}</button>
      </div>
      <div className="spacer" />
      <p className="tiny muted">{t("Prototype. Caregivers, prices and ratings are examples. What you enter stays on this device.")}</p>
    </form>
  );
}

export function OtpScreen() {
  const { state, set, go } = useApp();
  const [otp, setOtp] = useState("");
  const [error, setError] = useState(false);

  // No SMS is sent yet. Any 6 digits pass until the backend checks the real code.
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (otp.length !== 6) return setError(true);
    // First login asks for a name and consent. Returning users go straight in.
    set({ screen: state.profileDone ? "home" : "setup", trail: [] });
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
          <p className="small muted">{t("Prototype: any 6 digits work.")}</p>
        </div>
        <button type="submit" className="btn btn-primary">{t("Verify and continue")}</button>
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
