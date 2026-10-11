"use client";

// ADMIN: weekly caregiver payouts, and cash that caregivers owe us.

import { useState } from "react";
import { currentWeekKey, useAdmin } from "@/lib/admin/store";
import * as link from "@/lib/admin/link";
import { cityName, DAY, dateOnly, isPaidOut, money, moneyFor, mondayOf, samplePastPayouts, WEEKDAYS } from "@/lib/admin/data";
import { Badge, csvRow, downloadText, LiveBadge, PageHead, Stat, Tabs, useToast } from "./ui";

type Ctx = ReturnType<typeof useAdmin>;
export type PayRow = { id: string; name: string; cityId: string; live?: boolean; account: string; visits: number; earned: number; cash: number; net: number; paid: { reference: string; at: number; amount: number } | null; received: boolean };

/** This week, per caregiver: what they earned, the cash they collected, and what we pay (or they owe). */
export function payRows(ctx: Ctx): PayRow[] {
  const { view, state, nowMs } = ctx;
  const monday = mondayOf(nowMs);
  const wk = currentWeekKey(nowMs);
  const week = view.bookings.filter((b) => b.at >= monday && b.at < nowMs && isPaidOut(b.status));
  const rows: PayRow[] = view.members.filter((m) => !m.live).map((m) => {
    const mine = week.filter((b) => b.caregiverId === m.id);
    const earned = mine.reduce((s, b) => s + moneyFor(b, state.settings).caregiverGets, 0);
    const cash = mine.filter((b) => b.pay === "cash" && b.status === "completed").reduce((s, b) => s + moneyFor(b, state.settings).patientPays, 0);
    return { id: m.id, name: m.name, cityId: m.cityId, account: m.bankLast4, visits: mine.filter((b) => b.status === "completed").length, earned, cash, net: earned - cash, paid: state.paid[wk]?.[m.id] ?? null, received: !!state.cashReceived[wk]?.[m.id] };
  });
  const lw = view.live.week;
  const lm = view.live.member;
  if (lw && lm) rows.unshift({ id: "live", name: lm.name, cityId: lm.cityId, live: true, account: lw.account, visits: lw.visits, earned: lw.earned, cash: lw.cash, net: lw.earned - lw.cash, paid: state.paid[wk]?.live ?? null, received: !!state.cashReceived[wk]?.live });
  return rows.filter((r) => r.earned > 0 || r.cash > 0 || r.live);
}

export const cashOwedRows = (ctx: Ctx) => payRows(ctx).filter((r) => r.net < 0);

const people = (n: number) => `${n} ${n === 1 ? "caregiver" : "caregivers"}`;
const utr = () => `UTR ${4130 + Math.floor(Math.random() * 9)}${Math.floor(1000 + Math.random() * 8999)} ${Math.floor(1000 + Math.random() * 8999)}`;

export function PayoutsPage() {
  const ctx = useAdmin();
  const { view, state, update, log, refreshCg, nowMs } = ctx;
  const toast = useToast();
  const [tab, setTab] = useState<"week" | "history">("week");
  const wk = currentWeekKey(nowMs);
  const rows = payRows(ctx);
  const toPay = rows.filter((r) => r.net > 0 && !r.paid);
  const owed = rows.filter((r) => r.net < 0);
  const monday = mondayOf(nowMs);
  const nextPay = (() => { const d = new Date(monday + 7 * DAY); d.setDate(d.getDate() + ((state.settings.payoutDay + 6) % 7)); return d.getTime(); })();

  const pay = (list: typeof rows) => {
    if (list.length === 0) return;
    const entries: Record<string, { reference: string; at: number; amount: number }> = {};
    for (const r of list) {
      const reference = utr();
      entries[r.id] = { reference, at: Date.now(), amount: r.net };
      if (r.live) link.payLive(r.net, reference);
    }
    update((prev) => ({ paid: { ...prev.paid, [wk]: { ...prev.paid[wk], ...entries } } }));
    log(list.length === 1 ? `Paid ${list[0].name} ${money(list[0].net)}` : `Sent ${list.length} payouts, ${money(list.reduce((s, r) => s + r.net, 0))} in total`, "payouts");
    refreshCg();
    toast(list.length === 1 ? `${money(list[0].net)} sent to ${list[0].name}` : `${list.length} payouts sent`);
  };
  const received = (r: (typeof rows)[number]) => {
    update((prev) => ({ cashReceived: { ...prev.cashReceived, [wk]: { ...prev.cashReceived[wk], [r.id]: { at: Date.now(), amount: -r.net } } } }));
    log(`Received ${money(-r.net)} cash from ${r.name}`, "payouts");
    toast(`Marked ${money(-r.net)} from ${r.name} as received`);
  };
  const bankFile = () => {
    const lines = [csvRow(["Name", "Account (last 4)", "Amount (Rs)", "Reference"]), ...rows.filter((r) => r.net > 0).map((r) => csvRow([r.name, r.account, r.net, `Nurse at Home payout week of ${dateOnly(monday)}`]))];
    downloadText(`payouts-${wk}.csv`, lines.join("\r\n"));
  };
  const history = samplePastPayouts(view.members, nowMs);

  return (
    <>
      <PageHead title="Payouts" sub={`Caregivers are paid every ${WEEKDAYS[state.settings.payoutDay]} for the week before: what they earned minus any cash they collected from patients.`}
        actions={<><button type="button" className="abtn" onClick={bankFile}>Download bank file (CSV)</button><button type="button" className="abtn abtn-primary" disabled={toPay.length === 0} onClick={() => pay(toPay)}>Send all payouts now</button></>} />
      <div className="agrid agrid-4">
        <Stat label="This week, to pay" value={money(toPay.reduce((s, r) => s + r.net, 0))} sub={`${people(toPay.length)} · due ${dateOnly(nextPay)}`} />
        <Stat label="Paid this week" value={money(rows.filter((r) => r.paid).reduce((s, r) => s + (r.paid?.amount ?? 0), 0))} sub={people(rows.filter((r) => r.paid).length)} />
        <Stat label="Cash owed to us" value={money(owed.filter((r) => !r.received).reduce((s, r) => s - r.net, 0))} sub={`${people(owed.filter((r) => !r.received).length)} collected more cash than earned`} tone={owed.some((r) => !r.received) ? "warn" : undefined} />
        <Stat label="Earned by caregivers" value={money(rows.reduce((s, r) => s + r.earned, 0))} sub={`Since ${dateOnly(monday)}`} />
      </div>
      <div className="anote info adm-small">Prototype: “Send all payouts now” marks them paid with a sample bank reference. With the server, payouts go out automatically through the bank every {WEEKDAYS[state.settings.payoutDay]}, and the caregiver app shows them.</div>
      <Tabs label="Payout views" value={tab} onChange={setTab} tabs={[{ id: "week", label: "This week" }, { id: "history", label: "Past payouts" }]} />
      {tab === "week" ? (
        <section className="acard acard-flat">
          <div className="atable-wrap">
            <table className="atable">
              <thead><tr><th>Caregiver</th><th>City</th><th className="num">Visits</th><th className="num">Earned</th><th className="num">Cash collected</th><th className="num">To pay</th><th>Status</th><th /></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td><span className="adm-strong">{r.name}</span>{r.live && <> <LiveBadge /></>}<span className="sub">Account ••••{r.account}</span></td>
                    <td>{cityName(r.cityId)}</td>
                    <td className="num">{r.visits}</td>
                    <td className="num">{money(r.earned)}</td>
                    <td className="num">{r.cash ? money(r.cash) : "—"}</td>
                    <td className="num adm-strong">{money(r.net)}</td>
                    <td>{r.paid ? <Badge tone="ok">Paid · {r.paid.reference}</Badge> : r.net < 0 ? (r.received ? <Badge tone="ok">Cash received</Badge> : <Badge tone="warn">Owes {money(-r.net)}</Badge>) : r.net === 0 ? <Badge>Nothing to pay</Badge> : <Badge tone="info">To pay</Badge>}</td>
                    <td>{!r.paid && r.net > 0 && <button type="button" className="abtn abtn-sm" onClick={() => pay([r])}>Pay now</button>}{r.net < 0 && !r.received && <button type="button" className="abtn abtn-sm" onClick={() => received(r)}>Mark cash received</button>}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan={3}>Total</td><td className="num">{money(rows.reduce((s, r) => s + r.earned, 0))}</td><td className="num">{money(rows.reduce((s, r) => s + r.cash, 0))}</td><td className="num">{money(rows.reduce((s, r) => s + Math.max(0, r.net), 0))}</td><td colSpan={2} /></tr></tfoot>
            </table>
          </div>
        </section>
      ) : (
        <section className="acard acard-flat">
          <div className="atable-wrap">
            <table className="atable">
              <thead><tr><th>Week</th><th>Paid on</th><th className="num">Caregivers</th><th className="num">Total</th><th>Largest</th></tr></thead>
              <tbody>
                {history.map((h) => {
                  const top = [...h.rows].sort((a, b) => b.amount - a.amount)[0];
                  return (
                    <tr key={h.monday}>
                      <td className="nowrap">{dateOnly(h.monday)} to {dateOnly(h.monday + 6 * DAY)}</td>
                      <td className="nowrap">{dateOnly(h.paidOn)}</td>
                      <td className="num">{h.rows.length}</td>
                      <td className="num adm-strong">{money(h.total)}</td>
                      <td>{view.memberById(top.memberId)?.name} · {money(top.amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
