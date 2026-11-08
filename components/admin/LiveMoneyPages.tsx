"use client";

// ADMIN: real refunds and weekly payouts (live mode, phase 7).
//   Refunds: money owed back on bookings paid online (by the rules, or decided by the team) is sent back
//            through Razorpay by the "payments" server program; refunds already given are listed.
//   Payouts: for a week, what each caregiver earned, the cash they collected, and what to transfer; after the
//            bank transfer, record it with its reference (UTR) and the caregiver is told.

import { useEffect, useState } from "react";
import { serviceName, cityName } from "@/lib/admin/data";
import { loadPayouts, loadRefunds, recordPayout, type PayoutRow, type RefundDone, type RefundDue } from "@/lib/admin/live";
import { refundBooking } from "@/lib/payments";
import { useAdmin } from "@/lib/admin/store";
import { Badge, downloadText, csvRow, Empty, Field, PageHead, Tabs, useToast } from "./ui";

const money = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const day = (ms: number) => new Date(ms).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export function LiveRefundsPage() {
  const { state } = useAdmin();
  const toast = useToast();
  const [tab, setTab] = useState<"due" | "done">("due");
  const [data, setData] = useState<{ due: RefundDue[]; done: RefundDone[] } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const canSend = ["owner", "support", "finance"].includes(state.role);
  const load = async () => { try { setData(await loadRefunds()); setError(""); } catch (e) { setError((e as Error).message); } };
  useEffect(() => { void load(); }, []);

  const send = async (r: RefundDue) => {
    setBusy(r.booking);
    try {
      const res = await refundBooking("admin", r.booking);
      toast(res.refunded > 0 ? `${money(res.refunded)} sent back to ${r.patient} (${r.code})` : "Nothing left to send back");
      await load();
    } catch (e) { toast(`Not sent: ${(e as Error).message}`); } finally { setBusy(null); }
  };

  return (
    <>
      <PageHead title="Refunds" sub="Money owed back on bookings paid online goes back through Razorpay to the same UPI or card. Most are sent by the patient's app at once; anything still owed is listed here."
        actions={<button type="button" className="abtn" onClick={() => void load()}>Refresh</button>} />
      {error && <div className="adenied" role="alert">{error}</div>}
      <Tabs label="Refunds" value={tab} onChange={setTab} tabs={[{ id: "due", label: "Still to send", n: data?.due.length }, { id: "done", label: "Sent (60 days)", n: data?.done.length }]} />
      <section className="acard acard-flat">
        {tab === "due" && (data && data.due.length === 0 ? <Empty title="Nothing to send back" body="Refunds from cancelled or missed online bookings appear here if they have not gone out yet." /> : (
          <div className="atable-wrap"><table className="atable">
            <thead><tr><th>Booking</th><th>Patient</th><th>Service</th><th className="num">Paid</th><th className="num">Owed back</th><th className="num">Sent</th><th>Why</th><th /></tr></thead>
            <tbody>{(data?.due ?? []).map((r) => (
              <tr key={r.booking}>
                <td className="adm-strong nowrap">{r.code}</td><td>{r.patient}<span className="sub">{r.phone}</span></td><td>{serviceName(r.serviceId)}</td>
                <td className="num">{money(r.paid)}</td><td className="num adm-strong">{money(r.owed - r.refunded)}</td><td className="num">{money(r.refunded)}</td>
                <td>{r.reason || r.status}</td>
                <td>{canSend && <button type="button" className="abtn abtn-primary" disabled={busy === r.booking} onClick={() => void send(r)}>{busy === r.booking ? "Sending…" : "Send refund"}</button>}</td>
              </tr>))}</tbody>
          </table></div>
        ))}
        {tab === "done" && (data && data.done.length === 0 ? <Empty title="No refunds yet" /> : (
          <div className="atable-wrap"><table className="atable">
            <thead><tr><th>When</th><th>Booking</th><th>Patient</th><th className="num">Amount</th><th>How</th><th>By</th></tr></thead>
            <tbody>{(data?.done ?? []).map((r) => (
              <tr key={r.id}><td className="nowrap">{day(r.at)}</td><td className="adm-strong">{r.code}</td><td>{r.patient}</td><td className="num">{money(r.amount)}</td>
                <td>{r.gateway ? <Badge tone="ok">Razorpay {r.gateway}</Badge> : <Badge tone="muted">By hand</Badge>}<span className="sub">{r.note}</span></td><td>{r.by || "The rules"}</td></tr>))}</tbody>
          </table></div>
        ))}
      </section>
    </>
  );
}

/** Monday (India) of the week n weeks ago, as YYYY-MM-DD. */
function mondayISO(weeksAgo: number, payoutDay = 1) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() - payoutDay + 7) % 7) - 7 * weeksAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function LivePayoutsPage() {
  const { state } = useAdmin();
  const toast = useToast();
  const payoutDay = state.settings.payoutDay ?? 1;
  const [weeksAgo, setWeeksAgo] = useState(1); // last finished week, paid this week
  const week = mondayISO(weeksAgo, payoutDay);
  const [rows, setRows] = useState<PayoutRow[] | null>(null);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [utr, setUtr] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async () => { try { setRows(await loadPayouts(week)); setError(""); } catch (e) { setError((e as Error).message); } };
  useEffect(() => { setRows(null); void load(); }, [week]); // eslint-disable-line react-hooks/exhaustive-deps

  const toPay = (rows ?? []).filter((r) => r.net > 0 && !r.paid);
  const owesUs = (rows ?? []).filter((r) => r.net < 0);
  const open = rows?.find((r) => r.caregiver === openId) ?? null;
  const bankFile = () => downloadText(`payouts-${week}.csv`, [csvRow(["Name", "Account holder", "Account number", "IFSC", "UPI", "Amount", "Week"]),
    ...toPay.map((r) => csvRow([r.name, r.holder, r.accountFull, r.ifsc, r.upi, r.net, week]))].join("\n"));
  const save = async () => {
    if (!open) return;
    setBusy(true);
    try {
      await recordPayout(open.caregiver, week, Math.round(Number(amount)), utr.trim());
      toast(`${money(Number(amount))} recorded for ${open.name}. They are told.`);
      setOpenId(null); setUtr(""); await load();
    } catch (e) { toast(`Not saved: ${(e as Error).message}`); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHead title="Payouts" sub={`Week starting ${new Date(`${week}T00:00:00`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}. Send the bank transfers yourself, then record each one with its bank reference (UTR).`}
        actions={<>
          <button type="button" className="abtn" onClick={() => setWeeksAgo((n) => n + 1)}>Earlier week</button>
          <button type="button" className="abtn" disabled={weeksAgo === 0} onClick={() => setWeeksAgo((n) => Math.max(0, n - 1))}>Later week</button>
          <button type="button" className="abtn" disabled={!toPay.length} onClick={bankFile}>Bank file (CSV)</button>
        </>} />
      {error && <div className="adenied" role="alert">{error}</div>}
      {weeksAgo === 0 && <div className="anote info adm-small">This week is not over yet. Payouts are usually made for the week before.</div>}
      <section className="acard acard-flat">
        {rows !== null && rows.length === 0 ? <Empty title="No earnings this week" body="Caregivers' finished visits, missed visits and late cancellations appear here." /> : (
          <div className="atable-wrap"><table className="atable">
            <thead><tr><th>Caregiver</th><th>City</th><th className="num">Visits</th><th className="num">Earned</th><th className="num">Cash collected</th><th className="num">To pay</th><th>Bank</th><th>Status</th></tr></thead>
            <tbody>{(rows ?? []).map((r) => (
              <tr key={r.caregiver} className={r.net > 0 && !r.paid ? "click" : ""} onClick={() => { if (r.net > 0 && !r.paid) { setOpenId(r.caregiver); setAmount(String(r.net)); setUtr(""); } }}>
                <td className="adm-strong">{r.name}<span className="sub">{r.phone}</span></td><td>{cityName(r.cityId)}</td>
                <td className="num">{r.visits}</td><td className="num">{money(r.earned)}</td><td className="num">{money(r.cash)}</td>
                <td className="num adm-strong">{r.net < 0 ? <span>Owes us {money(-r.net)}</span> : money(r.net)}</td>
                <td>{r.holder ? `${r.holder} · ••••${r.account}` : "No bank account"}<span className="sub">{r.ifsc}{r.upi ? ` · ${r.upi}` : ""}</span></td>
                <td>{r.paid ? <Badge tone="ok">Paid {money(r.paid.amount)}</Badge> : r.net > 0 ? <Badge tone="warn">To pay</Badge> : r.net < 0 ? <Badge tone="danger">Collect cash</Badge> : <Badge tone="muted">Nothing due</Badge>}
                  {r.paid && <span className="sub">{r.paid.reference}</span>}</td>
              </tr>))}</tbody>
          </table></div>
        )}
      </section>
      {owesUs.length > 0 && <div className="anote adm-small">{owesUs.length} caregiver(s) collected more cash than they earned this week. Ask them to pay the difference by UPI; it is not taken automatically yet.</div>}
      {open && (
        <section className="acard adm-col" style={{ marginTop: 16 }}>
          <h2>Record the transfer to {open.name}</h2>
          <p className="adm-muted">{open.holder} · account {open.accountFull} · IFSC {open.ifsc}{open.upi ? ` · UPI ${open.upi}` : ""}</p>
          <div className="agrid agrid-2">
            <Field id="po-amount" label="Amount sent (₹)" type="number" value={amount} onChange={setAmount} />
            <Field id="po-utr" label="Bank reference (UTR)" value={utr} onChange={setUtr} placeholder="For example 4129 8830 1172" />
          </div>
          <div className="adm-row">
            <button type="button" className="abtn" onClick={() => setOpenId(null)}>Cancel</button>
            <button type="button" className="abtn abtn-primary" disabled={busy || !utr.trim() || !(Number(amount) > 0)} onClick={() => void save()}>{busy ? "Saving…" : "Record payout"}</button>
          </div>
        </section>
      )}
    </>
  );
}
