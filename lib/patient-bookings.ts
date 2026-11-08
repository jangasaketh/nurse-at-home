"use client";

// PATIENT APP ↔ DATABASE (phase 5): real bookings. The booking is made, changed and followed through the
// database functions in supabase/004_bookings.sql, so prices, the cancellation rule and who gets the
// visit are decided by the server, not the phone.

import { db } from "./supabase";
import { uploadFile } from "./files";
import { SELF, addDays, type Booking, type Msg, type Notice, type Patient, type VisitRecord, msg, joinMsg, patientWhoMsg, whenMsg } from "./booking";
import type { Prescription } from "./prescription";
import { serviceById } from "./booking";

export type LiveStatus = "requested" | "accepted" | "en_route" | "arrived" | "in_progress" | "completed" | "cancelled" | "missed";

export type LiveCaregiver = {
  id: string; name: string; gender: "F" | "M"; role: "nurse" | "compounder"; course: string; council: string; regNo: string;
  years: number; rating: number | null; ratingsCount: number; visitsDone: number; languages: string[];
};

export type LiveRecord = {
  id: string; visitNo: number; kind: "completed" | "missed" | "stopped"; note: string;
  details: { label: Msg; value: Msg }[]; readings: { label: Msg; value: string }[]; warnings: Msg[]; photoPath: string | null; at: number;
};

/** What the server says about a booking. Kept on the booking in live mode. */
export type LiveInfo = {
  id: string;
  code: string;
  status: LiveStatus;
  arrivalCode: string;
  caregiver: LiveCaregiver | null;
  openOffers: number;
  anyOffers: boolean;
  searchingSince: number;
  lateMinutes: number;
  due: number; // when the current visit is due (ms)
  feeKept: number;
  refund: number;
  dueAmount: number;
  cancelledBy: string | null;
  records: LiveRecord[];
  rated: boolean;
  prescriptionPath: string | null;
  paymentStatus: "none" | "pending" | "paid" | "partly_refunded" | "refunded" | "failed";
  amountPaid: number;
  payTotal: number; // what is paid online for the whole booking
  refunded: number; // what has gone back through Razorpay
};

export const FINAL: LiveStatus[] = ["completed", "cancelled", "missed"];
export const isFinal = (s: LiveStatus) => FINAL.includes(s);

/** The patient app's step for a live status: -1 waiting for a caregiver, 0 accepted ... 3 care in progress. */
export function stepOf(status: LiveStatus): number {
  switch (status) {
    case "requested": return -1;
    case "accepted": return 0;
    case "en_route": return 1;
    case "arrived": return 2;
    case "in_progress": return 3;
    default: return 3;
  }
}

const ms = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : 0);

type Row = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0) || 0);

function toRecord(r: Row): LiveRecord {
  return {
    id: str(r.id), visitNo: num(r.visit_no), kind: (str(r.kind) || "completed") as LiveRecord["kind"], note: str(r.note),
    details: (r.details as LiveRecord["details"]) ?? [], readings: (r.readings as LiveRecord["readings"]) ?? [],
    warnings: (r.warnings as Msg[]) ?? [], photoPath: (r.photo_path as string) ?? null, at: ms(r.at as string),
  };
}

function toCaregiver(c: Row | null): LiveCaregiver | null {
  if (!c) return null;
  return {
    id: str(c.id), name: str(c.name) || "Caregiver", gender: (str(c.gender) || "F") as "F" | "M", role: (str(c.role) || "nurse") as "nurse" | "compounder",
    course: str(c.course), council: str(c.council), regNo: str(c.reg_no), years: num(c.years),
    rating: c.rating === null || c.rating === undefined ? null : Number(c.rating), ratingsCount: num(c.ratings_count), visitsDone: num(c.visits_done),
    languages: (c.languages as string[]) ?? [],
  };
}

export function toLive(j: Row): LiveInfo {
  return {
    id: str(j.id), code: str(j.code), status: str(j.status) as LiveStatus, arrivalCode: str(j.arrival_code),
    caregiver: toCaregiver((j.caregiver as Row) ?? null), openOffers: num(j.open_offers), anyOffers: !!j.any_offers,
    searchingSince: ms(j.searching_since as string), lateMinutes: num(j.late_minutes), due: ms(j.due as string),
    feeKept: num(j.fee_kept), refund: num(j.refund_amount), dueAmount: num(j.due_amount), cancelledBy: (j.cancelled_by as string) ?? null,
    records: ((j.records as Row[]) ?? []).map(toRecord), rated: !!j.rated, prescriptionPath: (j.prescription_path as string) ?? null,
    paymentStatus: (str(j.payment_status) || "none") as LiveInfo["paymentStatus"], amountPaid: num(j.amount_paid), payTotal: num(j.pay_total),
    refunded: num(j.refunded),
  };
}

/** The local id of a family member, from their database id (the account holder is always "me"). */
const localPerson = (remoteIds: Record<string, string>, remote: string) =>
  Object.entries(remoteIds).find(([, r]) => r === remote)?.[0] ?? remote;

/** A booking read from the server, as the app keeps it (used on a new phone, or after a refresh). */
export function bookingFromServer(j: Row, remoteIds: Record<string, string>, keep: Booking | null): Booking {
  const person = (j.person as Row) ?? {};
  const relation = str(person.relation) === "Self" ? SELF : str(person.relation);
  const patient: Patient = {
    id: relation === SELF ? "me" : localPerson(remoteIds, str(person.id)), name: str(person.name), relation,
    age: person.age === null || person.age === undefined ? null : num(person.age), gender: (str(person.gender) || "") as Patient["gender"],
  };
  const live = toLive(j);
  return {
    serviceId: str(j.service_id),
    patient,
    addressText: str(j.address_text),
    cityId: str(j.city_id),
    bookedAt: ms(j.created_at as string),
    startDate: str(j.start_date),
    slot: str(j.slot),
    visits: num(j.visits),
    everyDays: num(j.every_days) || 1,
    sameCaregiver: !!j.same_caregiver,
    caregiverId: live.caregiver?.id ?? "",
    visitNo: num(j.visit_no) || 1,
    rotateFrom: 1,
    womenOnly: !!j.women_only,
    language: (j.language as string) ?? null,
    vitalIds: (j.vital_ids as string[]) ?? [],
    unitPrice: num(j.unit_price),
    urgentFee: num(j.urgent_fee),
    pay: (str(j.pay) || "cash") as Booking["pay"],
    notifyContact: !!j.notify_contact,
    carried: num(j.carried),
    prescription: keep?.prescription ?? null,
    live,
  };
}

/* ---------- Calls ---------- */

const client = () => db("patient");

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await client().rpc(fn, args ?? {});
  if (error) throw error;
  return data as T;
}

/** Upload the prescription photo or PDF and save it to the account. Returns its database id. */
export async function savePrescription(userId: string, p: Prescription): Promise<{ id: string; path: string }> {
  const path = await uploadFile("patient", "prescriptions", userId, "rx", p);
  const { data, error } = await client().from("prescriptions")
    .insert({ account_id: userId, storage_path: path, kind: p.kind, size_bytes: p.size }).select("id").single();
  if (error) throw error;
  return { id: (data as { id: string }).id, path };
}

export type BookArgs = {
  person_id: string; address_id: string; service_id: string; vital_ids: string[]; date: string; slot: string; visits: number;
  every_days: number; same_caregiver: boolean; women_only: boolean; language: string | null; pay: string; notify_contact: boolean;
  prescription_id: string | null; note: string;
};

export const bookVisit = (p: BookArgs) => rpc<{ id: string; code: string; offers: number; carried: number }>("book_visit", { p });
export const pullBooking = (id: string) => rpc<Row>("patient_booking", { p_booking: id });
export const pullHistory = () => rpc<{ owed: number; active: string[] | null; records: Row[] }>("patient_history");
export const cancelBooking = (id: string, scope: "one" | "all", reason: string) =>
  rpc<{ fee: number; refund: number; due: number; why: string; whole: boolean }>("cancel_booking", { p_booking: id, p_scope: scope, p_reason: reason });
export const rescheduleBooking = (id: string, date: string, slot: string) => rpc<{ fee: number; why: string }>("reschedule_booking", { p_booking: id, p_date: date, p_slot: slot });
export const setSameCaregiver = (id: string, same: boolean) => rpc<void>("set_same_caregiver", { p_booking: id, p_same: same });
export const lookAgain = (id: string) => rpc<number>("look_again", { p_booking: id });
export const payAfterVisit = (id: string) => rpc<void>("pay_after_visit", { p_booking: id });
/** Paid online and something is owed back that has not gone back yet. */
export const refundOwed = (l: LiveInfo) => (l.paymentStatus === "paid" || l.paymentStatus === "partly_refunded") && Math.min(l.refund, l.amountPaid) > l.refunded;
/** Paid online but the payment has not gone through yet. */
export const awaitingPayment = (b: Booking) => !!b.live && b.pay !== "cash" && (b.live.paymentStatus === "pending" || b.live.paymentStatus === "failed");
export const rateVisit = (id: string, stars: number, text = "", tags: string[] = []) => rpc<void>("rate_visit", { p_booking: id, p_stars: stars, p_text: text, p_tags: tags });

/** Notifications the server sent this patient (accepted, on the way, arrived, completed, cancelled...). */
export async function pullPatientNotices(userId: string): Promise<Notice[]> {
  const { data, error } = await client().from("notifications").select("id, title, body, read, created_at")
    .eq("user_id", userId).order("created_at", { ascending: false }).limit(50);
  if (error) throw error;
  return (data ?? []).map((n) => ({ id: n.id as string, title: n.title as Msg, body: n.body as Msg, at: ms(n.created_at as string), read: !!n.read }));
}

export async function markPatientNoticesRead(userId: string) {
  await client().from("notifications").update({ read: true }).eq("user_id", userId).eq("read", false);
}

/** The words for a server error the patient can act on; null for anything else. */
export function bookingProblem(e: unknown): string | null {
  const text = String((e as { message?: string })?.message ?? "");
  const known = [
    "That time has passed. Choose a later time.", "Choose a day in the next week", "Urgent visits are for one visit today",
    "This service is not offered", "We are not taking bookings in this city yet", "A prescription is needed for this service",
    "Care has already started", "This booking has already ended", "The caregiver has already set off", "Urgent visits cannot be moved",
    "Online payment is not switched on yet. Choose pay after the visit.", "Online payment is not set up yet.", "The payment could not be confirmed.",
  ];
  return known.find((k) => text.includes(k)) ?? null;
}

/* ---------- Records for the Bookings and Records screens ---------- */

/** A record from patient_history() as the app's history entry. */
export function historyEntry(r: Row): VisitRecord {
  const visits = num(r.visits);
  const service = msg(serviceById(str(r.service_id)).name);
  const title = visits > 1 ? msg("{service}, visit {n} of {total}", { service, n: num(r.visit_no), total: visits }) : service;
  const person = (r.person as Row) ?? {};
  const who: Msg = str(person.relation) === "Self" ? msg("You") : joinMsg(" · ", str(person.name), msg(str(person.relation)));
  const kind = str(r.kind);
  const when: Msg = r.urgent ? msg("As soon as possible (within 60 minutes)") : whenMsg(str(r.date), str(r.slot));
  const details = ((r.details as LiveRecord["details"]) ?? []).map((d) => joinMsg(": ", d.label, d.value));
  const noteParts: Msg[] = [];
  if (kind === "missed") noteParts.push(msg("Nobody answered the door. The home visit charge was kept."));
  else if (kind === "stopped") noteParts.push(msg("Stopped before care, for safety."));
  else if (kind === "cancelled") noteParts.push(str(r.cancelled_by) === "admin" ? msg("Cancelled by our team.") : str(r.cancelled_by) === "caregiver" ? msg("Stopped before care, for safety.") : msg("Cancelled."));
  if (str(r.note) && kind !== "cancelled") noteParts.push(str(r.note));
  noteParts.push(...details);
  return {
    id: str(r.id),
    status: kind === "completed" ? "completed" : kind === "cancelled" || kind === "stopped" ? "cancelled" : "missed",
    title,
    when,
    who,
    by: str(r.by),
    note: noteParts.length ? joinMsg(" · ", ...noteParts) : "",
    readings: ((r.readings as LiveRecord["readings"]) ?? []).map((x) => ({ name: x.label, value: x.value })),
  };
}

/** The record of a visit just finished, as a history entry (same shape as historyEntry). */
export function entryFromLive(b: Booking, r: LiveRecord): VisitRecord {
  return historyEntry({
    id: r.id, service_id: b.serviceId, visits: b.visits, visit_no: r.visitNo, kind: r.kind, note: r.note, details: r.details, readings: r.readings,
    urgent: !!b.live && b.slot === "within 60 minutes",
    date: addDays(b.startDate, (r.visitNo - 1) * b.everyDays), slot: b.slot,
    person: { name: b.patient.name, relation: b.patient.relation === SELF ? "Self" : b.patient.relation },
    by: b.live?.caregiver?.name ?? "",
  });
}

export { patientWhoMsg };
