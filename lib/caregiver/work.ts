"use client";

// CAREGIVER APP ↔ DATABASE (phase 5): real requests and visits. Offers, accepting, each step of the visit,
// the visit record, earnings, payouts and ratings go through the database functions in
// supabase/004_bookings.sql. The server decides who gets a request and what everyone is paid.

import { db } from "@/lib/supabase";
import { addDays, dayInfo, todayISO, type Msg } from "@/lib/booking";
import { serviceOf, type Job } from "./data";
import type { Earning, Payout, Review } from "./store";

type Row = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0) || 0);
const ms = (v: unknown) => (typeof v === "string" && v ? new Date(v).getTime() : 0);

/** Days from today (India) to a "YYYY-MM-DD" date. */
const offsetOf = (iso: string) => (iso ? dayInfo(iso).offset : 0);

export function jobFromServer(j: Row): Job {
  const p = (j.patient as Row) ?? {};
  return {
    id: str(j.id),
    live: true,
    code: str(j.code),
    status: str(j.status),
    serviceId: str(j.service_id),
    patient: { first: str(p.first), full: str(p.full) || str(p.first), age: num(p.age), gender: (str(p.gender) || "F") as "F" | "M" },
    area: str(j.area),
    address: str(j.address),
    landmark: str(j.landmark),
    pin: typeof j.lat === "number" && typeof j.lng === "number" ? { lat: j.lat, lng: j.lng } : null,
    cityId: str(j.city_id),
    distanceKm: -1, // not known until maps (phase 9)
    dateOffset: offsetOf(str(j.date)),
    slot: str(j.slot),
    visits: num(j.visits) || 1,
    everyDays: num(j.every_days) || 1,
    visitNo: num(j.visit_no) || 1,
    sameCaregiver: !!j.same_caregiver,
    vitalIds: (j.vital_ids as string[]) ?? [],
    womenOnly: !!j.women_only,
    language: str(j.language),
    pay: str(j.pay) === "cash" ? "cash" : "online",
    note: str(j.note),
    receivedAt: ms(j.offered_at) || ms(j.created_at),
    expiresAt: j.expires_at ? ms(j.expires_at) : undefined,
    unitPrice: num(j.unit_price),
    visitFee: num(j.visit_fee),
    urgentFee: num(j.urgent_fee),
    carried: num(j.carried),
    collect: num(j.collect),
    earning: num(j.earning),
    feeEarning: num(j.fee_earning),
    prescriptionPath: (j.prescription_path as string) ?? null,
    codeOk: !!j.code_ok,
    arrivedAt: j.arrived_at ? ms(j.arrived_at) : null,
    lateMinutes: num(j.late_minutes),
  };
}

const KIND: Record<string, Earning["kind"]> = { visit: "visit", missed: "missed", late_cancel: "late-cancel", stopped: "stopped" };
const TITLE: Record<string, string> = { late_cancel: "Late cancellation by the patient" };

export type Work = {
  offers: Job[];
  jobs: Job[];
  earnings: Earning[];
  payouts: Payout[];
  reviews: Review[];
};

export async function pullWork(): Promise<Work> {
  const { data, error } = await db("caregiver").rpc("caregiver_work");
  if (error) throw error;
  const w = data as Row;
  const svc = (id: string): Msg => ({ k: serviceOf({ serviceId: id } as Job).name });
  return {
    offers: ((w.offers as Row[]) ?? []).map(jobFromServer),
    jobs: ((w.jobs as Row[]) ?? []).map(jobFromServer),
    earnings: ((w.earnings as Row[]) ?? []).map((e) => ({
      id: str(e.id), at: ms(e.at), kind: KIND[str(e.kind)] ?? "visit",
      title: TITLE[str(e.kind)] ? { k: TITLE[str(e.kind)] } : svc(str(e.service_id)),
      patient: str(e.patient), amount: num(e.amount), cash: num(e.cash),
    })),
    payouts: ((w.payouts as Row[]) ?? []).map((p) => ({ id: str(p.id), at: ms(p.at), amount: num(p.amount), account: "", reference: str(p.reference) })),
    reviews: ((w.reviews as Row[]) ?? []).map((r) => ({
      id: str(r.id), stars: num(r.stars), text: str(r.text), tags: (r.tags as string[]) ?? [], service: svc(str(r.service_id)), patient: str(r.patient), at: ms(r.at),
    })),
  };
}

const rpc = async <T>(fn: string, args: Record<string, unknown>): Promise<T> => {
  const { data, error } = await db("caregiver").rpc(fn, args);
  if (error) throw error;
  return data as T;
};

export const acceptOffer = async (id: string) => jobFromServer(await rpc<Row>("accept_offer", { p_booking: id }));
export const declineOffer = (id: string, reason: string) => rpc<void>("decline_offer", { p_booking: id, p_reason: reason });
export const visitStep = (id: string, step: "en_route" | "arrived" | "in_progress") => rpc<void>("visit_step", { p_booking: id, p_step: step });
export const reportLate = (id: string, minutes: number) => rpc<void>("report_late", { p_booking: id, p_minutes: minutes });
export const confirmArrival = (id: string, code: string) => rpc<boolean>("confirm_arrival", { p_booking: id, p_code: code });
export const finishVisit = (id: string, kind: "completed" | "missed" | "stopped", record: Record<string, unknown> = {}) =>
  rpc<{ earned: number; cash: number; status: string; visit_no: number; next: Msg | null }>("finish_visit", { p_booking: id, p_kind: kind, p_record: record });
export const caregiverCancel = (id: string, reason: string) => rpc<void>("caregiver_cancel", { p_booking: id, p_reason: reason });

/** Save "online" and the work settings to the account, so requests are matched on the server. */
export async function pushWorkSettings(userId: string, online: boolean, availability: unknown) {
  const { error } = await db("caregiver").from("caregivers").update({ online, availability }).eq("id", userId);
  if (error) throw error;
}

/** Why accepting did not work, in words the caregiver understands. */
export function acceptProblem(e: unknown): "taken" | "expired" | "settings" | "other" {
  const text = String((e as { message?: string })?.message ?? "");
  if (/taken/.test(text)) return "taken";
  if (/expired/.test(text)) return "expired";
  if (/no longer fits/.test(text)) return "settings";
  return "other";
}

/** The step of the visit on the phone for a status on the server (0 accepted ... 4 care in progress). */
export function stepForStatus(status: string | undefined, codeOk: boolean | undefined): number {
  switch (status) {
    case "en_route": return 1;
    case "arrived": return codeOk ? 3 : 2;
    case "in_progress": return 4;
    default: return 0;
  }
}

/** The date of a visit as a message, for "Next visit with this patient". */
export const nextVisitDate = (job: Job): Msg => ({ date: addDays(todayISO(), job.dateOffset + job.everyDays), slot: job.slot });
