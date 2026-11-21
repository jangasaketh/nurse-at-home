"use client";

// "Your sign-in" (1.9.0): every team member can set up two-step sign-in with an authenticator app here,
// and change their password.

import { useEffect, useState } from "react";
import { finishSetup, setNewPassword, startSetup, turnOff, verifiedFactor } from "@/lib/admin/security";
import { useAdmin } from "@/lib/admin/store";
import { Badge, Drawer, Field, useToast } from "./ui";

export function SecurityDrawer({ onClose }: { onClose: () => void }) {
  const { state, log } = useAdmin();
  const toast = useToast();
  const [factor, setFactor] = useState<{ id: string; name: string } | null | undefined>(undefined);
  const [setup, setSetup] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwProblem, setPwProblem] = useState("");

  const refresh = () => verifiedFactor().then(setFactor, () => setFactor(null));
  useEffect(() => { void refresh(); }, []);

  const begin = async () => {
    setBusy(true); setProblem("");
    try { setSetup(await startSetup()); setCode(""); }
    catch (e) { setProblem(`Could not start: ${(e as Error).message}. Two-step sign-in may be switched off in Supabase (Authentication → Multi-Factor).`); }
    setBusy(false);
  };
  const confirm = async () => {
    if (!setup) return;
    if (!/^\d{6}$/.test(code.trim())) { setProblem("Enter the 6-digit code your app shows."); return; }
    setBusy(true); setProblem("");
    try {
      await finishSetup(setup.factorId, code);
      setSetup(null);
      await refresh();
      log("Turned on two-step sign-in for their login", "team");
      toast("Two-step sign-in is on. From now on you also need the code when signing in.");
    } catch { setProblem("That code is not right. Check the phone’s time is set automatically, and use the newest code."); }
    setBusy(false);
  };
  const off = async () => {
    if (!factor) return;
    setBusy(true); setProblem("");
    try { await turnOff(factor.id); await refresh(); log("Turned off two-step sign-in for their login", "team"); toast("Two-step sign-in is off."); }
    catch { setProblem("Could not turn it off. Sign out, sign in again with the code, and try again."); }
    setBusy(false);
  };
  const changePassword = async () => {
    setPwProblem("");
    if (pw1.length < 10) { setPwProblem("Use at least 10 characters."); return; }
    if (pw1 !== pw2) { setPwProblem("The two passwords are not the same."); return; }
    setBusy(true);
    try { await setNewPassword(pw1); setPw1(""); setPw2(""); toast("Password changed."); }
    catch (e) { setPwProblem(/weak|pwned|leaked/i.test((e as Error).message) ? "That password is too easy to guess or has leaked online. Choose another." : `Could not change it: ${(e as Error).message}`); }
    setBusy(false);
  };

  return (
    <Drawer label="Your sign-in" title="Your sign-in" sub={`${state.adminName} · ${state.adminEmail}`} onClose={onClose} narrow>
      <div className="adm-col" style={{ gap: 18 }}>
        <section className="adm-col" style={{ gap: 10 }}>
          <div className="adm-row" style={{ justifyContent: "space-between" }}>
            <h3 style={{ margin: 0 }}>Two-step sign-in</h3>
            {factor === undefined ? null : <Badge tone={factor ? "ok" : "warn"}>{factor ? "On" : "Off"}</Badge>}
          </div>
          <p className="adm-small adm-muted" style={{ margin: 0 }}>
            After your password, the panel also asks for a 6-digit code from an app on your phone (Google Authenticator, Microsoft Authenticator or 1Password).
            Someone who steals your password still cannot get in. Every team member should turn this on before launch.
          </p>
          {problem && <div className="anote danger" role="alert">{problem}</div>}
          {factor === null && !setup && <button type="button" className="abtn abtn-primary" disabled={busy} onClick={() => void begin()}>Set up two-step sign-in</button>}
          {setup && (
            <div className="adm-col" style={{ gap: 10 }}>
              <span className="adm-small"><b>1.</b> In the authenticator app, add an account and scan this code:</span>
              <img src={setup.qr} alt="QR code for the authenticator app" width={180} height={180} style={{ background: "#fff", padding: 8, borderRadius: 8, alignSelf: "flex-start" }} />
              <span className="adm-small">Cannot scan? Type this key instead: <code style={{ wordBreak: "break-all" }}>{setup.secret}</code></span>
              <span className="adm-small"><b>2.</b> Type the 6-digit code the app now shows:</span>
              <Field id="mfa-code" label="6-digit code" value={code} onChange={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" />
              <div className="adm-row" style={{ gap: 8 }}>
                <button type="button" className="abtn abtn-primary" disabled={busy} onClick={() => void confirm()}>Turn on</button>
                <button type="button" className="abtn" onClick={() => { setSetup(null); setProblem(""); }}>Cancel</button>
              </div>
            </div>
          )}
          {factor && <button type="button" className="abtn" disabled={busy} onClick={() => void off()}>Turn off two-step sign-in</button>}
        </section>

        <section className="adm-col" style={{ gap: 10 }}>
          <h3 style={{ margin: 0 }}>Change your password</h3>
          <Field id="pw-1" label="New password (at least 10 characters)" type="password" value={pw1} onChange={setPw1} autoComplete="new-password" />
          <Field id="pw-2" label="New password again" type="password" value={pw2} onChange={setPw2} autoComplete="new-password" />
          {pwProblem && <div className="anote danger" role="alert">{pwProblem}</div>}
          <button type="button" className="abtn" disabled={busy} onClick={() => void changePassword()}>Change password</button>
        </section>
      </div>
    </Drawer>
  );
}
