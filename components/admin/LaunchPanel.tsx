"use client";

// ADMIN → Settings → Launch (1.8.0): the "Try the demo" switch, and a go-live checklist that checks what it
// can by itself (database parts run, keys made, server programs deployed) and lists the rest.

import { useEffect, useState } from "react";
import { db } from "@/lib/supabase";
import { useAdmin } from "@/lib/admin/store";
import { Badge, useToast } from "./ui";

type Check = { label: string; ok: boolean | null; how: string };

async function functionState(name: string, body: Record<string, unknown>): Promise<"missing" | "not-set-up" | "ready" | "unknown"> {
  const { error } = await db("admin").functions.invoke(name, { body });
  if (!error) return "ready";
  const status = (error as { context?: Response }).context?.status;
  if (status === 404) return "missing";
  if (status === 503) return "not-set-up";
  if (status === 400 || status === 401 || status === 403 || status === 409) return "ready";
  return "unknown";
}

export function LaunchPanel() {
  const { state, log } = useAdmin();
  const live = state.mode === "live";
  const toast = useToast();
  const [demo, setDemo] = useState<boolean | null>(null);
  const [checks, setChecks] = useState<Check[] | null>(null);

  const run = async () => {
    setChecks(null);
    const a = db("admin");
    const [settings, pins, push, tickets] = await Promise.all([
      a.from("settings").select("key, value"),
      a.from("addresses").select("lat").limit(1),
      a.from("push_subscriptions").select("id").limit(1),
      a.rpc("admin_dashboard"),
    ]);
    const v = (k: string) => (settings.data ?? []).find((r) => r.key === k)?.value as Record<string, unknown> | undefined;
    setDemo(v("demo")?.show !== false);
    const [pay, pushFn, callFn] = await Promise.all([
      functionState("payments", { action: "check" }).catch(() => "unknown" as const),
      functionState("push", {}).catch(() => "unknown" as const),
      functionState("call", {}).catch(() => "unknown" as const),
    ]);
    const fn = (s: string) => (s === "ready" ? true : s === "unknown" ? null : false);
    setChecks([
      { label: "Database parts 1 to 5 (bookings, payments)", ok: !!v("payments") || !settings.error, how: "Run 001 to 005 in the SQL Editor." },
      { label: "Database part 6 (notifications)", ok: !push.error, how: "Run supabase/006_notifications.sql." },
      { label: "Database part 7 (maps and calls)", ok: !pins.error, how: "Run supabase/007_maps_calls.sql." },
      { label: "Database part 8 (support, real figures, this checklist)", ok: !tickets.error && !!v("demo"), how: "Run supabase/008_launch.sql." },
      { label: "Online payment switched on", ok: v("payments")?.enabled === true, how: "Settings → Payments, after the payments function and Razorpay keys are set." },
      { label: "Payments server program deployed with Razorpay keys", ok: fn(pay), how: "Edge Function payments + RAZORPAY_* secrets (supabase/README.md). Use live keys after Razorpay approves the business." },
      { label: "Push keys made", ok: !!(v("push")?.publicKey), how: "Settings → Notifications and SMS → Make push keys." },
      { label: "Push server program deployed", ok: fn(pushFn), how: "Edge Function push + VAPID_* secrets + the Database Webhook." },
      { label: "Private calls set up (Exotel)", ok: callFn === "ready" ? true : callFn === "not-set-up" || callFn === "missing" ? false : null, how: "Edge Function call + EXOTEL_* secrets." },
      { label: "“Try the demo” hidden from the login screens", ok: v("demo")?.show === false, how: "Switch it off above when real users start." },
    ]);
  };
  useEffect(() => { if (live) void run(); }, [live]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!live) return <div className="anote info adm-small">Sign in with a team account to see the launch checklist.</div>;

  const setShow = async (show: boolean) => {
    const before = demo;
    setDemo(show);
    const { error } = await db("admin").from("settings").upsert({ key: "demo", value: { show } });
    if (error) { setDemo(before); toast("Could not save. Only an owner can change this, and supabase/008_launch.sql must be run."); return; }
    log(show ? "Showed “Try the demo” on the login screens" : "Hid “Try the demo” from the login screens", "settings");
    toast(show ? "“Try the demo” is shown again" : "“Try the demo” is hidden. The apps pick this up when the login screen opens.");
    void run();
  };

  return (
    <div className="adm-col" style={{ gap: 16 }}>
      <section className="adm-col" style={{ gap: 8 }}>
        <h3 style={{ margin: 0 }}>“Try the demo” on the login screens</h3>
        <label className="adm-row" htmlFor="st-demo" style={{ gap: 10 }}>
          <input id="st-demo" type="checkbox" style={{ width: 18, minHeight: 18 }} checked={demo ?? true} disabled={demo === null} onChange={(e) => void setShow(e.target.checked)} />
          <span>Show the demo link (sample data, no account) on the patient, caregiver and admin login screens. Switch it off before real users start.</span>
        </label>
      </section>

      <section className="adm-col" style={{ gap: 8 }}>
        <div className="adm-row" style={{ justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>Checked automatically</h3>
          <button type="button" className="abtn abtn-sm" onClick={() => void run()}>Check again</button>
        </div>
        {!checks ? <p className="adm-muted">Checking…</p> : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
            {checks.map((c) => (
              <li key={c.label} className="adm-row" style={{ gap: 10, alignItems: "flex-start", flexWrap: "nowrap" }}>
                <Badge tone={c.ok === true ? "ok" : c.ok === false ? "warn" : "muted"}>{c.ok === true ? "Done" : c.ok === false ? "To do" : "Unknown"}</Badge>
                <span className="adm-col" style={{ gap: 2 }}><span className="adm-strong">{c.label}</span>{c.ok !== true && <span className="adm-small adm-muted">{c.how}</span>}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="adm-col" style={{ gap: 8 }}>
        <h3 style={{ margin: 0 }}>To do outside the app (cannot be checked from here)</h3>
        <ol className="adm-small" style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6 }}>
          <li><b>SMS sign-in for real numbers:</b> DLT registration, then an SMS provider (Settings → Notifications and SMS).</li>
          <li><b>Remove the test phone numbers</b> in Supabase → Authentication → Sign In / Providers → Phone.</li>
          <li><b>Supabase Pro plan</b> (the free plan pauses after a week without use) and daily backups switched on.</li>
          <li><b>Two-step sign-in</b> for every team member (Supabase → Authentication → Multi-Factor), and strong passwords.</li>
          <li><b>Razorpay live keys</b> after business verification; replace the test keys and the webhook in live mode.</li>
          <li><b>Terms of Use, Privacy Policy, Caregiver Terms</b> written by a lawyer, replacing the placeholder text in the apps.</li>
          <li><b>Support phone, WhatsApp and email</b>: replace the placeholders (lib/data.ts → SUPPORT).</li>
          <li><b>Prices, charges and pay split</b> decided and set in Settings.</li>
          <li><b>Telugu and Kannada text</b> checked by native speakers.</li>
          <li><b>Map tiles</b> from a provider (NEXT_PUBLIC_MAP_TILES), and your own domain for the site.</li>
          <li><b>First caregivers</b> verified and online in the launch city before opening to patients.</li>
        </ol>
      </section>
    </div>
  );
}
