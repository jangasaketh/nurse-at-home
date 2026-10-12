"use client";

// ADMIN: daily overview and the list of things waiting for the team.

import { useAdmin } from "@/lib/admin/store";
import { SERVICES } from "@/lib/data";
import { canOpen, DAY, ago, daysUntilMonthEnd, isPaidOut, money, moneyFor, mondayOf, startOfToday, type AdminPage } from "@/lib/admin/data";
import { cashOwedRows } from "./PayoutsPage";
import { Badge, Meter, PageHead, Stat } from "./ui";

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function DashboardPage() {
  const ctx = useAdmin();
  const { view, state, nowMs, go } = ctx;
  const s = state.settings;
  const today = startOfToday();
  const isToday = (ms: number) => ms >= today && ms < today + DAY;
  const todays = view.bookings.filter((b) => isToday(b.at));
  const by = (st: string) => todays.filter((b) => b.status === st).length;
  const cancelled = todays.filter((b) => b.status.startsWith("cancelled"));
  const charged = todays.filter((b) => isPaidOut(b.status) || b.status === "in-progress");
  const collected = charged.reduce((sum, b) => sum + moneyFor(b, s).patientPays, 0);
  const kept = charged.reduce((sum, b) => sum + moneyFor(b, s).platformKeeps, 0);
  const online = view.members.filter((m) => m.online && !m.suspended).length;

  // Waiting for the team
  const pendingApplicants = view.applicants.filter((a) => !a.decision || a.live);
  const oldest = pendingApplicants.reduce((min, a) => Math.min(min, a.submittedAt), nowMs);
  const renewals = view.renewals.filter((r) => !r.decision);
  const openTickets = view.tickets.filter((tk) => tk.status === "open");
  const urgentTickets = openTickets.filter((tk) => tk.urgent);
  const refunds = view.refunds.filter((r) => !r.decision);
  const expiring = view.members.filter((m) => m.role === "nurse" && !m.suspended && (daysUntilMonthEnd(m.validUntil, nowMs) ?? 999) <= s.renewalWarnDays && !view.renewals.some((r) => r.memberId === m.id && !r.decision));
  const owed = cashOwedRows(ctx).filter((r) => !r.received);

  const todo: { text: string; sub: string; page: AdminPage; tone: "danger" | "warn" | "info" }[] = [];
  if (urgentTickets.length) todo.push({ text: `${urgentTickets.length} urgent support ${urgentTickets.length === 1 ? "ticket" : "tickets"}`, sub: "Safety or a problem after a visit. Answer these first.", page: "support", tone: "danger" });
  if (pendingApplicants.length) todo.push({ text: `${pendingApplicants.length} ${pendingApplicants.length === 1 ? "caregiver" : "caregivers"} waiting for verification`, sub: `Oldest sent ${ago(oldest, nowMs)}. We promise 2 working days.`, page: "verification", tone: nowMs - oldest > 2 * DAY ? "danger" : "warn" });
  if (renewals.length) todo.push({ text: `${renewals.length} renewed ${renewals.length === 1 ? "registration" : "registrations"} to check`, sub: "Nurses lose injection and drip requests when their registration lapses.", page: "verification", tone: "warn" });
  if (refunds.length) todo.push({ text: `${refunds.length} refund ${refunds.length === 1 ? "request" : "requests"}`, sub: "Patients asking for money back.", page: "refunds", tone: "warn" });
  if (openTickets.length - urgentTickets.length > 0) todo.push({ text: `${openTickets.length - urgentTickets.length} other open support tickets`, sub: "Payments, app problems and late visits.", page: "support", tone: "info" });
  if (expiring.length) todo.push({ text: `${expiring.length} ${expiring.length === 1 ? "nurse's registration expires" : "nurses' registrations expire"} soon`, sub: `Within ${s.renewalWarnDays} days, or already lapsed, and no renewal sent.`, page: "verification", tone: "info" });
  if (owed.length) todo.push({ text: `${owed.length} ${owed.length === 1 ? "caregiver owes" : "caregivers owe"} cash`, sub: "They collected more cash this week than they earned.", page: "payouts", tone: "info" });

  // Each team member sees only what their role can act on.
  const mine = todo.filter((item) => canOpen(state.role, item.page));
  todo.splice(0, todo.length, ...mine);

  // Last 7 days
  const days = Array.from({ length: 7 }, (_, i) => today - (6 - i) * DAY);
  const perDay = days.map((d) => view.bookings.filter((b) => b.at >= d && b.at < d + DAY).length);
  const maxDay = Math.max(...perDay, 1);

  // This week by city and service
  const monday = mondayOf(nowMs);
  const week = view.bookings.filter((b) => b.at >= monday && b.at < nowMs);
  const mix = SERVICES.map((sv) => ({ name: sv.name, n: week.filter((b) => b.serviceId === sv.id).length })).sort((a, b) => b.n - a.n);
  const maxMix = Math.max(...mix.map((m) => m.n), 1);

  return (
    <>
      <PageHead title="Dashboard" sub={`Today, ${new Date(nowMs).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}. Sample data, except the caregiver from the caregiver app.`} />

      <div className="agrid agrid-4">
        <Stat label="Visits today" value={todays.length} sub={`${by("completed")} done · ${by("in-progress")} in progress · ${by("upcoming")} to come`} onClick={() => go("bookings")} />
        <Stat label="Collected today" value={money(collected)} sub={`We keep ${money(kept)} after caregiver pay`} />
        <Stat label="Cancelled or missed today" value={cancelled.length + by("missed")} sub={`${todays.filter((b) => b.status === "cancelled-patient").length} by patients · ${todays.filter((b) => b.status === "cancelled-caregiver").length} by caregivers · ${by("missed")} nobody home`} tone={todays.filter((b) => b.status === "cancelled-caregiver").length > 1 ? "warn" : undefined} />
        <Stat label="Caregivers online now" value={online} sub={`of ${view.members.filter((m) => !m.suspended).length} active`} onClick={() => go("caregivers")} />
      </div>

      <div className="agrid agrid-2">
        <section className="acard">
          <div className="acard-head"><h2>Waiting for the team</h2><Badge tone={todo.length ? "warn" : "ok"}>{todo.length ? `${todo.length} to do` : "All clear"}</Badge></div>
          {todo.length === 0 && <p className="adm-muted">Nothing waiting. Well done.</p>}
          <div className="adm-col">
            {todo.map((item) => (
              <button key={item.text} type="button" className="achoice" style={{ alignItems: "center" }} onClick={() => go(item.page)}>
                <Badge tone={item.tone}>{item.tone === "danger" ? "Now" : item.tone === "warn" ? "Today" : "Soon"}</Badge>
                <span className="adm-col" style={{ gap: 2, flex: 1 }}>
                  <span className="adm-strong">{item.text}</span>
                  <span className="adm-small adm-muted">{item.sub}</span>
                </span>
                <span className="alink adm-small">Open</span>
              </button>
            ))}
          </div>
        </section>

        <section className="acard">
          <div className="acard-head"><h2>Bookings, last 7 days</h2><span className="adm-small adm-muted">Visits booked for each day</span></div>
          <div className="abars" role="img" aria-label={`Bookings per day: ${perDay.join(", ")}`}>
            {days.map((d, i) => (
              <div className="abar" key={d}>
                <span className="abar-val">{perDay[i]}</span>
                <span className="abar-track"><span className={`abar-fill ${i === 6 ? "today" : ""}`} style={{ height: `${(perDay[i] / maxDay) * 100}%` }} /></span>
                <span className="abar-lab">{i === 6 ? "Today" : WEEKDAY[new Date(d).getDay()]}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="agrid agrid-2">
        <section className="acard acard-flat">
          <div className="acard-head" style={{ padding: "16px 18px 6px" }}><h2>Cities</h2><span className="adm-small adm-muted">This week so far</span></div>
          <div className="atable-wrap">
            <table className="atable">
              <thead><tr><th>City</th><th className="num">Today</th><th className="num">This week</th><th className="num">Cancelled</th><th className="num">Online</th><th>Bookings</th></tr></thead>
              <tbody>
                {s.cities.map((c) => {
                  const cw = week.filter((b) => b.cityId === c.id);
                  const cancel = cw.filter((b) => b.status.startsWith("cancelled")).length;
                  const team = view.members.filter((m) => m.cityId === c.id && !m.suspended);
                  return (
                    <tr key={c.id}>
                      <td className="adm-strong">{c.name}</td>
                      <td className="num">{todays.filter((b) => b.cityId === c.id).length}</td>
                      <td className="num">{cw.length}</td>
                      <td className="num">{cw.length ? Math.round((cancel / cw.length) * 100) : 0}%</td>
                      <td className="num">{team.filter((m) => m.online).length} / {team.length}</td>
                      <td>{c.open ? <Badge tone="ok">Open</Badge> : <Badge tone="danger">Paused</Badge>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="acard">
          <div className="acard-head"><h2>Services this week</h2><span className="adm-small adm-muted">{week.length} visits</span></div>
          <div className="adm-col">
            {mix.map((m) => (
              <div key={m.name} className="adm-col" style={{ gap: 4 }}>
                <div className="adm-row" style={{ justifyContent: "space-between" }}><span>{m.name}</span><span className="adm-strong adm-mono">{m.n}</span></div>
                <Meter value={m.n} max={maxMix} />
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
