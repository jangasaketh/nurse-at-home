// Booking rules and helpers. No UI in this file.

import {
  CAREGIVERS, CITIES, FREE_UNTIL_HOURS, GRACE_MINUTES, ROUTINE_CHECK_IDS, SERVICES, SLOTS, TIMED_CANCEL_RULE,
  URGENT_FEE, URGENT_SLOT, VISIT_FEE, VITAL_CHECKS, VITALS_SERVICE_ID, type Caregiver, type City, type Service,
} from "./data";
import { getLang, t } from "./i18n";

/* ---------- People, places, messages ---------- */

export const SELF = "Me"; // relation value for the account holder

export type Patient = { id: string; name: string; relation: string; age: number | null; gender: "F" | "M" | "" };
export type Address = { id: string; label: string; line: string; area: string; cityId: string; pincode: string; landmark: string };
export type Contact = { name: string; relation: string; phone: string };
export type Notice = { id: string; title: Msg; body: Msg; at: number; read: boolean };

/**
 * Text that is saved (notifications, visit history) is saved as a message, not as finished text,
 * so it shows in whatever language the app is in when it is read.
 *   a plain string: shown as it is (names, numbers, and anything saved by an older version)
 *   { k, v }:       an English key for t(), with values that may themselves be messages
 *   { date, slot }: a visit date (yyyy-mm-dd) and arrival time, e.g. "Tomorrow, 9 Oct, 9:00 AM"
 *   { j, s }:       several messages joined with a separator
 */
export type Msg =
  | string
  | { k: string; v?: Record<string, Msg | number> }
  | { date: string; slot: string }
  | { j: Msg[]; s: string };
export const msg = (k: string, v?: Record<string, Msg | number>): Msg => (v ? { k, v } : { k });
export const whenMsg = (date: string, slot: string): Msg => ({ date, slot });
export const joinMsg = (s: string, ...parts: Msg[]): Msg => ({ j: parts, s });
/** Turns a saved message into text in the current language. */
export function tx(m: Msg): string {
  if (typeof m === "string") return m;
  if ("k" in m) {
    const vars = m.v ? Object.fromEntries(Object.entries(m.v).map(([key, val]) => [key, typeof val === "number" ? val : tx(val)])) : undefined;
    return t(m.k, vars);
  }
  if ("date" in m) return `${dayInfo(m.date).full}, ${slotText(m.slot)}`;
  return m.j.map(tx).join(m.s);
}
export type PayMethod = "upi" | "card" | "cash";

export const patientChip = (p: Patient) => (p.relation === SELF ? t("Me") : `${p.name} · ${t(p.relation)}`);
export const patientMeta = (p: Patient) =>
  [p.relation === SELF ? t("You") : t(p.relation), p.age ? String(p.age) : null].filter(Boolean).join(", ");
/** "mother" in an English sentence, the translated word otherwise. */
export const relationWord = (relation: string) => (getLang() === "en" ? relation.toLowerCase() : t(relation));
export const patientFull = (p: Patient) => {
  const who = p.relation === SELF ? t("you") : relationWord(p.relation);
  return p.age ? `${p.name} (${who}), ${p.age}` : `${p.name} (${who})`;
};
/** "You", or "Lakshmi Rao · Mother", saved as a message. */
export const patientWhoMsg = (p: Patient): Msg => (p.relation === SELF ? msg("You") : joinMsg(" · ", p.name, msg(p.relation)));
const describePatient = (p: Patient) => ({ ...p, chip: patientChip(p), full: patientFull(p) });

export const cityById = (id: string) => CITIES.find((c) => c.id === id) ?? CITIES[0];
/** An address as a saved message, so the city name follows the app language. */
export const addressMsg = (a: Address): Msg =>
  joinMsg(", ", ...[a.line, a.area].filter(Boolean), a.pincode ? joinMsg(" ", msg(cityById(a.cityId).name), a.pincode) : msg(cityById(a.cityId).name));
export const formatAddress = (a: Address) => tx(addressMsg(a));
/** Language choices offered in a city: its own language, plus Hindi and English. */
export const languagesIn = (city: City) => [city.language, "Hindi", "English"];

export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`;

/* ---------- Dates ---------- */

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");
const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromISO = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export const todayISO = () => toISO(new Date());
export const addDays = (iso: string, days: number) => {
  const d = fromISO(iso);
  d.setDate(d.getDate() + days);
  return toISO(d);
};

/** Labels for a calendar date (yyyy-mm-dd), relative to today. */
export function dayInfo(iso: string) {
  const d = fromISO(iso);
  const offset = Math.round((d.getTime() - fromISO(todayISO()).getTime()) / 86400000);
  const short = `${d.getDate()} ${t(MONTHS[d.getMonth()])}`;
  const word = offset === 0 ? t("Today") : offset === 1 ? t("Tomorrow") : t(DAYS[d.getDay()]);
  return { offset, weekday: offset === 0 ? t("Today") : t(DAYS[d.getDay()]), date: d.getDate(), short, full: `${word}, ${short}` };
}
export const dayAt = (offset: number) => dayInfo(addDays(todayISO(), offset));

export function timeAgo(at: number) {
  const mins = Math.floor((Date.now() - at) / 60000);
  if (mins < 1) return t("Just now");
  if (mins < 60) return t("{n} min ago", { n: mins });
  if (mins < 60 * 24) return t("{n} hr ago", { n: Math.floor(mins / 60) });
  const d = new Date(at);
  return `${d.getDate()} ${t(MONTHS[d.getMonth()])}`;
}

export const money = (n: number) => "₹" + n.toLocaleString("en-IN");

/** Clock times stay as "9:00 AM". Only "within 60 minutes" is a phrase to translate. */
export const slotText = (slot: string) => (slot === URGENT_SLOT ? t("within 60 minutes") : slot);

/* ---------- Bookings ---------- */

/** A confirmed booking: one visit, or a course of repeat visits. */
export type Booking = {
  serviceId: string;
  patient: Patient; // copied at booking time, so later edits do not change the booking
  addressText: Msg; // copied at booking time
  cityId: string;
  bookedAt: number; // when the booking was confirmed (milliseconds)
  startDate: string; // yyyy-mm-dd of the first visit
  slot: string;
  visits: number;
  everyDays: number; // 1 = every day, 2 = every 2 days
  sameCaregiver: boolean; // true = same person every visit
  caregiverId: string;
  visitNo: number; // which visit is next (1-based)
  rotateFrom: number; // visit number from which "any available" rotation starts
  womenOnly: boolean;
  language: string | null;
  vitalIds: string[]; // checks chosen for a vitals visit
  unitPrice: number; // service price per visit
  urgentFee: number;
  pay: PayMethod;
  notifyContact: boolean; // send visit updates to the emergency contact
  carried: number; // unpaid charge from an earlier booking, to be collected with this one
};

export type VisitRecord = {
  id: string;
  status: "completed" | "cancelled" | "missed";
  title: Msg;
  when: Msg;
  who: Msg;
  by: string;
  note: Msg;
  readings: { name: Msg; value: string }[];
};

/** The choices a patient makes before confirming. */
export type Draft = {
  patients: Patient[];
  addresses: Address[];
  serviceId: string;
  patientId: string;
  addressId: string | null;
  dateIdx: number; // days from today
  slot: string | null;
  repeat: boolean;
  count: number;
  every: number;
  sameNurse: boolean;
  caregiverId: string;
  womenOnly: boolean; // patient preference
  language: string | null; // patient preference
  vitalIds: string[]; // checks chosen for a vitals visit
};

export const serviceById = (id: string) => SERVICES.find((s) => s.id === id) ?? SERVICES[0];

/** A caregiver as shown to a patient in one city. */
export type ListedCaregiver = Caregiver & { regLine: string };

/** RULE 1: injections, drips and medication are for registered nurses only. */
export function caregiversFor(service: Service, city: City): ListedCaregiver[] {
  return CAREGIVERS.filter((c) => !service.nurseOnly || c.isNurse).map((c) => ({
    ...c,
    speaks: c.speaks.map((lang) => (lang === "LOCAL" ? city.language : lang)),
    regLine: c.isNurse
      ? t("{state} nursing council reg. no. {no} (sample)", { state: t(city.state), no: c.regNo })
      : t("Not a registered nurse. Wound-care certificate no. {no} (sample)", { no: c.regNo }),
  }));
}

/** RULE 2: these services cannot be booked without a prescription. */
export function prescriptionMissing(service: Service, hasPrescription: boolean) {
  return service.needsPrescription && !hasPrescription;
}

/** Patient preferences: a woman caregiver, and a language the caregiver speaks. */
export function matchesPreferences(c: Caregiver, womenOnly: boolean, language: string | null) {
  return (!womenOnly || c.gender === "F") && (!language || c.speaks.includes(language));
}

/** SAMPLE availability: is this caregiver free at the chosen arrival time? */
export const isFreeAt = (c: Caregiver, slot: string) => !c.busyAt.includes(slot);

export const isVitals = (service: Service) => service.id === VITALS_SERVICE_ID;
export const checksByIds = (ids: string[]) => VITAL_CHECKS.filter((v) => ids.includes(v.id));
/** Readings shown on the visit record: the chosen checks for a vitals visit, routine ones otherwise. */
export const readingsFor = (service: Service, vitalIds: string[]) =>
  checksByIds(isVitals(service) ? vitalIds : ROUTINE_CHECK_IDS);

export const roleWord = (service: Service) => (service.nurseOnly ? "nurse" : "caregiver");
/** "nurse" or "caregiver", in the chosen language, for use inside sentences. */
export const whoWord = (service: Service) => t(roleWord(service));
export const whoPlural = (service: Service) => t(service.nurseOnly ? "nurses" : "caregivers");
export const proofText = (c: Caregiver) =>
  c.isNurse ? t("Nursing council registration verified") : t("Training certificate verified");
export const allowedText = (c: Caregiver) =>
  c.isNurse ? t("Injections, IV drips, medication, dressing, vitals") : t("Dressing and vitals only");
export const yearsText = (n: number) => t("{n} years", { n });

const NOBODY: Patient = { id: "", name: "", relation: SELF, age: null, gender: "" };

export function describeDraft(d: Draft) {
  const service = serviceById(d.serviceId);
  const patient = describePatient(d.patients.find((p) => p.id === d.patientId) ?? d.patients[0] ?? NOBODY);
  const address = d.addresses.find((a) => a.id === d.addressId) ?? d.addresses[0] ?? null;
  const city = cityById(address ? address.cityId : CITIES[0].id);
  const allowed = caregiversFor(service, city);
  const visits = d.repeat ? d.count : 1;
  const slot = d.slot ?? SLOTS[1];
  const free = allowed.filter((c) => isFreeAt(c, slot));
  const caregivers = free.filter((c) => matchesPreferences(c, d.womenOnly, d.language));
  // Everyone free who matches the language, ignoring "women only". Used for the fallback offer.
  const withoutGender = free.filter((c) => matchesPreferences(c, false, d.language));
  const caregiver = allowed.find((c) => c.id === d.caregiverId) ?? allowed[0];
  const lastOffset = d.dateIdx + (visits - 1) * d.every;
  const checks = isVitals(service) ? checksByIds(d.vitalIds) : [];
  const unitPrice = isVitals(service) ? checks.reduce((sum, v) => sum + v.price, 0) : service.price;
  const urgent = visits === 1 && slot === URGENT_SLOT;
  const urgentFee = urgent ? URGENT_FEE : 0;
  return {
    service,
    patient,
    city,
    address,
    addressText: address ? formatAddress(address) : "",
    languages: languagesIn(city),
    caregivers,
    noWomenFree: d.womenOnly && caregivers.length === 0 && withoutGender.length > 0,
    othersFree: withoutGender.length,
    caregiver,
    visits,
    slot,
    startDate: addDays(todayISO(), d.dateIdx),
    checks,
    unitPrice,
    urgent,
    urgentFee,
    isCourse: visits > 1,
    who: whoWord(service),
    whoPlural: whoPlural(service),
    everyText: d.every === 1 ? t("every day") : t("every 2 days"),
    whenText: `${dayAt(d.dateIdx).full}, ${slotText(slot)}`,
    firstDay: dayAt(d.dateIdx).short,
    lastDay: dayAt(lastOffset).short,
    serviceTotal: unitPrice * visits,
    feeTotal: VISIT_FEE * visits,
    total: (unitPrice + VISIT_FEE) * visits + urgentFee,
  };
}

export function describeBooking(b: Booking) {
  const service = serviceById(b.serviceId);
  const city = cityById(b.cityId);
  // Later visits of an "any available" course still respect the patient's preferences.
  const preferred = caregiversFor(service, city).filter(
    (c) => (isFreeAt(c, b.slot) && matchesPreferences(c, b.womenOnly, b.language)) || c.id === b.caregiverId,
  );
  const list = preferred.length ? preferred : caregiversFor(service, city);
  const firstIdx = Math.max(0, list.findIndex((c) => c.id === b.caregiverId));
  // "Any available" has no real matching yet, so the demo rotates through the list.
  const caregiver = b.sameCaregiver ? list[firstIdx] : list[(firstIdx + b.visitNo - b.rotateFrom) % list.length];
  const visitDate = addDays(b.startDate, (b.visitNo - 1) * b.everyDays);
  const isCourse = b.visits > 1;
  return {
    service,
    patient: describePatient(b.patient),
    caregiver,
    readings: readingsFor(service, b.vitalIds),
    who: whoWord(service),
    visitDate,
    when: `${dayInfo(visitDate).full}, ${slotText(b.slot)}`,
    nextWhen: `${dayInfo(addDays(visitDate, b.everyDays)).full}, ${slotText(b.slot)}`,
    isCourse,
    hasNext: isCourse && b.visitNo < b.visits,
    remaining: b.visits - b.visitNo + 1,
    visitLabel: t("Visit {n} of {total}", { n: b.visitNo, total: b.visits }),
    planText: b.everyDays === 1 ? t("every day") : t("every 2 days"),
  };
}

/* ---------- Cancelling and rescheduling ---------- */

// PROVISIONAL RULE (applied 6 Oct 2026). Settings and the on/off switch are in lib/data.ts.
// Step: 0 accepted, 1 on the way, 2 arrived, 3 care in progress.
//
// Free:    within GRACE_MINUTES of booking; or more than FREE_UNTIL_HOURS before the visit;
//          or when the caregiver is late.
// Charged: inside FREE_UNTIL_HOURS, or once the caregiver has set off. Only the home visit
//          charge is ever kept, and it is paid to the caregiver.
// Never:   once care has started.
//
// With TIMED_CANCEL_RULE off, only "has the caregiver set off?" decides.
// TODO (backend): "no caregiver assigned yet" should also be free. In this app a caregiver is always assigned.

function slotMinutes(slot: string) {
  const m = slot.match(/^(\d+):(\d+) (AM|PM)$/);
  if (!m) return 0;
  return ((Number(m[1]) % 12) + (m[3] === "PM" ? 12 : 0)) * 60 + Number(m[2]);
}

/** When the next visit of this booking is due, in milliseconds. */
export function visitTime(b: Booking) {
  if (b.slot === URGENT_SLOT) return b.bookedAt + 60 * 60000;
  const day = fromISO(addDays(b.startDate, (b.visitNo - 1) * b.everyDays));
  return day.getTime() + slotMinutes(b.slot) * 60000;
}

export type FeeReason = "caregiver-late" | "grace" | "set-off" | "early" | "close";

/** What it costs the patient to cancel or move the next visit right now, and why. */
export function changeFee(b: Booking, step: number, now: number, caregiverLate: boolean): { fee: number; why: FeeReason } {
  if (caregiverLate) return { fee: 0, why: "caregiver-late" };
  if (TIMED_CANCEL_RULE && now - b.bookedAt <= GRACE_MINUTES * 60000) return { fee: 0, why: "grace" };
  if (step >= 1) return { fee: VISIT_FEE, why: "set-off" };
  if (!TIMED_CANCEL_RULE || visitTime(b) - now > FREE_UNTIL_HOURS * 3600000) return { fee: 0, why: "early" };
  return { fee: VISIT_FEE, why: "close" };
}

/** The reason, in words the patient sees. `who` is already translated ("nurse" or "caregiver"). */
export function feeReasonText(why: FeeReason, who: string) {
  switch (why) {
    case "caregiver-late": return t("Free, because the {who} is running late.", { who });
    case "grace": return t("Free, because you booked less than {n} minutes ago.", { n: GRACE_MINUTES });
    case "early": return TIMED_CANCEL_RULE
      ? t("Free, because the visit is more than {n} hours away.", { n: FREE_UNTIL_HOURS })
      : t("Free, because the {who} has not set off yet.", { who });
    case "set-off": return t("The home visit charge is kept because the {who} has already set off. It is paid to the {who}.", { who });
    case "close": return t("The home visit charge is kept because the visit is less than {n} hours away. It is paid to the {who}.", { n: FREE_UNTIL_HOURS, who });
  }
}

/** One line shown before payment, so the rule is never a surprise. */
export function policyLine(urgent: boolean, who: string) {
  const fee = money(VISIT_FEE);
  if (!TIMED_CANCEL_RULE) return t("Free to cancel until the {who} sets off. After that the {fee} home visit charge is kept.", { who, fee });
  const free = urgent
    ? t("Free to cancel within {n} minutes of booking.", { n: GRACE_MINUTES })
    : t("Free to cancel or move up to {n} hours before the visit.", { n: FREE_UNTIL_HOURS });
  return `${free} ${t("After that the {fee} home visit charge is kept and paid to the {who}. We never keep more than that.", { fee, who })}`;
}

export function cancelTerms(b: Booking, step: number, scope: "one" | "all", now: number, caregiverLate: boolean) {
  const remaining = b.visits - b.visitNo + 1;
  const count = scope === "all" ? remaining : 1;
  const gross = (b.unitPrice + VISIT_FEE) * count + (b.visits === 1 ? b.urgentFee : 0);
  const { fee, why } = changeFee(b, step, now, caregiverLate);
  const paidOnline = b.pay !== "cash";
  return {
    allowed: step < 3,
    count,
    kept: fee,
    why,
    paidOnline,
    refund: paidOnline ? gross - fee : 0,
    due: paidOnline ? 0 : fee, // cash bookings: added to the next booking
  };
}

/** A visit can move to another day or time until the caregiver sets off. Urgent visits cannot. */
export const canReschedule = (b: Booking, step: number) => step === 0 && b.slot !== URGENT_SLOT;
