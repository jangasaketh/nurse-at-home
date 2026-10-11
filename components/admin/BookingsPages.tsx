"use client";

// ADMIN: all bookings (reassign, cancel, refund) and patients' refund requests.

import { useState } from "react";
import { useAdmin, type RefundRow } from "@/lib/admin/store";
import { CITIES, SERVICES } from "@/lib/data";
import {
  ago, cityName, DAY, dateTime, isPaidOut, money, moneyFor, serviceName, startOfToday, STATUS_TEXT, type AdminBooking, type BookingStatus,
} from "@/lib/admin/data";
import { Badge, Drawer, Empty, Field, PageHead, Select, Tabs, useToast, type Tone } from "./ui";

const STATUS_TONE: Record<BookingStatus, Tone> = {
  upcoming: "info", "in-progress": "warn", completed: "ok", "cancelled-patient": "muted", "cancelled-caregiver": "danger", missed: "muted", "cancelled-admin": "muted",
};
const PAY_TEXT = { upi: "UPI", card: "Card", cash: "Cash" };
export const StatusBadge = ({ s }: { s: BookingStatus }) => <Badge tone={STATUS_TONE[s]}>{STATUS_TEXT[s]}</Badge>;

const ADMIN_CANCEL_REASONS = ["No caregiver available", "The patient asked support to cancel", "Safety concern", "Prescription not valid"];

/** Refunds already given for a booking (approved). */
function refunded(bookingId: string, refunds: RefundRow[]) {
  return refunds.filter((r) => r.bookingId === bookingId && r.decision?.status === "approved").reduce((s, r) => s + (r.decision?.amount ?? 0), 0);
}

type When = "all" | "today" | "tomorrow" | "past";

export function BookingsPage() {
  const { view, state } = useAdmin();
  const [when, setWhen] = useState<When>("all");
  const [status, setStatus] = useState<string>("all");
  const [city, setCity] = useState("all");
  const [service, setService] = useState("all");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const today = startOfToday();

  const rows = view.bookings.filter((b) => {
    if (when === "today" && !(b.at >= today && b.at < today + DAY)) return false;
    if (when === "tomorrow" && !(b.at >= today + DAY && b.at < today + 2 * DAY)) return false;
    if (when === "past" && b.at >= today) return false;
    if (status === "cancelled" ? !b.status.startsWith("cancelled") : status !== "all" && b.status !== status) return false;
    if (city !== "all" && b.cityId !== city) return false;
    if (service !== "all" && b.serviceId !== service) return false;
    if (q) {
      const cg = view.memberById(b.caregiverId)?.name ?? "";
      if (!`${b.id} ${b.patient.name} ${b.patient.phone} ${cg}`.toLowerCase().includes(q.toLowerCase())) return false;
    }
    return true;
  });
  const open = view.bookingById(openId);

  return (
    <>
      <PageHead title="Bookings" sub={`${view.bookings.length} bookings from the last 7 days and tomorrow (sample). Bookings from the patient app arrive here once the server is connected.`} />
      <div className="afilters">
        <Field id="bk-search" label="Search" value={q} onChange={setQ} placeholder="Booking, patient, phone or caregiver" />
        <Select<When> id="bk-when" label="When" value={when} onChange={setWhen} options={[{ value: "all", label: "All dates" }, { value: "today", label: "Today" }, { value: "tomorrow", label: "Tomorrow" }, { value: "past", label: "Before today" }]} />
        <Select id="bk-status" label="Status" value={status} onChange={setStatus} options={[
          { value: "all", label: "Any status" }, { value: "upcoming", label: "Upcoming" }, { value: "in-progress", label: "In progress" }, { value: "completed", label: "Completed" },
          { value: "cancelled", label: "Cancelled (any)" }, { value: "cancelled-caregiver", label: "Cancelled by caregiver" }, { value: "missed", label: "Missed" },
        ]} />
        <Select id="bk-city" label="City" value={city} onChange={setCity} options={[{ value: "all", label: "All cities" }, ...CITIES.map((c) => ({ value: c.id, label: c.name }))]} />
        <Select id="bk-service" label="Service" value={service} onChange={setService} options={[{ value: "all", label: "All services" }, ...SERVICES.map((s) => ({ value: s.id, label: s.name }))]} />
      </div>
      <section className="acard acard-flat">
        {rows.length === 0 ? <Empty title="No bookings match" body="Change the filters above." /> : (
          <div className="atable-wrap">
            <table className="atable">
              <thead><tr><th>Booking</th><th>Visit</th><th>Service</th><th>Patient</th><th>Caregiver</th><th>City</th><th className="num">Price</th><th>Pay</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id} className="click" onClick={() => setOpenId(b.id)}>
                    <td className="nowrap adm-strong">{b.id}</td>
                    <td className="nowrap">{dateTime(b.at)}{b.urgent && <span className="sub"><Badge tone="warn">Urgent</Badge></span>}</td>
                    <td>{serviceName(b.serviceId)}{b.visits > 1 && <span className="sub">Visit {b.visitNo} of {b.visits}</span>}</td>
                    <td>{b.patient.name}<span className="sub">{b.patient.forWhom === "Self" ? "For themself" : `For ${b.patient.forWhom.toLowerCase()}`}</span></td>
                    <td>{view.memberById(b.caregiverId)?.name ?? "—"}</td>
                    <td>{cityName(b.cityId)}</td>
                    <td className="num">{money(b.servicePrice + b.visitFee + b.urgentFee)}</td>
                    <td>{PAY_TEXT[b.pay]}</td>
                    <td><StatusBadge s={b.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="adm-small adm-muted">{rows.length} shown. Prices use the pay split in Settings ({state.settings.caregiverShare}% of the service price to the caregiver).</p>
      {open && <BookingDrawer b={open} onClose={() => setOpenId(null)} />}
    </>
  );
}

/* ---------- One booking ---------- */

export function BookingDrawer({ b, onClose }: { b: AdminBooking; onClose: () => void }) {
  const { view, state, update, log, nowMs } = useAdmin();
  const toast = useToast();
  const [mode, setMode] = useState<"reassign" | "cancel" | "refund" | null>(null);
  const cg = view.memberById(b.caregiverId);
  const svc = SERVICES.find((s) => s.id === b.serviceId);
  const m = moneyFor(b, state.settings);
  const given = refunded(b.id, view.refunds);
  const canRefund = Math.max(0, m.patientPays - given);
  const eligible = view.members.filter((x) => x.cityId === b.cityId && !x.suspended && x.id !== b.caregiverId && !x.live && (!svc?.nurseOnly || (x.role === "nurse" && x.tier === "full")));
  const [to, setTo] = useState(eligible[0]?.id ?? "");
  const [reason, setReason] = useState(ADMIN_CANCEL_REASONS[0]);
  const [amount, setAmount] = useState(String(canRefund));
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const related = view.refunds.filter((r) => r.bookingId === b.id);
  const tickets = view.tickets.filter((tk) => tk.bookingId === b.id);

  const edit = (patch: object) => update((prev) => ({ bookingEdits: { ...prev.bookingEdits, [b.id]: { ...prev.bookingEdits[b.id], ...patch, at: Date.now() } } }));
  const addRefund = (value: number, why: string) => {
    const id = `R-${6000 + state.extraRefunds.length}`;
    update((prev) => ({
      extraRefunds: [{ id, bookingId: b.id, reason: why, asked: value, at: Date.now(), from: "Admin team", createdByAdmin: true }, ...prev.extraRefunds],
      refundDecisions: { ...prev.refundDecisions, [id]: { status: "approved", amount: value, note: why, at: Date.now() } },
    }));
    return id;
  };

  const reassign = () => {
    const next = view.memberById(to);
    if (!next) return;
    edit({ caregiverId: to });
    log(`Reassigned ${b.id} from ${cg?.name ?? "—"} to ${next.name}`, "bookings");
    toast(`${b.id} now goes to ${next.name}. Both caregivers and the patient are told.`);
    setMode(null);
  };
  const cancel = () => {
    const full = b.servicePrice + b.visitFee + b.urgentFee;
    edit({ status: "cancelled-admin" as BookingStatus });
    if (b.pay !== "cash") addRefund(full, `Cancelled by us: ${reason}`);
    log(`Cancelled ${b.id} (${reason})${b.pay !== "cash" ? `, refunded ${money(full)}` : ""}`, "bookings");
    toast(`${b.id} is cancelled${b.pay !== "cash" ? ` and ${money(full)} refunded` : ""}`);
    setMode(null);
  };
  const refund = () => {
    setTried(true);
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0 || n > canRefund || note.trim().length < 5) return;
    const id = addRefund(Math.round(n), note.trim());
    log(`Refund ${id}: ${money(n)} for ${b.id} (${note.trim()})`, "bookings");
    toast(`${money(n)} refunded to ${b.patient.name}`);
    setMode(null);
  };

  const footer = mode === "reassign" ? (
    <><button type="button" className="abtn" onClick={() => setMode(null)}>Cancel</button><button type="button" className="abtn abtn-primary" onClick={reassign} disabled={!to}>Reassign</button></>
  ) : mode === "cancel" ? (
    <><button type="button" className="abtn" onClick={() => setMode(null)}>Keep the booking</button><button type="button" className="abtn abtn-danger" onClick={cancel}>Cancel the visit</button></>
  ) : mode === "refund" ? (
    <><button type="button" className="abtn" onClick={() => setMode(null)}>Cancel</button><button type="button" className="abtn abtn-primary" onClick={refund}>Refund</button></>
  ) : (
    <>
      {b.status === "upcoming" && <button type="button" className="abtn" onClick={() => setMode("reassign")}>Reassign caregiver</button>}
      {b.status === "upcoming" && <button type="button" className="abtn abtn-danger" onClick={() => setMode("cancel")}>Cancel the visit…</button>}
      {isPaidOut(b.status) && canRefund > 0 && <button type="button" className="abtn" onClick={() => { setMode("refund"); setTried(false); }}>Give a refund…</button>}
    </>
  );

  return (
    <Drawer label={`Booking ${b.id}`} onClose={onClose} footer={footer}
      title={<span className="adm-row">{b.id} <StatusBadge s={b.status} />{b.urgent && <Badge tone="warn">Urgent</Badge>}</span>}
      sub={`${serviceName(b.serviceId)} · ${dateTime(b.at)} · ${b.area}, ${cityName(b.cityId)}`}>
      <div className="agrid agrid-2" style={{ alignItems: "start" }}>
        <dl className="akv">
          <dt>Patient</dt><dd>{b.patient.name}, {b.patient.age}, {b.patient.gender === "F" ? "woman" : "man"}</dd>
          <dt>Booked by</dt><dd>{b.bookedBy} · {b.patient.phone}</dd>
          <dt>Caregiver</dt><dd>{cg ? `${cg.name} (${cg.role === "nurse" ? "nurse" : "compounder"})` : "—"}</dd>
          <dt>Visits</dt><dd>{b.visits > 1 ? `Visit ${b.visitNo} of a course of ${b.visits}` : "One visit"}</dd>
          {b.vitalIds.length > 0 && <><dt>Checks</dt><dd>{b.vitalIds.join(", ").toUpperCase()}</dd></>}
          <dt>Prescription</dt><dd>{b.hasPrescription ? "Uploaded, checked at the door" : "Not needed"}</dd>
          <dt>Payment</dt><dd>{PAY_TEXT[b.pay]}{b.pay === "cash" ? " (collected by the caregiver)" : ""}</dd>
          {b.cancelReason && <><dt>Reason</dt><dd>{b.cancelReason}{b.status === "cancelled-patient" ? (b.lateCancel ? ". Late: the visit charge was kept." : ". Early: no charge.") : ""}</dd></>}
        </dl>
        <section className="acard">
          <h3>Money</h3>
          <dl className="akv">
            <dt>Price</dt><dd className="adm-mono">{money(b.servicePrice)} service + {money(b.visitFee)} visit{b.urgentFee ? ` + ${money(b.urgentFee)} urgent` : ""}</dd>
            <dt>Patient pays</dt><dd className="adm-mono adm-strong">{money(m.patientPays)}</dd>
            <dt>Caregiver gets</dt><dd className="adm-mono">{money(m.caregiverGets)}</dd>
            <dt>We keep</dt><dd className="adm-mono">{money(m.platformKeeps - given)}</dd>
            {m.refundDue > 0 && <><dt>Returned automatically</dt><dd className="adm-mono">{money(m.refundDue)}</dd></>}
            {given > 0 && <><dt>Refunded by us</dt><dd className="adm-mono">{money(given)}</dd></>}
          </dl>
        </section>
      </div>

      <section className="adm-col">
        <h3>Timeline</h3>
        <div className="atimeline">
          <div>Booked {dateTime(b.bookedAt)} by {b.bookedBy}</div>
          {b.status !== "upcoming" && <div>{b.status.startsWith("cancelled") ? STATUS_TEXT[b.status] : b.status === "in-progress" ? "Caregiver arrived, care started" : b.status === "missed" ? `Caregiver waited ${state.settings.noShowMinutes} minutes, nobody answered` : "Visit completed, record saved"}{b.status === "completed" || b.status === "missed" ? ` · ${dateTime(b.at + 40 * 60000)}` : ""}</div>}
          {b.status === "upcoming" && <div>Visit {b.at - nowMs < DAY ? `in ${Math.max(1, Math.round((b.at - nowMs) / 3600000))} hours` : dateTime(b.at)}</div>}
          {related.map((r) => <div key={r.id}>Refund {r.id}: {r.decision ? `${r.decision.status === "approved" ? `${money(r.decision.amount)} approved` : "declined"} ${ago(r.decision.at, nowMs)}` : `${money(r.asked)} asked, waiting`}</div>)}
          {tickets.map((tk) => <div key={tk.id}>Support ticket {tk.id}: {tk.topic} ({tk.status})</div>)}
        </div>
      </section>

      {mode === "reassign" && (
        <section className="acard" style={{ borderColor: "var(--a-primary)" }}>
          <h3>Give this visit to someone else</h3>
          {eligible.length === 0 ? <p className="adm-small">Nobody else in {cityName(b.cityId)} can take this service.</p> : (
            <Select id="bk-reassign" label={`Caregivers in ${cityName(b.cityId)} who can take ${serviceName(b.serviceId).toLowerCase()}`} value={to} onChange={setTo}
              options={eligible.map((x) => ({ value: x.id, label: `${x.name} · ${x.ratings ? `${x.rating.toFixed(1)} ★` : "new"} · ${x.online ? "online" : "offline"}` }))} />
          )}
        </section>
      )}
      {mode === "cancel" && (
        <section className="acard" style={{ borderColor: "var(--a-danger)" }}>
          <h3>Cancel this visit</h3>
          <div className="adm-col" role="radiogroup" aria-label="Reason">
            {ADMIN_CANCEL_REASONS.map((r) => <label key={r} className="achoice"><input type="radio" name="creason" checked={reason === r} onChange={() => setReason(r)} /><span>{r}</span></label>)}
          </div>
          <p className="adm-small adm-muted">{b.pay === "cash" ? "Paid in cash, so there is nothing to refund." : `The patient gets the full ${money(b.servicePrice + b.visitFee + b.urgentFee)} back. The caregiver is not paid.`}</p>
        </section>
      )}
      {mode === "refund" && (
        <section className="acard" style={{ borderColor: "var(--a-primary)" }}>
          <h3>Refund</h3>
          <div className="agrid agrid-2">
            <Field id="bk-refund-amount" label="Amount (₹)" type="number" value={amount} onChange={setAmount} hint={`Up to ${money(canRefund)}`} error={tried && (!(Number(amount) > 0) || Number(amount) > canRefund) ? `Enter an amount from ₹1 to ${money(canRefund)}.` : ""} />
            <Field id="bk-refund-note" label="Why (shown to the patient)" value={note} onChange={setNote} error={tried && note.trim().length < 5 ? "Say why." : ""} />
          </div>
          {b.pay === "cash" && <p className="adm-small adm-muted">Paid in cash: the refund goes to the patient’s UPI.</p>}
        </section>
      )}
    </Drawer>
  );
}

/* ---------- Refund requests ---------- */

function ruleHint(r: RefundRow, freeHours: number) {
  const b = r.booking;
  if (!b) return "";
  if (/twice|double/i.test(r.reason)) return "Check the payment gateway for two payments of the same amount on the same day. If found, refund the second one in full.";
  if (b.status === "cancelled-patient" && b.lateCancel) return `Rule: the visit charge is kept when the patient cancels less than ${freeHours} hours before. The rule allows us to waive it if the patient was hospitalised or got worse.`;
  if (b.status === "missed") return "Check the caregiver’s call attempts and arrival location before refunding. If the caregiver did not call, refund the visit charge.";
  if (b.urgent && /urgent|60/i.test(r.reason)) return "Urgent visits promise arrival within 60 minutes. If it was later, refund the urgent charge.";
  if (b.status === "completed") return "A full refund after a completed visit is only for a serious problem. Read the visit record and talk to the caregiver first.";
  return "";
}

export function RefundsPage() {
  const { view, nowMs } = useAdmin();
  const [tab, setTab] = useState<"waiting" | "done">("waiting");
  const [openId, setOpenId] = useState<string | null>(null);
  const waiting = view.refunds.filter((r) => !r.decision);
  const done = view.refunds.filter((r) => r.decision).sort((a, b) => (b.decision?.at ?? 0) - (a.decision?.at ?? 0));
  const rows = tab === "waiting" ? waiting : done;
  const open = view.refunds.find((r) => r.id === openId) ?? null;
  const paidOut = done.filter((r) => r.decision?.status === "approved").reduce((s, r) => s + (r.decision?.amount ?? 0), 0);

  return (
    <>
      <PageHead title="Refunds" sub={`Patients asking for money back. ${money(paidOut)} refunded from this panel so far.`} />
      <Tabs label="Refund lists" value={tab} onChange={setTab} tabs={[{ id: "waiting", label: "Waiting", n: waiting.length }, { id: "done", label: "Decided", n: done.length }]} />
      <section className="acard acard-flat">
        {rows.length === 0 ? <Empty title={tab === "waiting" ? "No refund requests waiting" : "Nothing decided yet"} /> : (
          <div className="atable-wrap">
            <table className="atable">
              <thead><tr><th>Request</th><th>Booking</th><th>Patient</th><th>Reason</th><th className="num">Asked</th><th>{tab === "waiting" ? "Asked" : "Decision"}</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="click" onClick={() => setOpenId(r.id)}>
                    <td className="adm-strong nowrap">{r.id}</td>
                    <td className="nowrap">{r.bookingId}<span className="sub">{r.booking ? STATUS_TEXT[r.booking.status] : ""}</span></td>
                    <td>{r.from}</td>
                    <td className="adm-small" style={{ maxWidth: 380 }}>{r.reason}</td>
                    <td className="num">{money(r.asked)}</td>
                    <td className="nowrap">{r.decision ? (r.decision.status === "approved" ? <Badge tone="ok">Refunded {money(r.decision.amount)}</Badge> : <Badge tone="danger">Declined</Badge>) : ago(r.at, nowMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {open && <RefundDrawer r={open} onClose={() => setOpenId(null)} />}
    </>
  );
}

function RefundDrawer({ r, onClose }: { r: RefundRow; onClose: () => void }) {
  const { view, state, update, log, nowMs } = useAdmin();
  const toast = useToast();
  const b = r.booking;
  const m = b ? moneyFor(b, state.settings) : null;
  const max = Math.max(0, (m?.patientPays ?? 0) - refunded(r.bookingId, view.refunds));
  const [mode, setMode] = useState<"approve" | "decline" | null>(null);
  const [amount, setAmount] = useState(String(Math.min(r.asked, max || r.asked)));
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const hint = ruleHint(r, state.settings.freeUntilHours);
  const cg = b ? view.memberById(b.caregiverId) : null;

  const decide = (status: "approved" | "declined") => {
    setTried(true);
    const n = Math.round(Number(amount));
    if (status === "approved" && (!(n > 0) || (max > 0 && n > max))) return;
    if (status === "declined" && note.trim().length < 5) return;
    update((prev) => ({ refundDecisions: { ...prev.refundDecisions, [r.id]: { status, amount: status === "approved" ? n : 0, note: note.trim(), at: Date.now() } } }));
    log(status === "approved" ? `Refund ${r.id}: ${money(n)} to ${r.from} for ${r.bookingId}` : `Declined refund ${r.id} for ${r.bookingId}: “${note.trim()}”`, "refunds");
    toast(status === "approved" ? `${money(n)} refunded to ${r.from}` : "Refund declined. The patient is told why.");
    onClose();
  };

  return (
    <Drawer narrow label={`Refund ${r.id}`} onClose={onClose}
      title={`Refund ${r.id}`} sub={`${r.from} · asked ${ago(r.at, nowMs)} · ${money(r.asked)}`}
      footer={r.decision ? undefined : mode === null ? (
        <><button type="button" className="abtn" onClick={() => { setMode("decline"); setTried(false); }}>Decline…</button><button type="button" className="abtn abtn-primary" onClick={() => { setMode("approve"); setTried(false); }}>Approve…</button></>
      ) : mode === "approve" ? (
        <><button type="button" className="abtn" onClick={() => setMode(null)}>Cancel</button><button type="button" className="abtn abtn-primary" onClick={() => decide("approved")}>Refund {Number(amount) > 0 ? money(Number(amount)) : ""}</button></>
      ) : (
        <><button type="button" className="abtn" onClick={() => setMode(null)}>Cancel</button><button type="button" className="abtn abtn-danger" onClick={() => decide("declined")}>Decline</button></>
      )}>
      <div className="amsg"><b>{r.from} wrote</b>{r.reason}</div>
      {b && (
        <dl className="akv">
          <dt>Booking</dt><dd>{b.id} · <StatusBadge s={b.status} /></dd>
          <dt>Service</dt><dd>{serviceName(b.serviceId)}{b.urgent ? " (urgent)" : ""}, {dateTime(b.at)}</dd>
          <dt>Caregiver</dt><dd>{cg?.name ?? "—"}</dd>
          <dt>Patient paid</dt><dd className="adm-mono">{money(m?.patientPays ?? 0)} by {b.pay === "cash" ? "cash" : b.pay.toUpperCase()}</dd>
          <dt>Can still refund</dt><dd className="adm-mono">{money(max)}</dd>
        </dl>
      )}
      {hint && <div className="anote info">{hint}</div>}
      {r.decision && (
        <div className={`anote ${r.decision.status === "approved" ? "ok" : "danger"}`}>
          {r.decision.status === "approved" ? `Refunded ${money(r.decision.amount)}` : "Declined"} {ago(r.decision.at, nowMs)}.{r.decision.note ? ` Note: ${r.decision.note}` : ""}
        </div>
      )}
      {!r.decision && mode === "approve" && (
        <div className="adm-col">
          <Field id="rf-amount" label="Amount to refund (₹)" type="number" value={amount} onChange={setAmount} hint={`Asked ${money(r.asked)}. Up to ${money(max)}.`} error={tried && (!(Number(amount) > 0) || (max > 0 && Number(amount) > max)) ? `Enter an amount from ₹1 to ${money(max)}.` : ""} />
          <Field id="rf-note" label="Note to the patient (optional)" value={note} onChange={setNote} />
          <p className="adm-small adm-muted">The money goes back the way they paid, in 5 to 7 working days. Cash payments are refunded to their UPI.</p>
        </div>
      )}
      {!r.decision && mode === "decline" && (
        <Field id="rf-why" label="Why not (shown to the patient)" value={note} onChange={setNote} multiline error={tried && note.trim().length < 5 ? "Say why, so the patient understands." : ""} />
      )}
    </Drawer>
  );
}
