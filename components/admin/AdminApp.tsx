"use client";

// ADMIN PANEL: sign-in, side menu and the page switch. Served at /admin/ (see app/admin/page.tsx).

import { useState } from "react";
import { AdminProvider, useAdmin } from "@/lib/admin/store";
import { canOpen, ROLE_HELP, ROLE_PAGES, ROLE_TEXT, type AdminPage, type AdminRole } from "@/lib/admin/data";
import { Icon, type IconName } from "../Icon";
import { Field, ToastProvider } from "./ui";
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

function LoginPage() {
  const { state, set } = useAdmin();
  const [blocked, setBlocked] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tried, setTried] = useState(false);
  const errors = {
    email: !/^\S+@\S+\.\S+$/.test(email) ? "Enter your work email." : "",
    password: password.length < 4 ? "Enter your password." : "",
  };
  const signIn = (name: string, role: AdminRole, mail: string) => set({ signedIn: true, adminName: name, adminEmail: mail, role, page: "dashboard" });
  const submit = () => {
    setTried(true);
    setBlocked("");
    if (errors.email || errors.password) return;
    const member = state.team.find((m) => m.email.toLowerCase() === email.trim().toLowerCase());
    if (member && !member.active) { setBlocked("This team member’s access is switched off. Ask the owner to switch it on in Team."); return; }
    if (member) { signIn(member.name, member.role, member.email); return; }
    // Prototype: an email that is not in the team signs in as an owner.
    const local = email.split("@")[0].replace(/[._-]+/g, " ");
    signIn(local.charAt(0).toUpperCase() + local.slice(1), "owner", email.trim());
  };
  return (
    <main className="adm-login">
      <form className="acard" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
        <div className="adm-row">
          <span className="logo" style={{ width: 40, height: 40, borderRadius: 10, background: "#0e5c4a", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="bag" size={22} /></span>
          <div><h1 style={{ fontSize: 22 }}>Nurse at Home</h1><span className="adm-muted adm-small">Team admin panel</span></div>
        </div>
        <Field id="adm-email" label="Work email" type="email" value={email} onChange={setEmail} error={tried ? errors.email : ""} />
        <Field id="adm-password" label="Password" type="password" value={password} onChange={setPassword} error={tried ? errors.password : ""} />
        {blocked && <div className="anote danger" role="alert">{blocked}</div>}
        <button type="submit" className="abtn abtn-primary">Sign in</button>
        <div className="anote info adm-small">Prototype: any password works. A team member’s email (see Team) signs in with their role; any other email signs in as an owner. Real sign-in, with a code sent to the team member’s phone, comes with the server.</div>
        <button type="button" className="abtn" onClick={() => signIn("Admin (sample)", "owner", "admin@nurseathome.in")}>Prototype: sign in as the sample admin</button>
        <div className="adm-col" style={{ gap: 6 }}>
          <span className="adm-small adm-muted">Prototype: sign in as a team member</span>
          <div className="adm-row" style={{ gap: 6 }}>
            {state.team.filter((m) => m.active).map((m) => (
              <button key={m.id} type="button" className="abtn abtn-sm" onClick={() => signIn(m.name, m.role, m.email)}>{ROLE_TEXT[m.role].replace(" team", "")}</button>
            ))}
          </div>
        </div>
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

function Shell() {
  const { state, ready, view, go, set } = useAdmin();
  if (!ready) return <div className="adm-splash" role="status">Loading the admin panel…</div>;
  if (!state.signedIn) return <LoginPage />;

  const waiting = view.applicants.filter((a) => !a.decision || a.live).length + view.renewals.filter((r) => !r.decision).length;
  const refunds = view.refunds.filter((r) => !r.decision).length;
  const open = view.tickets.filter((tk) => tk.status === "open");
  const urgent = open.some((tk) => tk.urgent);
  const counts: Partial<Record<AdminPage, { n: number; red?: boolean }>> = {
    verification: { n: waiting },
    refunds: { n: refunds },
    support: { n: open.length, red: urgent },
  };

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
          <label className="adm-roleview" htmlFor="adm-viewas">Prototype: view as
            <select id="adm-viewas" value={state.role} onChange={(e) => { const role = e.target.value as AdminRole; set({ role, page: ROLE_PAGES[role].includes(state.page) ? state.page : "dashboard" }); }}>
              {(Object.keys(ROLE_TEXT) as AdminRole[]).map((r) => <option key={r} value={r}>{ROLE_TEXT[r]}</option>)}
            </select>
          </label>
          <span className="adm-small adm-muted">Signed in as <b style={{ color: "var(--a-ink)" }}>{state.adminName}</b> · {ROLE_TEXT[state.role]}</span>
          <button type="button" className="abtn abtn-sm" onClick={() => set({ signedIn: false })}>Sign out</button>
        </header>
        <main className="adm-content">
          <Page />
        </main>
      </div>
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
