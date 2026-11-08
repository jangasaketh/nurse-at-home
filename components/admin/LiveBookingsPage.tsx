"use client";

// ADMIN: real bookings from the patient app (live mode). Support can see where each request stands,
// give it to a caregiver by hand, or cancel it. Every change goes through a database function
// (supabase/004_bookings.sql), which tells the patient and caregiver and writes the audit log.

import { useEffect, useState } from "react";
import { CITIES, SERVICES } from "@/lib/data";
import { cityName, serviceName } from "@/lib/admin/data";
import { assignBooking, cancelBookingAsTeam, giveRefund, loadBookings, loadCandidates, type Candidate, type LiveBooking } from "@/lib/admin/live";
import { refundBooking } from "@/lib/payments";
import { useAdmin } from "@/lib/admin/store";
import { Badge, Drawer, Empty, Field, PageHead, Select, useToast, type Tone } from "./ui";

const STATUS: Record<string, { text: string; tone: Tone }> = {
  requested: { text: "Waiting for a caregiver", tone: "warn" },
  accepted: { text: "Accepted", tone: "info" },
  en_route: { text: "On the way", tone: "info" },
  arrived: { text: "At the door", tone: "info" },
  in_progress: { text: "Care in progress", tone: "warn" },
  completed: { text: "Completed", tone: "ok" },
  cancelled: { text: "Cancelled", tone: "muted" },
  missed: { text: "Missed", tone: "muted" },
};
const ACTIVE = ["requested", "accepted", "en_route", "arrived", "in_progress"];
const REASONS = ["No caregiver available", "The patient asked support to cancel", "Safety concern", "Prescription not valid", "Duplicate booking"];
const money = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const when = (b: LiveBooking) => {
  const d = new Date(`${b.date}T00:00:00`);
  const day = d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
  return b.urgent ? `${day}, within 60 minutes` : `${day}, ${b.slot}`;
};

export function LiveBookingsPage() {
  const { state } = useAdmin();
  const canChange = state.role === "owner" || state.role === "support"; // finance can look, not change
  const [rows, setRows] = useState<LiveBooking[] | null>(null);
  const [error, setError] = useState(false);
  const [status, setStatus] = useState("active");
  const [city, setCity] = useState("all");
  const [service, setService] = useState("all");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const load = async () => {
    try { setRows(await loadBookings(30)); setError(false); } catch { setError(true); }
  };
  useEffect(() => {
    void load();
    const id = setInterval(() => { if (document.visibilityState !== "hidden") void load(); }, 15000);
    return () => clearInterval(id);
  }, []);

  const list = (rows ?? []).filter((b) => {
    if (status === "active" && !ACTIVE.includes(b.status)) return false;
    if (status !== "active" && status !== "all" && b.status !== status) return false;
    if (city !== "all" && b.cityId !== city) return false;
    if (service !== "all" && b.serviceId !== service) return false;
    if (q && !`${b.code} ${b.patient} ${b.accountName} ${b.accountPhone} ${b.caregiver}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
  const waiting = (rows ?? []).filter((b) => b.status === "requested").length;
  const open = rows?.find((b) => b.id === openId) ?? null;

  return (
    <>
      <PageHead title="Bookings" sub={rows === null ? "Loading bookings…" : `${rows.length} bookings from the patient app (last 30 days and everything still open). ${waiting ? `${waiting} waiting for a caregiver.` : ""} Updates every 15 seconds.`}
        actions={<button type="button" className="abtn" onClick={() => void load()}>Refresh</button>} />
      {error && <div className="adenied" role="alert">Could not load bookings. Check the internet connection, then press Refresh.</div>}
      <div className="afilters">
        <Field id="lbk-search" label="Search" value={q} onChange={setQ} placeholder="Booking, patient, phone or caregiver" />
        <Select id="lbk-status" label="Status" value={status} onChange={setStatus} options={[
          { value: "active", label: "Open (not finished)" }, { value: "all", label: "Any status" },
          ...Object.entries(STATUS).map(([value, s]) => ({ value, label: s.text })),
        ]} />
        <Select id="lbk-city" label="City" value={city} onChange={setCity} options={[{ value: "all", label: "All cities" }, ...CITIES.map((c) => ({ value: c.id, label: c.name }))]} />
        <Select id="lbk-service" label="Service" value={service} onChange={setService} options={[{ value: "all", label: "All services" }, ...SERVICES.map((s) => ({ value: s.id, label: s.name }))]} />
      </div>
      <section className="acard acard-flat">
        {rows !== null && list.length === 0 ? <Empty title="No bookings match" body={rows.length ? "Change the filters above." : "Bookings made in the patient app appear here."} /> : (
          <div className="atable-wrap">
            <table className="atable">
              <thead><tr><th>Booking</th><th>Visit</th><th>Service</th><th>Patient</th><th>Caregiver</th><th>City</th><th className="num">Price</th><th>Status</th></tr></thead>
              <tbody>
                {list.map((b) => (
                  <tr key={b.id} className="click" onClick={() => setOpenId(b.id)}>
                    <td className="nowrap adm-strong">{b.code}</td>
                    <td className="nowrap">{when(b)}{b.urgent && <span className="sub"><Badge tone="warn">Urgent</Badge></span>}</td>
                    <td>{serviceName(b.serviceId)}{b.visits > 1 && <span className="sub">Visit {b.visitNo} of {b.visits}</span>}</td>
                    <td>{b.patient}<span className="sub">{b.accountPhone}</span></td>
                    <td>{b.caregiver || (b.status === "requested" ? <span className="sub">{b.openOffers ? `Offered to ${b.openOffers}` : "Nobody offered right now"}</span> : "—")}</td>
                    <td>{cityName(b.cityId)}<span className="sub">{b.area}</span></td>
                    <td className="num">{money(b.total)}<span className="sub">{b.pay === "cash" ? "Cash" : b.pay.toUpperCase()}</span></td>
                    <td>{b.status === "requested" && b.pay !== "cash" && b.paymentStatus !== "paid" ? <Badge tone="muted">Waiting for payment</Badge> : <Badge tone={STATUS[b.status]?.tone ?? "muted"}>{STATUS[b.status]?.text ?? b.status}</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {open && <LiveBookingDrawer b={open} canChange={canChange} onClose={() => setOpenId(null)} onChanged={() => void load()} />}
    </>
  );
}

function LiveBookingDrawer({ b, canChange, onClose, onChanged }: { b: LiveBooking; canChange: boolean; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [mode, setMode] = useState<"assign" | "cancel" | "refund" | null>(null);
  const [refundAmt, setRefundAmt] = useState("");
  const [refundNote, setRefundNote] = useState("");
  const [cands, setCands] = useState<Candidate[] | null>(null);
  const [to, setTo] = useState("");
  const [reason, setReason] = useState(REASONS[0]);
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState<string | null>(null);
  const open = ACTIVE.includes(b.status);
  const canAssign = open && ["requested", "accepted"].includes(b.status);

  useEffect(() => {
    if (mode !== "assign") return;
    setCands(null);
    loadCandidates(b.id).then((c) => { setCands(c); setTo(c.find((x) => x.id !== b.caregiverId)?.id ?? ""); }).catch(() => setCands([]));
  }, [mode, b.id, b.caregiverId]);

  const act = async (work: () => Promise<void>, done: string) => {
    setBusy(true); setFail(null);
    try { await work(); toast(done); setMode(null); onChanged(); } catch (e) { setFail((e as Error)?.message || "That did not go through."); } finally { setBusy(false); }
  };

  const footer = !canChange ? null : mode === "assign" ? (
    <><button type="button" className="abtn" onClick={() => setMode(null)}>Back</button>
      <button type="button" className="abtn abtn-primary" disabled={!to || busy} onClick={() => act(() => assignBooking(b.id, to), `${b.code} now goes to ${cands?.find((c) => c.id === to)?.name ?? "the caregiver"}. They and the patient are told.`)}>{busy ? "Saving…" : "Give the visit"}</button></>
  ) : mode === "refund" ? (
    <><button type="button" className="abtn" onClick={() => setMode(null)}>Back</button>
      <button type="button" className="abtn abtn-primary" disabled={busy || !(Number(refundAmt) > 0) || refundNote.trim().length < 5}
        onClick={() => act(async () => {
          const r = await giveRefund(b.id, Math.round(Number(refundAmt)), refundNote.trim());
          if (r.online) await refundBooking("admin", b.id);
        }, b.pay === "cash" ? `Recorded ₹${refundAmt} paid back by hand for ${b.code}.` : `₹${refundAmt} is on its way back to the patient (${b.code}).`)}>{busy ? "Saving…" : "Give the refund"}</button></>
  ) : mode === "cancel" ? (
    <><button type="button" className="abtn" onClick={() => setMode(null)}>Keep the booking</button>
      <button type="button" className="abtn abtn-danger" disabled={busy} onClick={() => act(() => cancelBookingAsTeam(b.id, reason), `${b.code} is cancelled. The patient pays nothing.`)}>{busy ? "Cancelling…" : "Cancel the booking"}</button></>
  ) : (
    <>
      {canAssign && <button type="button" className="abtn" onClick={() => setMode("assign")}>{b.caregiverId ? "Give to another caregiver" : "Give to a caregiver"}</button>}
      {open && <button type="button" className="abtn abtn-danger" onClick={() => setMode("cancel")}>Cancel the booking…</button>}
      {(b.status === "completed" || b.status === "missed" || b.status === "cancelled" || b.amountPaid > 0) && <button type="button" className="abtn" onClick={() => { setMode("refund"); setRefundAmt(""); setRefundNote(""); }}>Give a refund…</button>}
    </>
  );

  return (
    <Drawer label={`Booking ${b.code}`} onClose={onClose} footer={footer}
      title={<span className="adm-row">{b.code} <Badge tone={STATUS[b.status]?.tone ?? "muted"}>{STATUS[b.status]?.text ?? b.status}</Badge>{b.urgent && <Badge tone="warn">Urgent</Badge>}</span>}
      sub={`${serviceName(b.serviceId)} · ${when(b)} · ${b.area}, ${cityName(b.cityId)}`}>
      <dl className="akv">
        <dt>Patient</dt><dd>{b.patient}</dd>
        <dt>Booked by</dt><dd>{b.accountName || "—"} · {b.accountPhone || "—"}</dd>
        <dt>Address</dt><dd>{b.address}</dd>
        <dt>Caregiver</dt><dd>{b.caregiver ? `${b.caregiver} · ${b.caregiverPhone}` : b.status === "requested" ? `Not yet. Offered to ${b.openOffers} now${b.declined ? `, ${b.declined} declined` : ""}.` : "—"}</dd>
        <dt>Visits</dt><dd>{b.visits > 1 ? `Visit ${b.visitNo} of a course of ${b.visits}` : "One visit"}</dd>
        <dt>Preferences</dt><dd>{[b.womenOnly ? "Woman caregiver" : "", b.language ? `Speaks ${b.language}` : ""].filter(Boolean).join(", ") || "None"}</dd>
        {b.note && <><dt>Note</dt><dd>{b.note}</dd></>}
        <dt>Payment</dt><dd>{money(b.total)} per visit · {b.pay === "cash" ? "Cash or UPI to the caregiver" : `${b.pay.toUpperCase()} · ${b.paymentStatus === "pending" ? "not paid yet" : b.paymentStatus === "failed" ? "payment failed" : `paid ${money(b.amountPaid)}${b.refunded ? `, ${money(b.refunded)} refunded` : ""}`}`}</dd>
        {(b.feeKept > 0 || b.refund > 0 || b.due > 0) && <><dt>Money</dt><dd>{[b.feeKept ? `Charge kept ${money(b.feeKept)}` : "", b.refund ? `Refund ${money(b.refund)}` : "", b.due ? `Owed by the patient ${money(b.due)}` : ""].filter(Boolean).join(" · ")}</dd></>}
        {b.cancelledBy && <><dt>Cancelled by</dt><dd>{b.cancelledBy === "admin" ? "Our team" : b.cancelledBy === "patient" ? "The patient" : "The caregiver"}{b.cancelReason ? `: ${b.cancelReason}` : ""}</dd></>}
        <dt>Booked</dt><dd>{new Date(b.createdAt).toLocaleString("en-IN")}</dd>
      </dl>

      {mode === "assign" && (
        <div className="adm-col" style={{ marginTop: 16 }}>
          <h3>Give the visit to</h3>
          {cands === null ? <p className="adm-muted">Loading caregivers who can do this…</p> : cands.length === 0 ? (
            <p className="adm-muted">No verified caregiver in this city can do this service.</p>
          ) : (
            <Select id="lbk-to" label="Caregiver" value={to} onChange={setTo} options={cands.filter((c) => c.id !== b.caregiverId).map((c) => ({
              value: c.id, label: `${c.name} · ${c.role === "nurse" ? "nurse" : "compounder"} · ${c.online ? "online" : "offline"}${c.area ? ` · ${c.area}` : ""}`,
            }))} />
          )}
          <p className="adm-muted">Call the caregiver first to check they can go. They get a notification, and the visit appears on their Jobs screen.</p>
        </div>
      )}
      {mode === "refund" && (
        <div className="adm-col" style={{ marginTop: 16 }}>
          <Field id="lbk-refund" label="Amount (₹)" type="number" value={refundAmt} onChange={setRefundAmt}
            hint={b.pay === "cash" ? "Cash booking: this records money you paid back by hand (UPI or cash)." : `Paid ${money(b.amountPaid)}. Sent back through Razorpay to the same UPI or card.`} />
          <Field id="lbk-refund-note" label="Why (kept in the audit log)" value={refundNote} onChange={setRefundNote} placeholder="For example: the patient was hospitalised" />
        </div>
      )}
      {mode === "cancel" && (
        <div className="adm-col" style={{ marginTop: 16 }}>
          <Select id="lbk-reason" label="Reason (the patient sees it)" value={reason} onChange={setReason} options={REASONS.map((r) => ({ value: r, label: r }))} />
          <p className="adm-muted">The patient pays nothing{b.pay !== "cash" ? " and gets a full refund" : ""}. The caregiver is told not to go.</p>
        </div>
      )}
      {fail && <div className="adenied" role="alert" style={{ marginTop: 12 }}>{fail}</div>}
    </Drawer>
  );
}
