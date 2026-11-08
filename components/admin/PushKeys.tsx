"use client";

// ADMIN → Settings → Notifications (phase 8): make the push keys and see what is still to set up in Supabase.
// The public key is saved in settings (the apps read it); the private key is shown once, to paste into the
// "push" Edge Function's secrets. It is not saved anywhere else.

import { useEffect, useState } from "react";
import { db } from "@/lib/supabase";
import { useAdmin } from "@/lib/admin/store";
import { useToast } from "./ui";

const b64u = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** A new VAPID key pair (P-256), as the push function expects: public = raw point, private = the JWK "d". */
export async function makePushKeys() {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const pub = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  return { publicKey: b64u(pub), privateKey: String(jwk.d) };
}

function Copy({ text, label }: { text: string; label: string }) {
  const toast = useToast();
  return (
    <button type="button" className="abtn abtn-sm" onClick={() => { navigator.clipboard?.writeText(text).then(() => toast(`${label} copied`), () => toast("Select the text and copy it")); }}>
      Copy
    </button>
  );
}

export function PushKeys() {
  const { state, log } = useAdmin();
  const live = state.mode === "live";
  const toast = useToast();
  const [current, setCurrent] = useState<string | null>(null);
  const [made, setMade] = useState<{ publicKey: string; privateKey: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (!live) return;
    db("admin").from("settings").select("value").eq("key", "push").maybeSingle()
      .then(({ data }) => setCurrent(String((data?.value as { publicKey?: string } | null)?.publicKey ?? "")), () => setCurrent(""));
  }, [live]);

  if (!live) return <div className="anote info adm-small">Sign in with a team account to set up notifications. The demo shows notifications inside the apps only.</div>;

  const make = async () => {
    setBusy(true);
    try {
      const keys = await makePushKeys();
      const { error } = await db("admin").from("settings").upsert({ key: "push", value: { publicKey: keys.publicKey } });
      if (error) throw error;
      setMade(keys); setCurrent(keys.publicKey); setConfirm(false);
      log("Made new push keys for phone notifications", "settings");
    } catch {
      toast("Could not save. Only an owner can change settings; check the internet and try again.");
    }
    setBusy(false);
  };

  return (
    <div className="adm-col" style={{ gap: 14 }}>
      <p className="adm-small" style={{ margin: 0 }}>
        Every notification the apps show (new request, accepted, on the way, arrived, visit record, cancelled, payout, verification decisions)
        can also ring the phone, even when the app is closed. Patients and caregivers switch it on in their Profile.
      </p>
      <div className={`anote ${current ? "ok" : "info"} adm-small`} role="status">
        {current === null ? "Reading…" : current ? <><b>Push keys are made.</b> The apps offer &ldquo;Turn on notifications&rdquo;.</> : <><b>No push keys yet.</b> The apps do not offer notifications until you make them (step 1).</>}
      </div>

      <ol className="adm-small adm-steps" style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 8 }}>
        <li><b>Run</b> <code>supabase/006_notifications.sql</code> in the SQL Editor (shows &ldquo;Notification tables are ready&rdquo;).</li>
        <li>
          <b>Make the keys here</b>, then copy both into Supabase → Edge Functions → Secrets as <code>VAPID_PUBLIC_KEY</code> and <code>VAPID_PRIVATE_KEY</code>.
          Also add <code>VAPID_SUBJECT</code> = <code>mailto:</code> followed by your support email.
        </li>
        <li><b>Deploy the &ldquo;push&rdquo; Edge Function</b> (Edge Functions → Deploy a new function → Via editor → name <code>push</code> → paste <code>supabase/functions/push/index.ts</code> → Deploy), then in its settings switch <b>off</b> &ldquo;Verify JWT&rdquo;.</li>
        <li><b>Add a Database Webhook</b>: Database → Webhooks → Create: table <code>notifications</code>, event <i>Insert</i>, type <i>Supabase Edge Functions</i>, function <code>push</code>, method POST.</li>
        <li><b>Test:</b> turn on notifications in the caregiver app (Profile), close the app, and approve or message that caregiver here.</li>
      </ol>

      {made ? (
        <div className="acard adm-col" style={{ gap: 10, background: "var(--warn-bg, #FFF7E6)" }}>
          <b>Copy these now. The private key is shown only this once.</b>
          <label className="ainput-label" htmlFor="push-pub">VAPID_PUBLIC_KEY</label>
          <div className="adm-row" style={{ gap: 8, flexWrap: "nowrap" }}><input id="push-pub" className="ainput" readOnly value={made.publicKey} onFocus={(e) => e.target.select()} /><Copy text={made.publicKey} label="Public key" /></div>
          <label className="ainput-label" htmlFor="push-priv">VAPID_PRIVATE_KEY (secret: only into Supabase secrets, never in GitHub or a chat)</label>
          <div className="adm-row" style={{ gap: 8, flexWrap: "nowrap" }}><input id="push-priv" className="ainput" readOnly value={made.privateKey} onFocus={(e) => e.target.select()} /><Copy text={made.privateKey} label="Private key" /></div>
          <button type="button" className="abtn" onClick={() => setMade(null)}>I have copied both</button>
        </div>
      ) : current && !confirm ? (
        <div><button type="button" className="abtn" onClick={() => setConfirm(true)}>Make new keys…</button></div>
      ) : (
        <div className="adm-col" style={{ gap: 8 }}>
          {current && <div className="anote danger adm-small" role="alert">New keys stop notifications on every phone until each person turns them on again, and the secrets in Supabase must be replaced. Only do this if the private key was lost or leaked.</div>}
          <div className="adm-row" style={{ gap: 8 }}>
            <button type="button" className="abtn abtn-primary" disabled={busy} onClick={make}>{busy ? "Making…" : current ? "Yes, make new keys" : "Make push keys"}</button>
            {current && <button type="button" className="abtn" onClick={() => setConfirm(false)}>Cancel</button>}
          </div>
        </div>
      )}

      <h3 style={{ margin: "8px 0 0" }}>Sign-in codes by SMS (real phone numbers)</h3>
      <p className="adm-small" style={{ margin: 0 }}>
        Until this is done, only the test numbers in Supabase can sign in. In India every SMS needs DLT registration (sender ID and an OTP template).
        Then either pick Twilio, MessageBird, Vonage or Textlocal in Authentication → Sign In / Providers → Phone, or use MSG91 through the
        <code> send-sms</code> Edge Function (steps at the top of <code>supabase/functions/send-sms/index.ts</code>).
      </p>
    </div>
  );
}
