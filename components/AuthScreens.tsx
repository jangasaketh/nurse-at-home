"use client";

import { useState, type FormEvent } from "react";
import { useApp } from "@/lib/store";
import { Icon } from "./Icon";
import { Header } from "./ui";

const digits = (value: string, max: number) => value.replace(/\D/g, "").slice(0, max);

export function LoginScreen() {
  const { state, set } = useApp();
  const [error, setError] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (state.phone.length === 10) set({ screen: "otp" });
    else setError(true);
  };

  return (
    <form className="screen screen-white login" onSubmit={submit} noValidate>
      <div className="row-inline" style={{ gap: 10 }}>
        <div className="logo"><Icon name="logo" size={24} /></div>
        <div className="brand">Nurse at Home</div>
      </div>
      <div className="stack">
        <h1>A verified nurse at your door.</h1>
        <p className="muted" style={{ fontSize: 17 }}>
          Injections, IV drips, wound dressing and medication visits at home.
        </p>
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <label htmlFor="phone">Mobile number</label>
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
        {error && <div role="alert" className="error">Enter a 10-digit mobile number.</div>}
        <button type="submit" className="btn btn-primary" style={{ marginTop: 8 }}>Send OTP</button>
      </div>
      <div className="spacer" />
      <p className="tiny muted">Sample prototype. Names, prices and ratings are examples, and nothing is saved.</p>
    </form>
  );
}

export function OtpScreen() {
  const { state, go } = useApp();
  const [otp, setOtp] = useState("");
  const [error, setError] = useState(false);

  // No SMS is sent yet. Any 6 digits pass until the backend checks the real code.
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (otp.length === 6) go("home");
    else setError(true);
  };

  return (
    <form className="screen screen-white" onSubmit={submit} noValidate>
      <Header title="" onBack={() => go("login")} />
      <div className="scroll gap-lg" style={{ padding: "16px 24px 24px" }}>
        <div className="stack" style={{ gap: 8 }}>
          <h1 style={{ fontSize: 30 }}>Enter the 6-digit code</h1>
          <p className="muted">Sent by SMS to +91 {state.phone}</p>
        </div>
        <div className="stack" style={{ gap: 8 }}>
          <label htmlFor="otp">One-time code</label>
          <input
            id="otp"
            className="otp-input"
            type="tel"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={otp}
            onChange={(e) => { setOtp(digits(e.target.value, 6)); setError(false); }}
          />
          {error && <div role="alert" className="error">Enter all 6 digits of the code.</div>}
          <p className="small muted">Prototype: any 6 digits work.</p>
        </div>
        <button type="submit" className="btn btn-primary">Verify and continue</button>
      </div>
    </form>
  );
}
