"use client";

// ADMIN PANEL ↔ DATABASE (phases 3 and 4): real caregivers, their documents, verification decisions and
// history. Reading uses the access rules (the verification team sees documents; others see less);
// every decision goes through a database function (supabase/003_verification.sql).

import { db } from "@/lib/supabase";
import { viewLinks } from "@/lib/files";
import { ID_TYPES } from "@/lib/caregiver/data";
import type { PhotoFile } from "@/lib/prescription";
import type { Applicant, HistoryEvent, HistoryKind, Member, Renewal, Tier } from "./data";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export type SentBackRow = { id: string; name: string; cityId: string; step: string; reason: string; at: number };
export type ApprovedRow = { id: string; name: string; role: "nurse" | "compounder"; tier: Tier; cityId: string; at: number };

export type LiveData = {
  applicants: Applicant[];
  sentBack: SentBackRow[];
  approved: ApprovedRow[];
  members: (Member & { suspended: { reason: string; at: number } | null })[];
  renewals: Renewal[];
  history: Record<string, HistoryEvent[]>;
  docs: Record<string, { id: PhotoFile | null; selfie: PhotoFile | null; certificate: PhotoFile | null; renewal: PhotoFile | null }>;
  loadedAt: number;
};

const ms = (d: string | null | undefined) => (d ? new Date(d).getTime() : 0);
const ym = (d: string | null | undefined) => (d ? d.slice(0, 7) : undefined);

function photo(doc: Row | undefined): PhotoFile | null {
  if (!doc) return null;
  const path: string = doc.storage_path;
  return { kind: path.toLowerCase().endsWith(".pdf") ? "pdf" : "image", name: path.split("/").pop() ?? doc.kind, size: 0, dataUrl: null, addedAt: ms(doc.created_at), path };
}

const ACTION_KIND: Record<string, HistoryKind> = {
  approved: "approved", sent_back: "sent-back", paused: "paused", reinstated: "reinstated", tier: "tier",
  renewal_approved: "renewal-approved", renewal_refused: "renewal-refused", reminder: "reminder",
};

export async function loadLive(): Promise<LiveData> {
  const client = db("admin");
  const cg = await client.from("caregivers").select("*").order("created_at", { ascending: false });
  if (cg.error) throw cg.error;
  const rows = cg.data ?? [];
  const ids = rows.map((r) => r.id);
  const none = ["00000000-0000-0000-0000-000000000000"];
  const [profiles, quals, banks, docs, audit, team] = await Promise.all([
    client.from("profiles").select("id, full_name, phone").in("id", ids.length ? ids : none),
    client.from("caregiver_qualifications").select("*").in("caregiver_id", ids.length ? ids : none),
    client.from("caregiver_bank").select("caregiver_id, holder, account_number, ifsc, upi").in("caregiver_id", ids.length ? ids : none),
    client.from("kyc_documents").select("*").in("caregiver_id", ids.length ? ids : none).order("created_at", { ascending: false }),
    client.from("audit_log").select("actor, action, subject_id, detail, created_at").in("subject_id", ids.length ? ids : none).order("created_at", { ascending: false }),
    client.from("admin_users").select("id, name"),
  ]);
  // Some of these are hidden from some roles by the access rules: treat a refusal as "nothing to show".
  const list = (r: { data: Row[] | null; error: unknown }) => (r.error ? [] : r.data ?? []);
  const P = new Map(list(profiles).map((p) => [p.id, p]));
  const Q = new Map(list(quals).map((q) => [q.caregiver_id, q]));
  const B = new Map(list(banks).map((b) => [b.caregiver_id, b]));
  const D = list(docs);
  const A = list(audit);
  const names = new Map(list(team).map((m) => [m.id, m.name]));
  const latest = (id: string, kind: string) => D.find((d) => d.caregiver_id === id && d.kind === kind && d.status !== "rejected");

  const applicants: Applicant[] = [];
  const sentBack: SentBackRow[] = [];
  const approved: ApprovedRow[] = [];
  const members: LiveData["members"] = [];
  const history: Record<string, HistoryEvent[]> = {};
  const docsOf: LiveData["docs"] = {};

  for (const r of rows) {
    const p = P.get(r.id) ?? {};
    const q = Q.get(r.id) ?? {};
    const b = B.get(r.id);
    const name = p.full_name || "New caregiver";
    const phone = (p.phone ?? "").replace(/^91/, "");
    const idDoc = latest(r.id, "id");
    docsOf[r.id] = {
      id: photo(idDoc), selfie: photo(latest(r.id, "selfie")), certificate: photo(latest(r.id, "certificate")),
      renewal: photo(D.find((d) => d.caregiver_id === r.id && d.kind === "renewal" && d.status === "submitted")),
    };
    const sent = D.filter((d) => d.caregiver_id === r.id && d.kind !== "renewal").map((d) => ms(d.created_at));
    const submittedAt = sent.length ? Math.max(...sent) : ms(r.updated_at);

    // History: documents sent, and every decision in the audit log.
    const ev: HistoryEvent[] = [];
    // Documents sent together form one entry; a decision in between starts a new one.
    const mine = A.filter((x) => x.subject_id === r.id);
    const decisionTimes = mine.map((a) => ms(a.created_at));
    const sentDocs = D.filter((x) => x.caregiver_id === r.id).sort((x, y) => ms(x.created_at) - ms(y.created_at));
    let group: { at: number; last: number; kinds: string[] } | null = null;
    const flush = () => { if (group) ev.push({ at: group.at, kind: "documents", text: group.kinds.join(", ") }); group = null; };
    for (const d of sentDocs) {
      const at = ms(d.created_at);
      if (d.kind === "renewal") { ev.push({ at, kind: "renewal-sent", text: `Renewed registration certificate, valid until ${ym(d.valid_until) ?? "?"}` }); continue; }
      const label = d.kind === "id" ? "ID" : d.kind === "selfie" ? "selfie" : "certificate";
      if (group && (at - group.last > 120000 || decisionTimes.some((t) => t > group!.last && t <= at))) flush();
      if (!group) group = { at, last: at, kinds: [] };
      group.kinds.push(label);
      group.last = at;
    }
    flush();
    for (const a of mine) {
      const kind = ACTION_KIND[a.action];
      if (kind) ev.push({ at: ms(a.created_at), kind, text: a.detail?.text ?? "", by: names.get(a.actor) ?? undefined });
    }
    history[r.id] = ev.sort((x, y) => y.at - x.at);

    if (r.kyc_status === "submitted") {
      applicants.push({
        id: r.id, db: true, name, phone, role: r.role, gender: r.gender ?? "", dob: r.dob ?? "", cityId: r.city_id ?? "hyd", area: r.area ?? "", pincode: r.pincode ?? "",
        languages: r.languages ?? [], submittedAt,
        idType: ID_TYPES.find((x) => x.id === idDoc?.id_type)?.name ?? "ID", idLast4: idDoc?.id_last4 ?? "",
        idPhoto: photo(idDoc), selfie: photo(latest(r.id, "selfie")), certificate: photo(latest(r.id, "certificate")),
        course: q.course ?? "", council: q.council ?? "", regNo: q.reg_no ?? "", validUntil: ym(q.valid_until), years: q.years != null ? String(q.years) : "",
        refName: q.ref_name ?? "", refPhone: q.ref_phone ?? "",
        bank: { holder: b?.holder ?? "", account: b?.account_number ? `••••${String(b.account_number).slice(-4)}` : "", ifsc: b?.ifsc ?? "", upi: b?.upi ?? "" },
        notes: [], resubmitted: ev.some((e) => e.kind === "sent-back"),
      });
    } else if (r.kyc_status === "rejected") {
      const last = ev.find((e) => e.kind === "sent-back");
      sentBack.push({ id: r.id, name, cityId: r.city_id ?? "hyd", step: r.rejected_step ?? "", reason: r.rejected_reason ?? "", at: last?.at ?? ms(r.updated_at) });
    } else if (r.kyc_status === "approved") {
      const ok = ev.find((e) => e.kind === "approved");
      approved.push({ id: r.id, name, role: r.role, tier: r.tier, cityId: r.city_id ?? "hyd", at: ok?.at ?? ms(r.updated_at) });
      members.push({
        id: r.id, db: true, name, role: r.role, tier: r.role === "compounder" ? "basic" : r.tier, gender: r.gender ?? "", cityId: r.city_id ?? "hyd", area: r.area ?? "", phone,
        joinedAt: ok?.at ?? ms(r.created_at), rating: Number(r.rating ?? 0), ratings: r.ratings_count ?? 0, visits: r.visits_done ?? 0, cancels30: 0, complaints: 0,
        course: q.course ?? "", council: q.council ?? "", regNo: q.reg_no ?? "", validUntil: ym(q.valid_until), online: !!r.online,
        bankLast4: b?.account_number ? String(b.account_number).slice(-4) : "",
        suspended: r.suspended_at ? { reason: r.suspended_reason ?? "", at: ms(r.suspended_at) } : null,
      });
    }
  }

  const renewals: Renewal[] = D.filter((d) => d.kind === "renewal" && d.status === "submitted").map((d) => ({
    id: d.id, memberId: d.caregiver_id, db: true, validUntil: ym(d.valid_until) ?? "", certificate: photo(d), sentAt: ms(d.created_at),
  }));

  return { applicants, sentBack, approved, members, renewals, history, docs: docsOf, loadedAt: Date.now() };
}

/** Fill in 10-minute links so the documents can be seen. */
export async function withLinks<T extends PhotoFile | null>(files: T[]): Promise<T[]> {
  const links = await viewLinks("admin", "kyc", files.map((f) => f?.path ?? "").filter(Boolean));
  return files.map((f) => (f && f.path && links[f.path] ? { ...f, dataUrl: links[f.path] } : f));
}

/* ---------- Decisions (each is one database function) ---------- */

const rpc = async (fn: string, args: Record<string, unknown>) => {
  const { data, error } = await db("admin").rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

export const approveCaregiver = (id: string, tier: Tier, checklist: string[]) => rpc("review_caregiver", { p_caregiver: id, p_decision: "approved", p_tier: tier, p_checklist: checklist });
export const sendBackCaregiver = (id: string, step: string, reason: string) => rpc("review_caregiver", { p_caregiver: id, p_decision: "sent_back", p_step: step, p_reason: reason });
export const pauseCaregiver = (id: string, reason: string | null) => rpc("set_caregiver_pause", { p_caregiver: id, p_reason: reason });
export const setTier = (id: string, tier: Tier) => rpc("set_caregiver_tier", { p_caregiver: id, p_tier: tier });
export const reviewRenewal = (docId: string, approve: boolean, reason?: string) => rpc("review_renewal", { p_document: docId, p_approve: approve, p_reason: reason ?? null });
export const remindRenewal = (id: string) => rpc("remind_renewal", { p_caregiver: id });
export const sendBroadcast = (title: string, body: string, city: string | null, role: string | null, onlineOnly: boolean) =>
  rpc("send_broadcast", { p_title: title, p_body: body, p_city: city, p_role: role, p_online_only: onlineOnly }) as Promise<number>;

/* ---------- Bookings (phase 5) ---------- */

export type LiveBooking = {
  id: string; code: string; status: string; serviceId: string; cityId: string; area: string; address: string; date: string; slot: string;
  urgent: boolean; visitNo: number; visits: number; pay: string; total: number; feeKept: number; refund: number; due: number;
  patient: string; accountName: string; accountPhone: string; caregiverId: string | null; caregiver: string; caregiverPhone: string;
  womenOnly: boolean; language: string; note: string; createdAt: number; cancelledBy: string | null; cancelReason: string;
  openOffers: number; declined: number;
  paymentStatus: string; amountPaid: number; refunded: number;
};

export async function loadBookings(days = 30): Promise<LiveBooking[]> {
  const { data, error } = await db("admin").rpc("admin_bookings", { p_days: days });
  if (error) throw error;
  return ((data as Row[]) ?? []).map((b) => ({
    id: b.id, code: b.code, status: b.status, serviceId: b.service_id, cityId: b.city_id, area: b.area ?? "", address: b.address ?? "",
    date: b.date, slot: b.slot, urgent: !!b.urgent, visitNo: b.visit_no, visits: b.visits, pay: b.pay, total: b.total ?? 0,
    feeKept: b.fee_kept ?? 0, refund: b.refund_amount ?? 0, due: b.due_amount ?? 0, patient: b.patient ?? "", accountName: b.account_name ?? "",
    accountPhone: b.account_phone ?? "", caregiverId: b.caregiver_id, caregiver: b.caregiver ?? "", caregiverPhone: b.caregiver_phone ?? "",
    womenOnly: !!b.women_only, language: b.language ?? "", note: b.note ?? "", createdAt: ms(b.created_at), cancelledBy: b.cancelled_by,
    cancelReason: b.cancel_reason ?? "", openOffers: b.open_offers ?? 0, declined: b.declined ?? 0,
    paymentStatus: b.payment_status ?? "none", amountPaid: b.amount_paid ?? 0, refunded: b.refunded ?? 0,
  }));
}

export type Candidate = { id: string; name: string; phone: string; role: string; online: boolean; area: string; rating: number | null };

export async function loadCandidates(bookingId: string): Promise<Candidate[]> {
  const { data, error } = await db("admin").rpc("admin_candidates", { p_booking: bookingId });
  if (error) throw error;
  return ((data as Row[]) ?? []).map((c) => ({ id: c.id, name: c.name ?? "", phone: c.phone ?? "", role: c.role, online: !!c.online, area: c.area ?? "", rating: c.rating }));
}

export async function assignBooking(bookingId: string, caregiverId: string) {
  const { error } = await db("admin").rpc("admin_assign", { p_booking: bookingId, p_caregiver: caregiverId });
  if (error) throw error;
}

export async function cancelBookingAsTeam(bookingId: string, reason: string) {
  const { error } = await db("admin").rpc("admin_cancel", { p_booking: bookingId, p_reason: reason });
  if (error) throw error;
}

/* ---------- Refunds and payouts (phase 7) ---------- */

export type RefundDue = { booking: string; code: string; serviceId: string; patient: string; phone: string; paid: number; owed: number; refunded: number; status: string; reason: string; at: number };
export type RefundDone = { id: string; booking: string; code: string; patient: string; amount: number; note: string; gateway: string | null; by: string; at: number };

export async function loadRefunds(): Promise<{ due: RefundDue[]; done: RefundDone[] }> {
  const { data, error } = await db("admin").rpc("admin_refunds", { p_days: 60 });
  if (error) throw error;
  const d = data as { due: Row[]; done: Row[] };
  return {
    due: (d.due ?? []).map((r) => ({ booking: r.booking, code: r.code, serviceId: r.service_id, patient: r.patient ?? "", phone: r.phone ?? "", paid: r.paid, owed: r.owed, refunded: r.refunded, status: r.status, reason: r.reason ?? "", at: ms(r.at) })),
    done: (d.done ?? []).map((r) => ({ id: r.id, booking: r.booking, code: r.code, patient: r.patient ?? "", amount: r.amount, note: r.note ?? "", gateway: r.gateway, by: r.by ?? "", at: ms(r.at) })),
  };
}

/** Raise what is owed back for a booking (beyond the rules), or record money paid back by hand (cash). */
export async function giveRefund(bookingId: string, amount: number, note: string): Promise<{ online: boolean }> {
  const { data, error } = await db("admin").rpc("admin_refund", { p_booking: bookingId, p_amount: amount, p_note: note });
  if (error) throw error;
  return data as { online: boolean };
}

export type PayoutRow = {
  caregiver: string; name: string; phone: string; cityId: string; visits: number; earned: number; cash: number; net: number;
  holder: string; account: string; accountFull: string; ifsc: string; upi: string; paid: { amount: number; reference: string; at: number } | null;
};

export async function loadPayouts(weekStart: string): Promise<PayoutRow[]> {
  const { data, error } = await db("admin").rpc("admin_payouts", { p_week: weekStart });
  if (error) throw error;
  return ((data as Row[]) ?? []).map((p) => ({
    caregiver: p.caregiver, name: p.name ?? "", phone: p.phone ?? "", cityId: p.city_id ?? "", visits: p.visits, earned: p.earned, cash: p.cash, net: p.net,
    holder: p.holder ?? "", account: p.account ?? "", accountFull: p.account_full ?? "", ifsc: p.ifsc ?? "", upi: p.upi ?? "",
    paid: p.paid ? { amount: p.paid.amount, reference: p.paid.reference, at: ms(p.paid.at) } : null,
  }));
}

export async function recordPayout(caregiverId: string, weekStart: string, amount: number, reference: string) {
  const { error } = await db("admin").rpc("admin_record_payout", { p_caregiver: caregiverId, p_week: weekStart, p_amount: amount, p_reference: reference });
  if (error) throw error;
}

// ---------- 1.8.0: support, patients, dashboard and reports from the database (supabase/008_launch.sql) ----------

export type LiveTicket = {
  id: string; code: string; from: "patient" | "caregiver"; name: string; phone: string; userId: string; topic: string; message: string;
  urgent: boolean; status: "open" | "resolved"; at: number; photoPath: string | null; bookingId: string | null; booking: string | null;
  replies: { text: string; at: number; by: string }[];
};
export async function loadTickets(): Promise<LiveTicket[]> {
  const { data, error } = await db("admin").rpc("admin_tickets", { p_days: 60 });
  if (error) throw error;
  return ((data as Row[]) ?? []).map((t) => ({
    id: t.id, code: t.code, from: t.from, name: t.name ?? "", phone: t.phone ?? "", userId: t.user_id, topic: t.topic, message: t.message,
    urgent: !!t.urgent, status: t.status, at: ms(t.at), photoPath: t.photo_path ?? null, bookingId: t.booking_id ?? null, booking: t.booking ?? null,
    replies: ((t.replies as Row[]) ?? []).map((r) => ({ text: r.text, at: ms(r.at), by: r.by ?? "" })),
  }));
}
export async function replyTicket(id: string, text: string, resolve: boolean) {
  const { error } = await db("admin").rpc("reply_ticket", { p_ticket: id, p_text: text, p_resolve: resolve });
  if (error) throw error;
}
export async function setTicketStatus(id: string, status: "open" | "resolved") {
  const { error } = await db("admin").rpc("set_ticket_status", { p_ticket: id, p_status: status });
  if (error) throw error;
}
export async function ticketPhotoLink(path: string) {
  return (await viewLinks("admin", "tickets", [path]))[path] ?? null;
}

export type LivePatientRow = {
  id: string; name: string; phone: string; joined: number; cityId: string | null; family: { name: string; relation: string; age: number | null; gender: string }[];
  bookings: number; lastVisit: number | null; openTickets: number; owed: number;
};
export async function loadPatients(): Promise<LivePatientRow[]> {
  const { data, error } = await db("admin").rpc("admin_patients");
  if (error) throw error;
  return ((data as Row[]) ?? []).map((p) => ({
    id: p.id, name: p.name || "(no name yet)", phone: p.phone ?? "", joined: ms(p.joined), cityId: p.city_id ?? null, family: (p.family as Row[] as LivePatientRow["family"]) ?? [],
    bookings: p.bookings ?? 0, lastVisit: p.last_visit ? ms(p.last_visit) : null, openTickets: p.open_tickets ?? 0, owed: p.owed ?? 0,
  }));
}
export type LivePatient = {
  id: string; name: string; phone: string; joined: number; consentAt: number | null; lang: string;
  family: { name: string; relation: string; age: number | null; gender: string }[];
  addresses: { label: string; line: string; area: string; cityId: string; pincode: string; landmark: string; pinned: boolean }[];
  contact: { name: string; relation: string; phone: string } | null;
  bookings: { id: string; code: string; status: string; serviceId: string; date: string; slot: string; total: number; pay: string; patient: string; caregiver: string | null }[];
  tickets: { code: string; topic: string; status: string; urgent: boolean; at: number }[];
  refunds: { booking: string; amount: number; reason: string; at: number }[];
  owed: number;
};
export async function loadPatient(id: string): Promise<LivePatient> {
  const { data, error } = await db("admin").rpc("admin_patient", { p_id: id });
  if (error) throw error;
  const p = data as Row;
  return {
    id: p.id, name: p.name || "(no name yet)", phone: p.phone ?? "", joined: ms(p.joined), consentAt: p.consent_at ? ms(p.consent_at) : null, lang: p.lang ?? "en",
    family: p.family ?? [], contact: p.contact ?? null, owed: p.owed ?? 0,
    addresses: ((p.addresses as Row[]) ?? []).map((a) => ({ label: a.label, line: a.line, area: a.area, cityId: a.city_id, pincode: a.pincode, landmark: a.landmark ?? "", pinned: !!a.pinned })),
    bookings: ((p.bookings as Row[]) ?? []).map((b) => ({ id: b.id, code: b.code, status: b.status, serviceId: b.service_id, date: b.date, slot: b.slot, total: b.total ?? 0, pay: b.pay, patient: b.patient ?? "", caregiver: b.caregiver ?? null })),
    tickets: ((p.tickets as Row[]) ?? []).map((t) => ({ code: t.code, topic: t.topic, status: t.status, urgent: !!t.urgent, at: ms(t.at) })),
    refunds: ((p.refunds as Row[]) ?? []).map((r) => ({ booking: r.booking, amount: r.amount ?? 0, reason: r.reason ?? "", at: ms(r.at) })),
  };
}

export type LiveDashboard = {
  waiting: number; waitingLong: number; inProgress: number; visitsToday: number; completedToday: number; cancelledToday: number; bookedToday: number;
  revenueToday: number; revenue7d: number; online: number; caregivers: number; applicants: number; renewals: number;
  ticketsOpen: number; sosOpen: number; refundsDue: number; patients: number; patients7d: number; byCity: Record<string, number>;
};
export async function loadDashboard(): Promise<LiveDashboard> {
  const { data, error } = await db("admin").rpc("admin_dashboard");
  if (error) throw error;
  const d = data as Row;
  return {
    waiting: d.waiting, waitingLong: d.waiting_long, inProgress: d.in_progress, visitsToday: d.visits_today, completedToday: d.completed_today,
    cancelledToday: d.cancelled_today, bookedToday: d.booked_today, revenueToday: d.revenue_today, revenue7d: d.revenue_7d, online: d.online,
    caregivers: d.caregivers, applicants: d.applicants, renewals: d.renewals, ticketsOpen: d.tickets_open, sosOpen: d.sos_open,
    refundsDue: d.refunds_due, patients: d.patients, patients7d: d.patients_7d, byCity: d.by_city ?? {},
  };
}

export type LiveReport = {
  months: { month: string; visits: number; revenue: number; caregiverPay: number; refunds: number; cancelled: number; newPatients: number }[];
  month: string;
  caregivers: { id: string; name: string; phone: string; role: string; visits: number; earned: number; cash: number }[];
};
export async function loadReport(months: number, month: string | null): Promise<LiveReport> {
  const { data, error } = await db("admin").rpc("admin_report", { p_months: months, p_month: month });
  if (error) throw error;
  const d = data as Row;
  return {
    month: d.month,
    months: ((d.months as Row[]) ?? []).map((m) => ({ month: m.month, visits: m.visits, revenue: m.revenue, caregiverPay: m.caregiver_pay, refunds: m.refunds, cancelled: m.cancelled, newPatients: m.new_patients })),
    caregivers: ((d.caregivers as Row[]) ?? []).map((c) => ({ id: c.id, name: c.name ?? "", phone: c.phone ?? "", role: c.role, visits: c.visits, earned: c.earned, cash: c.cash })),
  };
}
