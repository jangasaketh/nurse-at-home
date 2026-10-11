// CAREGIVER APP RULES. No UI in this file.

import { CITIES } from "@/lib/data";
import { addDays, dayInfo, msg, todayISO, type Msg } from "@/lib/booking";
import { t } from "@/lib/i18n";
import { DAYS, isUrgent, PAYOUT_DAY, serviceOf, servicesForRole, slotHour, type Job } from "./data";
import type { CgState, Earning, KycStep } from "./store";

/** Can this caregiver take this request, given their role, gender and work settings? */
export function matchesSettings(job: Job, s: CgState) {
  if (!s.role) return false;
  const service = serviceOf(job);
  if (!servicesForRole(s.role).some((x) => x.id === service.id)) return false; // compounders: no injections, drips, medication
  if (!s.availability.services.includes(service.id)) return false;
  if (job.womenOnly && s.personal?.gender !== "F") return false; // the patient asked for a woman caregiver
  if (job.distanceKm > s.availability.radiusKm) return false;
  if (isUrgent(job)) return s.availability.urgent;
  const weekday = new Date(`${addDays(todayISO(), job.dateOffset)}T00:00:00`).getDay();
  if (!s.availability.days.includes(weekday)) return false;
  const h = slotHour(job.slot);
  return h >= slotHour(s.availability.start) && h <= slotHour(s.availability.end);
}

/** Requests waiting for this caregiver: at most three at a time, in the order they arrived. */
export function visibleRequests(s: CgState, jobs: Job[]) {
  if (!s.online || s.kycStatus !== "approved") return [];
  const waiting = s.requestIds ?? jobs.map((j) => j.id);
  const taken = new Set([...s.declined, ...s.upcoming.map((j) => j.id)]);
  return jobs.filter((j) => waiting.includes(j.id) && !taken.has(j.id) && matchesSettings(j, s)).slice(0, 3);
}

/** "Today, 10 Oct, 4:00 PM", or "As soon as possible" for urgent requests. */
export function whenText(job: Job) {
  if (isUrgent(job)) return t("As soon as possible (within 60 minutes)");
  return `${dayInfo(addDays(todayISO(), job.dateOffset)).full}, ${job.slot}`;
}
export function whenMsg(job: Job): Msg {
  return isUrgent(job) ? msg("As soon as possible (within 60 minutes)") : { date: addDays(todayISO(), job.dateOffset), slot: job.slot };
}

export const genderWord = (g: "F" | "M") => (g === "F" ? t("woman") : t("man"));
export const patientLine = (job: Job) => t("{name}, {age}, {gender}", { name: job.patient.first, age: job.patient.age, gender: genderWord(job.patient.gender) });

export function courseText(job: Job) {
  if (job.visits <= 1) return null;
  const every = job.everyDays === 1 ? t("every day") : t("every 2 days");
  return t("Visit {n} of {total}, {every}", { n: job.visitNo, total: job.visits, every });
}
export function courseWho(job: Job) {
  return job.sameCaregiver ? t("The patient wants the same caregiver for every visit.") : t("Later visits can go to any available caregiver.");
}

export const cityName = (cityId: string) => t(CITIES.find((c) => c.id === cityId)?.name ?? "Hyderabad");
export const cityState = (cityId: string) => CITIES.find((c) => c.id === cityId)?.state ?? "Telangana";

/** Google Maps directions to the patient's address. Works now, with no backend. */
export const directionsUrl = (job: Job) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(job.address)}`;

/* ---------- Verification ---------- */

export function stepDone(step: KycStep, s: CgState) {
  switch (step) {
    case "personal": return s.personal !== null;
    case "id": return s.idProof !== null && s.idProof.photo !== null;
    case "selfie": return s.selfie !== null;
    case "qualification": return s.qualification !== null && s.qualification.certificate !== null;
    case "bank": return s.bank !== null;
  }
}

export const STEP_TITLES: Record<KycStep, string> = {
  personal: "Your details",
  id: "Government ID",
  selfie: "Selfie",
  qualification: "Qualification",
  bank: "Bank account for payouts",
};

export function isAdult(dob: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return false;
  const d = new Date(`${dob}T00:00:00`);
  const limit = new Date();
  limit.setFullYear(limit.getFullYear() - 18);
  return d <= limit && d.getFullYear() > 1930;
}

export function idNumberError(type: string, value: string): string | null {
  const v = value.trim().toUpperCase();
  switch (type) {
    case "aadhaar": return /^\d{4}$/.test(v) ? null : "Enter the last 4 digits of your Aadhaar.";
    case "pan": return /^[A-Z]{5}\d{4}[A-Z]$/.test(v) ? null : "Enter a PAN like ABCDE1234F.";
    case "dl": return /^[A-Z0-9-]{8,18}$/.test(v.replace(/\s/g, "")) ? null : "Enter the driving licence number as printed.";
    case "voter": return /^[A-Z]{3}\d{7}$/.test(v) ? null : "Enter a Voter ID like ABC1234567.";
    default: return "Choose the type of ID.";
  }
}

export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const UPI_RE = /^[\w.-]{2,}@[a-zA-Z]{2,}$/;
export const maskAccount = (acc: string) => (acc.length > 4 ? `•••• ${acc.slice(-4)}` : acc);

/* ---------- Earnings ---------- */

/** Start of this payout week (Monday 00:00). */
export function weekStart(nowMs = Date.now()) {
  const d = new Date(nowMs);
  d.setHours(0, 0, 0, 0);
  const diff = (d.getDay() - PAYOUT_DAY + 7) % 7;
  d.setDate(d.getDate() - diff);
  return d.getTime();
}

/** The next payout date, as a translated day label. */
export function nextPayoutText(nowMs = Date.now()) {
  const d = new Date(weekStart(nowMs) + 7 * 86400000);
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const info = dayInfo(iso);
  return `${t(DAYS[d.getDay()])}, ${info.short}`;
}

export function weekTotals(earnings: Earning[], nowMs = Date.now()) {
  const from = weekStart(nowMs);
  const week = earnings.filter((e) => e.at >= from);
  const earned = week.reduce((sum, e) => sum + e.amount, 0);
  const cash = week.reduce((sum, e) => sum + e.cash, 0);
  return { week, earned, cash, payout: earned - cash, visits: week.filter((e) => e.kind === "visit").length };
}
