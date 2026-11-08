"use client";

// ADMIN, SIGNED IN (1.8.0): Dashboard, Patients, Support, Reports and the Activity log from the database
// (supabase/008_launch.sql). The demo keeps the sample pages.

import { useEffect, useState } from "react";
import { useAdmin } from "@/lib/admin/store";
import { cityName, GST_RATE, serviceName, type AdminPage } from "@/lib/admin/data";
import { db } from "@/lib/supabase";
import {
  loadDashboard, loadPatient, loadPatients, loadReport, loadTickets, replyTicket, setTicketStatus, ticketPhotoLink,
  type LiveDashboard, type LivePatient, type LivePatientRow, type LiveReport, type LiveTicket,
} from "@/lib/admin/live";
import { Badge, csvRow, downloadText, Drawer, Empty, Field, PageHead, Select, Stat, useToast } from "./ui";

const money = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const when = (ms: number) => new Date(ms).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const day = (ms: number) => new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const monthName = (key: string) => new Date(`${key}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });

/** Load now and every `every` ms while the tab is visible. */
function usePoll<T>(load: () => Promise<T>, every: number, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);
  const run = () => load().then((d) => { setData(d); setError(false); }, () => setError(true));
  useEffect(() => {
    void run();
    const id = setInterval(() => { if (document.visibilityState !== "hidden") void run(); }, every);
    return () => clearInterval(id);
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, error, reload: run };
}

const LoadError = ({ what, reload }: { what: string; reload: () => void }) => (
  <div className="adenied" role="alert">Could not load {what}. Check the internet connection. <button type="button" className="abtn abtn-sm" onClick={reload}>Try again</button></div>
);

// ---------------------------------------------------------------------------------------------------------
export function LiveDashboardPage() {
  const { go } = useAdmin();
  const { data: d, error, reload } = usePoll<LiveDashboard>(loadDashboard, 20000);
  const todo: { text: string; sub: string; page: AdminPage; tone: "danger" | "warn" | "info" }[] = d ? [
    ...(d.sosOpen ? [{ text: `${d.sosOpen} SOS alert${d.sosOpen > 1 ? "s" : ""}`, sub: "Call them now. The report has their location.", page: "support" as const, tone: "danger" as const }] : []),
    ...(d.waitingLong ? [{ text: `${d.waitingLong} request${d.waitingLong > 1 ? "s" : ""} waiting over 15 minutes`, sub: "Give them to a caregiver by hand, or call the patient.", page: "bookings" as const, tone: "danger" as const }] : []),
    ...(d.ticketsOpen - d.sosOpen > 0 ? [{ text: `${d.ticketsOpen - d.sosOpen} open support report${d.ticketsOpen - d.sosOpen > 1 ? "s" : ""}`, sub: "Reply or resolve.", page: "support" as const, tone: "warn" as const }] : []),
    ...(d.refundsDue ? [{ text: `${d.refundsDue} refund${d.refundsDue > 1 ? "s" : ""} still to send`, sub: "Refunds page.", page: "refunds" as const, tone: "warn" as const }] : []),
    ...(d.applicants ? [{ text: `${d.applicants} caregiver${d.applicants > 1 ? "s" : ""} waiting for verification`, sub: "Check their documents.", page: "verification" as const, tone: "info" as const }] : []),
    ...(d.renewals ? [{ text: `${d.renewals} registration renewal${d.renewals > 1 ? "s" : ""} to check`, sub: "Verification → Renewals.", page: "verification" as const, tone: "info" as const }] : []),
  ] : [];
  return (
    <>
      <PageHead title="Dashboard" sub={`Today, ${new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}. From the database, updated every 20 seconds.`}
        actions={<button type="button" className="abtn" onClick={() => void reload()}>Refresh</button>} />
      {error && <LoadError what="the dashboard" reload={reload} />}
      {!d ? <p className="adm-muted">Loading…</p> : (
        <>
          <div className="agrid agrid-4">
            <Stat label="Visits today" value={d.visitsToday} sub={`${d.completedToday} done · ${d.inProgress} accepted or under way · ${d.waiting} waiting`} onClick={() => go("bookings")} tone={d.waitingLong ? "danger" : undefined} />
            <Stat label="Earned today" value={money(d.revenueToday)} sub={`${money(d.revenue7d)} in the last 7 days`} onClick={() => go("reports")} />
            <Stat label="Booked today" value={d.bookedToday} sub={`${d.cancelledToday} cancelled today`} onClick={() => go("bookings")} />
            <Stat label="Caregivers online now" value={d.online} sub={`of ${d.caregivers} verified`} onClick={() => go("caregivers")} />
          </div>
          <div className="agrid agrid-2">
            <section className="acard">
              <div className="acard-head"><h2>Waiting for the team</h2><Badge tone={todo.length ? (todo.some((x) => x.tone === "danger") ? "danger" : "warn") : "ok"}>{todo.length ? `${todo.length} to do` : "All clear"}</Badge></div>
              {todo.length === 0 && <p className="adm-muted">Nothing waiting.</p>}
              <div className="adm-col">
                {todo.map((item) => (
                  <button key={item.text} type="button" className="achoice" style={{ alignItems: "center" }} onClick={() => go(item.page)}>
                    <Badge tone={item.tone}>{item.tone === "danger" ? "Now" : item.tone === "warn" ? "Today" : "Soon"}</Badge>
                    <span className="adm-col" style={{ gap: 2, flex: 1 }}><span className="adm-strong">{item.text}</span><span className="adm-small adm-muted">{item.sub}</span></span>
                    <span className="alink adm-small">Open</span>
                  </button>
                ))}
              </div>
            </section>
            <section className="acard">
              <div className="acard-head"><h2>People</h2></div>
              <div className="adm-col" style={{ gap: 6 }}>
                <span><b>{d.patients}</b> patient accounts ({d.patients7d} new this week)</span>
                <span><b>{d.caregivers}</b> verified caregivers, <b>{d.applicants}</b> waiting for verification</span>
                <span className="adm-small adm-muted">Bookings by city, last 30 days: {Object.keys(d.byCity).length ? Object.entries(d.byCity).map(([c, n]) => `${cityName(c)} ${n}`).join(" · ") : "none yet"}</span>
              </div>
            </section>
          </div>
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------
export function LivePatientsPage() {
  const { state } = useAdmin();
  const { data: rows, error, reload } = usePoll<LivePatientRow[]>(loadPatients, 60000);
  const [q, setQ] = useState("");
  const [city, setCity] = useState("all");
  const [only, setOnly] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const list = (rows ?? []).filter((a) => {
    if (city !== "all" && a.cityId !== city) return false;
    if (only === "complaints" && a.openTickets === 0) return false;
    if (only === "dues" && a.owed <= 0) return false;
    if (q && !`${a.name} ${a.phone} ${a.family.map((f) => f.name).join(" ")}`.toLowerCase().includes(q.toLowerCase().trim())) return false;
    return true;
  });
  return (
    <>
      <PageHead title="Patients" sub={rows ? `${rows.length} patient accounts. Search by name, phone or a family member’s name. Opening an account is written to the activity log.` : "Loading…"} />
      {error && <LoadError what="patients" reload={reload} />}
      <div className="afilters">
        <Field id="pt-search" label="Search" value={q} onChange={setQ} placeholder="Name, phone or family member" />
        <Select id="pt-city" label="City" value={city} onChange={setCity} options={[{ value: "all", label: "All cities" }, ...state.settings.cities.map((c) => ({ value: c.id, label: c.name }))]} />
        <Select id="pt-only" label="Show" value={only} onChange={setOnly} options={[{ value: "all", label: "Everyone" }, { value: "complaints", label: "With an open report" }, { value: "dues", label: "With an unpaid charge" }]} />
      </div>
      <section className="acard acard-flat">
        {rows && list.length === 0 ? <Empty title="No patients match" body={rows.length ? "Check the spelling, or search by phone number." : "Patients appear here after they sign in to the patient app."} /> : (
          <div className="atable-wrap">
            <table className="atable">
              <thead><tr><th>Account</th><th>City</th><th>Family</th><th className="num">Bookings</th><th>Last visit</th><th>Reports</th><th className="num">Unpaid</th></tr></thead>
              <tbody>
                {list.map((a) => (
                  <tr key={a.id} className="click" onClick={() => setOpenId(a.id)}>
                    <td><span className="adm-strong">{a.name}</span><span className="sub">+{a.phone} · joined {day(a.joined)}</span></td>
                    <td>{a.cityId ? cityName(a.cityId) : "—"}</td>
                    <td>{a.family.map((f) => f.relation === "Self" ? f.name : `${f.name} (${f.relation})`).join(", ")}</td>
                    <td className="num">{a.bookings}</td>
                    <td>{a.lastVisit ? day(a.lastVisit) : "—"}</td>
                    <td>{a.openTickets ? <Badge tone="warn">{a.openTickets} open</Badge> : "—"}</td>
                    <td className="num">{a.owed ? money(a.owed) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {openId && <LivePatientDrawer id={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}

function LivePatientDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const [p, setP] = useState<LivePatient | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { loadPatient(id).then(setP, () => setFailed(true)); }, [id]);
  return (
    <Drawer label="Patient account" title={p?.name ?? "Patient"} sub={p ? `+${p.phone} · joined ${day(p.joined)}${p.consentAt ? ` · consent given ${day(p.consentAt)}` : ""}` : undefined} onClose={onClose}>
      {failed && <div className="adenied" role="alert">Could not load this account.</div>}
      {!p && !failed && <p className="adm-muted">Loading…</p>}
      {p && (
        <div className="adm-col" style={{ gap: 16 }}>
          {p.owed > 0 && <div className="anote">Unpaid home visit charge: <b>{money(p.owed)}</b> (added to their next booking).</div>}
          <section><h3>Family</h3>{p.family.map((f, i) => <div key={i}>{f.name} · {f.relation === "Self" ? "account holder" : f.relation}{f.age ? `, ${f.age}` : ""}{f.gender ? `, ${f.gender}` : ""}</div>)}</section>
          <section><h3>Addresses</h3>{p.addresses.length ? p.addresses.map((a, i) => <div key={i}><b>{a.label}:</b> {a.line}, {a.area}, {cityName(a.cityId)} {a.pincode}{a.landmark ? ` (near ${a.landmark})` : ""}{a.pinned ? " · pinned on map" : ""}</div>) : <span className="adm-muted">None</span>}</section>
          <section><h3>Emergency contact</h3>{p.contact ? `${p.contact.name} (${p.contact.relation}) · +91 ${p.contact.phone}` : <span className="adm-muted">Not added</span>}</section>
          <section>
            <h3>Bookings ({p.bookings.length})</h3>
            {p.bookings.length === 0 ? <span className="adm-muted">None yet</span> : (
              <table className="atable"><thead><tr><th>Booking</th><th>Service</th><th>For</th><th>When</th><th>Status</th><th className="num">Total</th></tr></thead>
                <tbody>{p.bookings.map((b) => <tr key={b.id}><td>{b.code}</td><td>{serviceName(b.serviceId)}</td><td>{b.patient}</td><td>{b.date} {b.slot}</td><td>{b.status.replace("_", " ")}{b.caregiver ? ` · ${b.caregiver}` : ""}</td><td className="num">{money(b.total)}</td></tr>)}</tbody>
              </table>
            )}
          </section>
          <section><h3>Support reports</h3>{p.tickets.length ? p.tickets.map((tk) => <div key={tk.code}>{tk.code} · {tk.topic} · {tk.status}{tk.urgent ? " · urgent" : ""} · {when(tk.at)}</div>) : <span className="adm-muted">None</span>}</section>
          <section><h3>Refunds</h3>{p.refunds.length ? p.refunds.map((r, i) => <div key={i}>{r.booking} · {money(r.amount)} · {r.reason} · {day(r.at)}</div>) : <span className="adm-muted">None</span>}</section>
        </div>
      )}
    </Drawer>
  );
}

// ---------------------------------------------------------------------------------------------------------
export function LiveSupportPage() {
  const { state } = useAdmin();
  const { data: rows, error, reload } = usePoll<LiveTicket[]>(loadTickets, 15000);
  const [status, setStatus] = useState("open");
  const [from, setFrom] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const list = (rows ?? []).filter((tk) => (status === "all" || tk.status === status) && (from === "all" || tk.from === from));
  const open = rows?.find((x) => x.id === openId) ?? null;
  const canReply = state.role === "owner" || state.role === "support";
  return (
    <>
      <PageHead title="Support" sub={rows ? `${rows.filter((x) => x.status === "open").length} open reports from patients and caregivers. Urgent and SOS first. Updates every 15 seconds.` : "Loading…"}
        actions={<button type="button" className="abtn" onClick={() => void reload()}>Refresh</button>} />
      {error && <LoadError what="support reports" reload={reload} />}
      {rows?.some((x) => x.status === "open" && x.topic === "SOS") && <div className="anote danger" role="alert"><b>SOS:</b> someone pressed SOS during a visit. Call them now; their report has the location.</div>}
      <div className="afilters">
        <Select id="sp-status" label="Status" value={status} onChange={setStatus} options={[{ value: "open", label: "Open" }, { value: "resolved", label: "Resolved" }, { value: "all", label: "All" }]} />
        <Select id="sp-from" label="From" value={from} onChange={setFrom} options={[{ value: "all", label: "Patients and caregivers" }, { value: "patient", label: "Patients" }, { value: "caregiver", label: "Caregivers" }]} />
      </div>
      <section className="acard acard-flat">
        {rows && list.length === 0 ? <Empty title="Nothing here" body="Reports sent from the apps (Help and Report a problem) appear here." /> : (
          <div className="atable-wrap">
            <table className="atable">
              <thead><tr><th>Report</th><th>From</th><th>About</th><th>Sent</th><th>Status</th></tr></thead>
              <tbody>
                {list.map((tk) => (
                  <tr key={tk.id} className="click" onClick={() => setOpenId(tk.id)}>
                    <td><span className="adm-strong">{tk.code}</span>{tk.urgent && <> <Badge tone="danger">{tk.topic === "SOS" ? "SOS" : "Urgent"}</Badge></>}</td>
                    <td>{tk.name || "(no name)"}<span className="sub">{tk.from === "patient" ? "Patient" : "Caregiver"} · +{tk.phone}</span></td>
                    <td>{tk.topic}<span className="sub">{tk.message.length > 70 ? `${tk.message.slice(0, 70)}…` : tk.message}</span></td>
                    <td className="nowrap">{when(tk.at)}</td>
                    <td>{tk.status === "open" ? <Badge tone="warn">Open{tk.replies.length ? " · replied" : ""}</Badge> : <Badge tone="ok">Resolved</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {open && <LiveTicketDrawer tk={open} canReply={canReply} onClose={() => setOpenId(null)} onChanged={reload} />}
    </>
  );
}

function LiveTicketDrawer({ tk, canReply, onClose, onChanged }: { tk: LiveTicket; canReply: boolean; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  useEffect(() => { if (tk.photoPath) ticketPhotoLink(tk.photoPath).then(setPhoto, () => {}); }, [tk.photoPath]);
  const send = async (resolve: boolean) => {
    if (reply.trim().length < 2) { toast("Write a reply first"); return; }
    setBusy(true);
    try { await replyTicket(tk.id, reply.trim(), resolve); setReply(""); toast(resolve ? "Reply sent and resolved. They get a notification." : "Reply sent. They get a notification."); onChanged(); }
    catch { toast("Could not send. Check the internet and try again."); }
    setBusy(false);
  };
  const status = async (s: "open" | "resolved") => {
    setBusy(true);
    try { await setTicketStatus(tk.id, s); toast(s === "resolved" ? "Marked resolved" : "Opened again"); onChanged(); } catch { toast("Could not change it"); }
    setBusy(false);
  };
  return (
    <Drawer label="Support report" title={<span className="adm-row">{tk.code}{tk.urgent && <Badge tone="danger">{tk.topic === "SOS" ? "SOS" : "Urgent"}</Badge>}{tk.status === "resolved" && <Badge tone="ok">Resolved</Badge>}</span>}
      sub={`${tk.name || "(no name)"} · ${tk.from === "patient" ? "patient" : "caregiver"} · +${tk.phone} · ${when(tk.at)}`} onClose={onClose}
      footer={canReply ? (
        <div className="adm-col" style={{ gap: 8, width: "100%" }}>
          <Field id="tk-reply" label="Reply (they see it in the app, in English)" value={reply} onChange={setReply} multiline />
          <div className="adm-row" style={{ gap: 8 }}>
            <button type="button" className="abtn abtn-primary" disabled={busy} onClick={() => void send(true)}>Reply and resolve</button>
            <button type="button" className="abtn" disabled={busy} onClick={() => void send(false)}>Reply, keep open</button>
            {tk.status === "open" ? <button type="button" className="abtn" disabled={busy} onClick={() => void status("resolved")}>Resolve without reply</button>
              : <button type="button" className="abtn" disabled={busy} onClick={() => void status("open")}>Open again</button>}
          </div>
        </div>
      ) : undefined}>
      <div className="adm-col" style={{ gap: 14 }}>
        <div><a className="abtn abtn-sm" href={`tel:+${tk.phone}`}>Call +{tk.phone}</a></div>
        <div><b>{tk.topic}</b>{tk.booking ? ` · booking ${tk.booking}` : ""}</div>
        <div style={{ whiteSpace: "pre-wrap" }}>{tk.message.split(/(https:\/\/www\.google\.com\/maps\?q=[\d.,-]+)/).map((part, i) => part.startsWith("https://") ? <a key={i} className="alink" href={part} target="_blank" rel="noopener noreferrer">Open the location on a map</a> : part)}</div>
        {tk.photoPath && (photo ? <a href={photo} target="_blank" rel="noopener noreferrer"><img src={photo} alt="Photo sent with the report" style={{ maxWidth: "100%", borderRadius: 10 }} /></a> : <span className="adm-muted">Loading the photo…</span>)}
        {tk.replies.length > 0 && (
          <section className="adm-col" style={{ gap: 8 }}>
            <h3>Replies</h3>
            {tk.replies.map((r, i) => <div key={i} className="amsg"><b>{r.by || "Team"} · {when(r.at)}</b>{r.text}</div>)}
          </section>
        )}
        {!canReply && <div className="anote info adm-small">Only the support team and owners can reply.</div>}
      </div>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------------------------------------
export function LiveReportsPage() {
  const [month, setMonth] = useState<string | null>(null);
  const { data: r, error, reload } = usePoll<LiveReport>(() => loadReport(6, month), 120000, [month]);
  const selected = r?.months.find((m) => m.month === (month ?? r?.month)) ?? null;
  const keep = (m: LiveReport["months"][number]) => m.revenue - m.caregiverPay;
  const download = () => {
    if (!r) return;
    const rows = [
      csvRow(["Month", "Visits", "Patients paid (₹)", "Caregivers earned (₹)", "We keep (₹)", "Refunds (₹)", `GST in what we keep at ${Math.round(GST_RATE * 100)}% (₹, estimate)`, "Cancelled", "New patients"]),
      ...r.months.map((m) => csvRow([monthName(m.month), m.visits, m.revenue, m.caregiverPay, keep(m), m.refunds, Math.round(Math.max(0, keep(m) - m.refunds) * GST_RATE / (1 + GST_RATE)), m.cancelled, m.newPatients])),
      "",
      csvRow([`Caregivers, ${monthName(r.month)}`, "Phone", "Role", "Visits", "Earned (₹)", "Cash collected (₹)"]),
      ...r.caregivers.map((c) => csvRow([c.name, `+${c.phone}`, c.role, c.visits, c.earned, c.cash])),
    ];
    downloadText(`nurse-at-home-report-${r.month}.csv`, rows.join("\r\n"));
  };
  return (
    <>
      <PageHead title="Reports" sub="From the database: completed visits, what patients paid, what caregivers earned, what we keep, and refunds. GST is an estimate; a chartered accountant must confirm it."
        actions={<button type="button" className="abtn" onClick={download} disabled={!r}>Download (CSV)</button>} />
      {error && <LoadError what="the reports" reload={reload} />}
      {!r ? <p className="adm-muted">Loading…</p> : (
        <>
          <div className="afilters">
            <Select id="rp-month" label="Month" value={month ?? r.month} onChange={(v) => setMonth(v)} options={[...r.months].reverse().map((m) => ({ value: m.month, label: monthName(m.month) }))} />
          </div>
          {selected && (
            <div className="agrid agrid-4">
              <Stat label="Visits completed" value={selected.visits} sub={`${selected.cancelled} cancelled`} />
              <Stat label="Patients paid" value={money(selected.revenue)} sub="Completed visits and charges kept" />
              <Stat label="Caregivers earned" value={money(selected.caregiverPay)} />
              <Stat label="We keep, after refunds" value={money(keep(selected) - selected.refunds)} sub={`${money(selected.refunds)} refunded`} />
            </div>
          )}
          <section className="acard acard-flat">
            <div className="acard-head" style={{ padding: "16px 18px 6px" }}><h2>Last 6 months</h2></div>
            <div className="atable-wrap">
              <table className="atable">
                <thead><tr><th>Month</th><th className="num">Visits</th><th className="num">Patients paid</th><th className="num">Caregivers earned</th><th className="num">We keep</th><th className="num">Refunds</th><th className="num">New patients</th></tr></thead>
                <tbody>{[...r.months].reverse().map((m) => <tr key={m.month}><td>{monthName(m.month)}</td><td className="num">{m.visits}</td><td className="num">{money(m.revenue)}</td><td className="num">{money(m.caregiverPay)}</td><td className="num">{money(keep(m))}</td><td className="num">{money(m.refunds)}</td><td className="num">{m.newPatients}</td></tr>)}</tbody>
              </table>
            </div>
          </section>
          <section className="acard acard-flat">
            <div className="acard-head" style={{ padding: "16px 18px 6px" }}><h2>Caregivers, {monthName(r.month)}</h2></div>
            {r.caregivers.length === 0 ? <Empty title="No earnings this month" /> : (
              <div className="atable-wrap">
                <table className="atable">
                  <thead><tr><th>Caregiver</th><th>Role</th><th className="num">Visits</th><th className="num">Earned</th><th className="num">Cash collected</th></tr></thead>
                  <tbody>{r.caregivers.map((c) => <tr key={c.id}><td>{c.name}<span className="sub">+{c.phone}</span></td><td>{c.role}</td><td className="num">{c.visits}</td><td className="num">{money(c.earned)}</td><td className="num">{money(c.cash)}</td></tr>)}</tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------
type AuditRow = { id: number; page: string; action: string; detail: Record<string, unknown>; created_at: string; actor: string | null };
const ACTION_TEXT: Record<string, string> = {
  approved: "Approved a caregiver", sent_back: "Sent a step back", paused: "Paused a caregiver", reinstated: "Resumed a caregiver", tier: "Changed what a caregiver can take",
  renewal_approved: "Approved a renewal", renewal_refused: "Refused a renewal", reminder: "Sent a renewal reminder", replied: "Replied to a report",
  replied_resolved: "Replied and resolved a report", resolved: "Resolved a report", open: "Opened a report again", viewed: "Opened a patient account",
};
export function LiveActivityPage() {
  const { state } = useAdmin();
  const [page, setPage] = useState("all");
  const { data, error, reload } = usePoll(async () => {
    const [log, team] = await Promise.all([
      db("admin").from("audit_log").select("id, page, action, detail, created_at, actor").order("created_at", { ascending: false }).limit(300),
      db("admin").from("admin_users").select("id, name"),
    ]);
    if (log.error) throw log.error;
    const names = Object.fromEntries((team.data ?? []).map((m) => [m.id, m.name]));
    return (log.data as AuditRow[]).map((a) => ({ ...a, by: a.actor ? names[a.actor] ?? "Team" : "System" }));
  }, 30000);
  const text = (a: AuditRow) => {
    const d = a.detail ?? {};
    if (typeof d.text === "string") return d.text;
    const base = ACTION_TEXT[a.action] ?? a.action.replace(/_/g, " ");
    const extra = [d.ticket, d.name, d.step, d.reason, d.tier, d.amount].filter((x) => x != null && x !== "").join(" · ");
    return extra ? `${base}: ${extra}` : base;
  };
  const rows = (data ?? []).filter((a) => page === "all" || a.page === page);
  const pages = [...new Set((data ?? []).map((a) => a.page))].sort();
  const download = () => downloadText("admin-activity.csv", [csvRow(["When", "Section", "What", "Who"]), ...rows.map((a) => csvRow([when(new Date(a.created_at).getTime()), a.page, text(a), a.by]))].join("\r\n"));
  return (
    <>
      <PageHead title="Activity log" sub={state.role === "owner" ? "Every decision by the team, from the database (newest 300). Kept for audits and disputes." : "Only owners can read the full log."}
        actions={<button type="button" className="abtn" onClick={download} disabled={!rows.length}>Download (CSV)</button>} />
      {error && <LoadError what="the activity log" reload={reload} />}
      <div className="afilters">
        <Select id="ac-page" label="Section" value={page} onChange={setPage} options={[{ value: "all", label: "All sections" }, ...pages.map((p) => ({ value: p, label: p[0].toUpperCase() + p.slice(1) }))]} />
      </div>
      <section className="acard acard-flat">
        {data && rows.length === 0 ? <Empty title="Nothing yet" body="Approvals, refunds, replies, payouts and settings changes are listed here." /> : (
          <div className="atable-wrap">
            <table className="atable">
              <thead><tr><th>When</th><th>Section</th><th>What</th><th>Who</th></tr></thead>
              <tbody>{rows.map((a) => <tr key={a.id}><td className="nowrap">{when(new Date(a.created_at).getTime())}</td><td><Badge>{a.page}</Badge></td><td>{text(a)}</td><td className="nowrap">{a.by}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
