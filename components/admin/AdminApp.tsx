"use client";

// ADMIN PANEL: sign-in, side menu and the page switch. Served at /admin/ (see app/admin/page.tsx).

import { useDemoAllowed } from "@/lib/launch";
import { useEffect, useState } from "react";
import { loadDashboard, type LiveDashboard } from "@/lib/admin/live";
import { SecurityDrawer } from "./SecurityDrawer";
import { checkCode, needsCode, recoveryLinkFailed, sendPasswordReset, setNewPassword, takeRecoveryLink } from "@/lib/admin/security";
import { AdminProvider, useAdmin } from "@/lib/admin/store";
import { canOpen, ROLE_HELP, ROLE_PAGES, ROLE_TEXT, type AdminPage, type AdminRole } from "@/lib/admin/data";
import { Icon, type IconName } from "../Icon";
import { Field, ToastProvider } from "./ui";
import { db } from "@/lib/supabase";
import { DashboardPage } from "./DashboardPage";
import { VerificationPage } from "./VerificationPage";
import { CaregiversPage } from "./CaregiversPage";
import { BookingsPage, RefundsPage } from "./BookingsPages";
import { SupportPage } from "./SupportPage";
import { PayoutsPage } from "./PayoutsPage";
import { SettingsPage } from "./SettingsPage";
import { ActivityPage } from "./ActivityPage";
import { PatientsPage } from "./PatientsPage";
import { MessagesPage } from "./MessagesPage";
import { ReportsPage } from "./ReportsPage";
import { TeamPage } from "./TeamPage";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const NAV: { id: AdminPage; label: string; icon: IconName }[] = [
  { id: "dashboard", label: "Dashboard", icon: "home" },
  { id: "verification", label: "Verification", icon: "shield" },
  { id: "caregivers", label: "Caregivers", icon: "user" },
  { id: "patients", label: "Patients", icon: "heart" },
  { id: "bookings", label: "Bookings", icon: "calendar" },
  { id: "refunds", label: "Refunds", icon: "wallet" },
  { id: "support", label: "Support", icon: "message" },
  { id: "messages", label: "Messages", icon: "bell" },
  { id: "payouts", label: "Payouts", icon: "download" },
  { id: "reports", label: "Reports", icon: "file" },
  { id: "settings", label: "Settings", icon: "edit" },
  { id: "team", label: "Team", icon: "shield" },
  { id: "activity", label: "Activity log", icon: "clock" },
];

type Member = { id: string; name: string; email: string; role: AdminRole };

function LoginPage() {
  const { state, set } = useAdmin();
  const [step, setStep] = useState<"login" | "code" | "forgot" | "forgot-sent" | "reset">("login");
  const [problem, setProblem] = useState("");
  const [notice, setNotice] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [code, setCode] = useState("");
  const [member, setMember] = useState<Member | null>(null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const errors = {
    email: !/^\S+@\S+\.\S+$/.test(email) ? "Enter your work email." : "",
    password: password.length < 6 ? "Enter your password (at least 6 characters)." : "",
  };
  // Demo: the sample admin and sample team, with sample data. Nothing is saved to the database.
  const demo = (name: string, role: AdminRole, mail: string) => set({ signedIn: true, mode: "demo", userId: null, adminName: name, adminEmail: mail, role, page: "dashboard" });
  const demoAllowed = useDemoAllowed("admin");

  // Opened from the password reset email?
  useEffect(() => {
    const check = () => {
      if (recoveryLinkFailed()) { setStep("login"); setProblem("That reset link has expired or was already used. Ask for a new one below."); return; }
      takeRecoveryLink().then((ok) => { if (ok) { setStep("reset"); setPassword(""); setProblem(""); } }, () => {});
    };
    check();
    window.addEventListener("hashchange", check); // the link opened in a tab that already shows this page
    return () => window.removeEventListener("hashchange", check);
  }, []);

  const finish = (m: Member) => set({ signedIn: true, mode: "live", userId: m.id, adminName: m.name, adminEmail: m.email, role: m.role, page: "dashboard" });

  // Real sign-in: the email and password of a login made in Supabase, for someone in the team list.
  const submit = async () => {
    setTried(true);
    setProblem(""); setNotice("");
    if (errors.email || errors.password) return;
    setBusy(true);
    const client = db("admin");
    const { data, error } = await client.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error || !data.user) {
      setBusy(false);
      setProblem(/invalid|credentials/i.test(error?.message ?? "") ? "That email and password do not match a team login." : /fetch|network/i.test(error?.message ?? "") ? "No internet connection. Check it and try again." : `Could not sign in: ${error?.message ?? "unknown problem"}`);
      return;
    }
    const { data: row, error: mErr } = await client.from("admin_users").select("name, email, role, active").eq("id", data.user.id).maybeSingle();
    if (mErr || !row) {
      setBusy(false);
      await client.auth.signOut();
      setProblem("This login is not in the team yet. An owner adds people in Team (see the setup guide for the first owner).");
      return;
    }
    if (!row.active) {
      setBusy(false);
      await client.auth.signOut();
      setProblem("This team member’s access is switched off. Ask an owner to switch it on in Team.");
      return;
    }
    const m: Member = { id: data.user.id, name: row.name, email: row.email, role: row.role as AdminRole };
    const second = await needsCode().catch(() => false);
    setBusy(false);
    if (second) { setMember(m); setCode(""); setStep("code"); return; }
    finish(m);
  };

  const submitCode = async () => {
    setProblem("");
    if (!/^\d{6}$/.test(code.trim())) { setProblem("Enter the 6-digit code from your authenticator app."); return; }
    setBusy(true);
    try { await checkCode(code); setBusy(false); if (member) finish(member); }
    catch { setBusy(false); setProblem("That code is not right. Codes change every 30 seconds: use the newest one."); }
  };

  const sendReset = async () => {
    setTried(true); setProblem("");
    if (errors.email) return;
    setBusy(true);
    try { await sendPasswordReset(email); setStep("forgot-sent"); }
    catch (e) { setProblem(/rate|security purposes/i.test((e as Error).message) ? "Too many emails were asked for. Wait a minute and try again." : "Could not send the email. Check the internet and try again."); }
    setBusy(false);
  };

  const saveNewPassword = async () => {
    setTried(true); setProblem("");
    if (password.length < 10) { setProblem("Use at least 10 characters."); return; }
    if (password !== password2) { setProblem("The two passwords are not the same."); return; }
    setBusy(true);
    try {
      await setNewPassword(password);
      await db("admin").auth.signOut();
      setPassword(""); setPassword2(""); setTried(false);
      setStep("login");
      setNotice("Password changed. Sign in with the new password.");
    } catch (e) {
      setProblem(/same|different/i.test((e as Error).message) ? "Choose a password you have not used before." : /weak|pwned|leaked/i.test((e as Error).message) ? "That password is too easy to guess or has leaked online. Choose another." : "Could not change the password. Open the link from the email again.");
    }
    setBusy(false);
  };

  const head = (
    <div className="adm-row">
      <span className="logo" style={{ width: 40, height: 40, borderRadius: 10, background: "#0e5c4a", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="bag" size={22} /></span>
      <div><h1 style={{ fontSize: 22 }}>Nurse at Home</h1><span className="adm-muted adm-small">Team admin panel</span></div>
    </div>
  );

  if (step === "code") {
    return (
      <main className="adm-login">
        <form className="acard" onSubmit={(e) => { e.preventDefault(); void submitCode(); }} noValidate>
          {head}
          <h2 style={{ margin: 0, fontSize: 18 }}>Two-step sign-in</h2>
          <p className="adm-small adm-muted" style={{ margin: 0 }}>Open your authenticator app and type the 6-digit code for Nurse at Home.</p>
          <Field id="adm-code" label="6-digit code" value={code} onChange={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" />
          {problem && <div className="anote danger" role="alert">{problem}</div>}
          <button type="submit" className="abtn abtn-primary" disabled={busy}>{busy ? "Checking…" : "Continue"}</button>
          <button type="button" className="abtn" onClick={() => { void db("admin").auth.signOut(); setStep("login"); setProblem(""); }}>Back</button>
          <p className="adm-small adm-muted" style={{ margin: 0 }}>Lost your phone? Ask an owner to switch off your two-step sign-in (steps in supabase/README.md).</p>
        </form>
      </main>
    );
  }

  if (step === "forgot" || step === "forgot-sent") {
    return (
      <main className="adm-login">
        <form className="acard" onSubmit={(e) => { e.preventDefault(); void sendReset(); }} noValidate>
          {head}
          <h2 style={{ margin: 0, fontSize: 18 }}>Forgot your password?</h2>
          {step === "forgot-sent" ? (
            <div className="anote ok" role="status">If <b>{email.trim()}</b> is a team login, an email with a reset link is on its way. Open it on this computer within an hour. Check the spam folder too.</div>
          ) : (
            <>
              <p className="adm-small adm-muted" style={{ margin: 0 }}>Type your work email. We send a link to choose a new password.</p>
              <Field id="adm-email" label="Work email" type="email" value={email} onChange={setEmail} error={tried ? errors.email : ""} />
              {problem && <div className="anote danger" role="alert">{problem}</div>}
              <button type="submit" className="abtn abtn-primary" disabled={busy}>{busy ? "Sending…" : "Send the reset link"}</button>
            </>
          )}
          <button type="button" className="abtn" onClick={() => { setStep("login"); setProblem(""); setTried(false); }}>Back to sign in</button>
        </form>
      </main>
    );
  }

  if (step === "reset") {
    return (
      <main className="adm-login">
        <form className="acard" onSubmit={(e) => { e.preventDefault(); void saveNewPassword(); }} noValidate>
          {head}
          <h2 style={{ margin: 0, fontSize: 18 }}>Choose a new password</h2>
          <p className="adm-small adm-muted" style={{ margin: 0 }}>At least 10 characters. A password manager can make and keep one for you.</p>
          <Field id="adm-new1" label="New password" type="password" value={password} onChange={setPassword} autoComplete="new-password" />
          <Field id="adm-new2" label="New password again" type="password" value={password2} onChange={setPassword2} autoComplete="new-password" />
          {problem && <div className="anote danger" role="alert">{problem}</div>}
          <button type="submit" className="abtn abtn-primary" disabled={busy}>{busy ? "Saving…" : "Save the new password"}</button>
        </form>
      </main>
    );
  }

  return (
    <main className="adm-login">
      <form className="acard" onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate>
        {head}
        {notice && <div className="anote ok" role="status">{notice}</div>}
        <Field id="adm-email" label="Work email" type="email" value={email} onChange={setEmail} error={tried ? errors.email : ""} />
        <Field id="adm-password" label="Password" type="password" value={password} onChange={setPassword} error={tried ? errors.password : ""} />
        {problem && <div className="anote danger" role="alert">{problem}</div>}
        <button type="submit" className="abtn abtn-primary" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        <button type="button" className="alink adm-small" style={{ alignSelf: "flex-start", background: "none", border: 0, padding: 0, cursor: "pointer" }} onClick={() => { setStep("forgot"); setProblem(""); setNotice(""); setTried(false); }}>Forgot password?</button>
        {demoAllowed && <>
        <hr className="adm-sep" />
        <div className="adm-col" style={{ gap: 8 }}>
          <span className="adm-strong">Try the demo (sample data)</span>
          <span className="adm-small adm-muted">No account needed. Nothing is saved to the database.</span>
          <button type="button" className="abtn" onClick={() => demo("Admin (sample)", "owner", "admin@nurseathome.in")}>Prototype: sign in as the sample admin</button>
          <div className="adm-row" style={{ gap: 6 }}>
            {state.team.filter((m) => m.active).map((m) => (
              <button key={m.id} type="button" className="abtn abtn-sm" onClick={() => demo(m.name, m.role, m.email)}>{ROLE_TEXT[m.role].replace(" team", "")}</button>
            ))}
          </div>
        </div>
        </>}
      </form>
    </main>
  );
}

/** What the caregiver in the caregiver app (this browser) is doing, so the demo link is easy to follow. */
function LiveChip() {
  const { cg, go } = useAdmin();
  let text = "Caregiver app: nobody has signed up in this browser";
  let page: AdminPage | null = null;
  if (cg?.kycStatus === "submitted") { text = "Caregiver app: documents waiting for you"; page = "verification"; }
  else if (cg?.kycStatus === "rejected") text = "Caregiver app: a document was sent back";
  else if (cg?.kycStatus === "approved") { text = cg.suspended ? "Caregiver app: approved, paused" : cg.renewal ? "Caregiver app: renewal waiting" : "Caregiver app: approved"; page = cg.renewal ? "verification" : "caregivers"; }
  else if (cg?.role) text = "Caregiver app: filling in documents";
  return page
    ? <button type="button" className="adm-livechip" onClick={() => go(page)}><span className="dot" />{text}</button>
    : <span className="adm-livechip"><span className="dot" />{text}</span>;
}

function Denied() {
  const { state, go } = useAdmin();
  return (
    <section className="acard adenied" role="alert">
      <Icon name="shield" size={28} />
      <h2>Your role cannot open this page</h2>
      <p className="adm-muted">You are signed in as {ROLE_TEXT[state.role].toLowerCase()}: {ROLE_HELP[state.role].charAt(0).toLowerCase() + ROLE_HELP[state.role].slice(1)} Ask the owner if you need more access.</p>
      <button type="button" className="abtn abtn-primary" onClick={() => go("dashboard")}>Go to the dashboard</button>
    </section>
  );
}

function Page() {
  const { state } = useAdmin();
  if (!canOpen(state.role, state.page)) return <Denied />;
  switch (state.page) {
    case "dashboard": return <DashboardPage />;
    case "verification": return <VerificationPage />;
    case "caregivers": return <CaregiversPage />;
    case "bookings": return <BookingsPage />;
    case "refunds": return <RefundsPage />;
    case "support": return <SupportPage />;
    case "payouts": return <PayoutsPage />;
    case "settings": return <SettingsPage />;
    case "activity": return <ActivityPage />;
    case "patients": return <PatientsPage />;
    case "messages": return <MessagesPage />;
    case "reports": return <ReportsPage />;
    case "team": return <TeamPage />;
  }
}

/** Signed in: the menu counts come from the database (every 30 seconds). */
function useLiveCounts(on: boolean) {
  const [d, setD] = useState<LiveDashboard | null>(null);
  useEffect(() => {
    if (!on) { setD(null); return; }
    const read = () => loadDashboard().then(setD, () => {});
    read();
    const id = setInterval(() => { if (document.visibilityState !== "hidden") read(); }, 30000);
    return () => clearInterval(id);
  }, [on]);
  return d;
}

function Shell() {
  const { state, ready, view, go, set } = useAdmin();
  const live = useLiveCounts(state.signedIn && state.mode === "live");
  const [securityOpen, setSecurityOpen] = useState(false);
  if (!ready) return <div className="adm-splash" role="status">Loading the admin panel…</div>;
  if (!state.signedIn) return <LoginPage />;

  const waiting = view.applicants.filter((a) => !a.decision || a.live).length + view.renewals.filter((r) => !r.decision).length;
  const refunds = view.refunds.filter((r) => !r.decision).length;
  const open = view.tickets.filter((tk) => tk.status === "open");
  const urgent = open.some((tk) => tk.urgent);
  const counts: Partial<Record<AdminPage, { n: number; red?: boolean }>> = state.mode === "live"
    ? { verification: { n: live ? live.applicants + live.renewals : 0 }, refunds: { n: live?.refundsDue ?? 0 }, support: { n: live?.ticketsOpen ?? 0, red: !!live?.sosOpen } }
    : { verification: { n: waiting }, refunds: { n: refunds }, support: { n: open.length, red: urgent } };

  return (
    <div className="adm">
      <aside className="adm-side">
        <div className="adm-brand">
          <span className="logo"><Icon name="bag" size={20} /></span>
          <div><b>Nurse at Home</b><span>Admin panel</span></div>
        </div>
        <nav className="adm-nav" aria-label="Admin menu">
          {NAV.filter((item) => canOpen(state.role, item.id)).map((item) => {
            const c = counts[item.id];
            return (
              <button key={item.id} type="button" aria-current={state.page === item.id ? "page" : undefined} onClick={() => go(item.id)}>
                <Icon name={item.icon} size={18} />
                {item.label}
                {c && c.n > 0 && <span className={`count ${c.red ? "red" : ""}`} aria-label={`${c.n} waiting`}>{c.n}</span>}
              </button>
            );
          })}
        </nav>
        <div className="adm-side-foot">
          <a href={`${BASE}/`} target="_blank" rel="noreferrer">Open the patient app ↗</a>
          <a href={`${BASE}/caregiver/`} target="_blank" rel="noreferrer">Open the caregiver app ↗</a>
          <span>Version {process.env.NEXT_PUBLIC_APP_VERSION}</span>
        </div>
      </aside>
      <div className="adm-main">
        <header className="adm-top">
          <LiveChip />
          <span className="grow" />
          {state.mode === "demo" && <label className="adm-roleview" htmlFor="adm-viewas">Prototype: view as
            <select id="adm-viewas" value={state.role} onChange={(e) => { const role = e.target.value as AdminRole; set({ role, page: ROLE_PAGES[role].includes(state.page) ? state.page : "dashboard" }); }}>
              {(Object.keys(ROLE_TEXT) as AdminRole[]).map((r) => <option key={r} value={r}>{ROLE_TEXT[r]}</option>)}
            </select>
          </label>}
          <span className="adm-small adm-muted">Signed in as <b style={{ color: "var(--a-ink)" }}>{state.adminName}</b> · {ROLE_TEXT[state.role]}</span>
          {state.mode === "live" && <button type="button" className="abtn abtn-sm" onClick={() => setSecurityOpen(true)}>Your sign-in</button>}
          <button type="button" className="abtn abtn-sm" onClick={() => { if (state.mode === "live") void db("admin").auth.signOut(); set({ signedIn: false, userId: null }); }}>Sign out</button>
        </header>
        <main className="adm-content">
          {state.mode === "live" && state.page === "dashboard" && <div className="anote info adm-small">Signed in with your real team account. Every page shows real data from the database.</div>}
          <Page />
        </main>
      </div>
      {securityOpen && <SecurityDrawer onClose={() => setSecurityOpen(false)} />}
    </div>
  );
}

export function AdminApp() {
  return (
    <AdminProvider>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </AdminProvider>
  );
}
