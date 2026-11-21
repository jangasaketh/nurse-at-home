"use client";

// ADMIN → Settings → Notifications (phase 8; 1.9.1): make the push keys. The "push-setup" server program makes
// them inside Supabase; the public key goes to settings (the apps read it), the private key into the Vault.

import { useEffect, useState } from "react";
import { db } from "@/lib/supabase";
import { useAdmin } from "@/lib/admin/store";
import { useToast } from "./ui";

export function PushKeys() {
  const { state, log } = useAdmin();
  const live = state.mode === "live";
  const toast = useToast();
  const [ready, setReady] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  // 1.9.1: the keys are made inside Supabase (push-setup) and the private one stays in the database Vault.
  const check = () => db("admin").rpc("push_ready").then(({ data, error }) => setReady(error ? false : data === true), () => setReady(false));
  useEffect(() => { if (live) void check(); }, [live]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!live) return <div className="anote info adm-small">Sign in with a team account to set up notifications. The demo shows notifications inside the apps only.</div>;

  const make = async () => {
    setBusy(true);
    const { error } = await db("admin").functions.invoke("push-setup", { body: {} });
    if (error) {
      const status = (error as { context?: Response }).context?.status;
      toast(status === 403 ? "Only an owner can make new push keys." : status === 404 ? "The push-setup server program is not deployed yet (see supabase/README.md)." : "Could not make the keys. Check the internet and try again.");
    } else {
      log(ready ? "Made new push keys for phone notifications" : "Made the push keys for phone notifications", "settings");
      toast("Push keys made. Each person turns on notifications in their Profile.");
      setConfirm(false);
      await check();
    }
    setBusy(false);
  };

  return (
    <div className="adm-col" style={{ gap: 14 }}>
      <p className="adm-small" style={{ margin: 0 }}>
        Every notification the apps show (new request, accepted, on the way, arrived, visit record, cancelled, payout, verification decisions)
        can also ring the phone, even when the app is closed. Patients and caregivers switch it on in their Profile.
      </p>
      <div className={`anote ${ready ? "ok" : "info"} adm-small`} role="status">
        {ready === null ? "Reading…" : ready ? <><b>Phone notifications are set up.</b> The apps offer &ldquo;Turn on notifications&rdquo; in Profile.</> : <><b>Not set up yet.</b> Press &ldquo;Make push keys&rdquo; below. Everything else is done by the server.</>}
      </div>

      {ready && !confirm ? (
        <div><button type="button" className="abtn" onClick={() => setConfirm(true)}>Make new keys…</button></div>
      ) : (
        <div className="adm-col" style={{ gap: 8 }}>
          {ready && <div className="anote danger adm-small" role="alert">New keys stop notifications on every phone until each person turns them on again. Only do this if you think the keys leaked.</div>}
          <div className="adm-row" style={{ gap: 8 }}>
            <button type="button" className="abtn abtn-primary" disabled={busy || ready === null} onClick={() => void make()}>{busy ? "Making…" : ready ? "Yes, make new keys" : "Make push keys"}</button>
            {ready && <button type="button" className="abtn" onClick={() => setConfirm(false)}>Cancel</button>}
          </div>
        </div>
      )}

      <p className="adm-small adm-muted" style={{ margin: 0 }}>
        <b>To test:</b> in the caregiver app, Profile → Turn on notifications (on iPhone, first add the app to the Home Screen). Close the app, then approve
        that caregiver or send them a message from here. The keys are kept encrypted in Supabase; nobody needs to copy them.
      </p>

      <h3 style={{ margin: "8px 0 0" }}>Sign-in codes by SMS (real phone numbers)</h3>
      <p className="adm-small" style={{ margin: 0 }}>
        Until this is done, only the test numbers in Supabase can sign in. In India every SMS needs DLT registration (sender ID and an OTP template).
        Then either pick Twilio, MessageBird, Vonage or Textlocal in Authentication → Sign In / Providers → Phone, or use MSG91 through the
        <code> send-sms</code> Edge Function (steps at the top of <code>supabase/functions/send-sms/index.ts</code>).
      </p>
    </div>
  );
}
