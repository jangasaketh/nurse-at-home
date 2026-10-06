// Booking rules and helpers. No UI in this file.

import {
  CAREGIVERS, CITIES, ROUTINE_CHECK_IDS, SERVICES, SLOTS, URGENT_FEE, URGENT_SLOT,
  VISIT_FEE, VITAL_CHECKS, VITALS_SERVICE_ID, type Caregiver, type City, type Service,
} from "./data";

/* ---------- People, places, messages ---------- */

export const SELF = "Me"; // relation value for the account holder

export type Patient = { id: string; name: string; relation: string; age: number | null; gender: "F" | "M" | "" };
export type Address = { id: string; label: string; line: string; area: string; cityId: string; pincode: string; landmark: string };
export type Contact = { name: string; relation: string; phone: string };
export type Notice = { id: string; title: string; body: string; at: number; read: boolean };
export type PayMethod = "upi" | "card" | "cash";

export const patientChip = (p: Patient) => (p.relation === SELF ? "Me" : `${p.name} · ${p.relation}`);
export const patientMeta = (p: Patient) =>
  [p.relation === SELF ? "You" : p.relation, p.age ? String(p.age) : null].filter(Boolean).join(", ");
export const patientFull = (p: Patient) => {
  const who = p.relation === SELF ? "you" : p.relation.toLowerCase();
  return p.age ? `${p.name} (${who}), ${p.age}` : `${p.name} (${who})`;
};
const describePatient = (p: Patient) => ({ ...p, chip: patientChip(p), full: patientFull(p) });

export const cityById = (id: string) => CITIES.find((c) => c.id === id) ?? CITIES[0];
export const formatAddress = (a: Address) =>
  [a.line, a.area, `${cityById(a.cityId).name}${a.pincode ? ` ${a.pincode}` : ""}`].filter(Boolean).join(", ");
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
  const short = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  const word = offset === 0 ? "Today" : offset === 1 ? "Tomorrow" : DAYS[d.getDay()];
  return { offset, weekday: offset === 0 ? "Today" : DAYS[d.getDay()], date: d.getDate(), short, full: `${word}, ${short}` };
}
export const dayAt = (offset: number) => dayInfo(addDays(todayISO(), offset));

export function timeAgo(at: number) {
  const mins = Math.floor((Date.now() - at) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24) return `${Math.floor(mins / 60)} hr ago`;
  const d = new Date(at);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export const money = (n: number) => "₹" + n.toLocaleString("en-IN");

/* ---------- Bookings ---------- */

/** A confirmed booking: one visit, or a course of repeat visits. */
export type Booking = {
  serviceId: string;
  patient: Patient; // copied at booking time, so later edits do not change the booking
  addressText: string;
  cityId: string;
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
};

export type VisitRecord = {
  id: string;
  status: "completed" | "cancelled";
  title: string;
  when: string;
  who: string;
  by: string;
  note: string;
  readings: { name: string; value: string }[];
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
      ? `${city.state} nursing council reg. no. ${c.regNo} (sample)`
      : `Not a registered nurse. Wound-care certificate no. ${c.regNo} (sample)`,
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
export const proofText = (c: Caregiver) =>
  c.isNurse ? "Nursing council registration verified" : "Training certificate verified";
export const allowedText = (c: Caregiver) =>
  c.isNurse ? "Injections, IV drips, medication, dressing, vitals" : "Dressing and vitals only";

const NOBODY: Patient = { id: "", name: "You", relation: SELF, age: null, gender: "" };

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
    who: roleWord(service),
    everyText: d.every === 1 ? "every day" : "every 2 days",
    whenText: `${dayAt(d.dateIdx).full}, ${slot}`,
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
    who: roleWord(service),
    visitDate,
    when: `${dayInfo(visitDate).full}, ${b.slot}`,
    nextWhen: `${dayInfo(addDays(visitDate, b.everyDays)).full}, ${b.slot}`,
    isCourse,
    hasNext: isCourse && b.visitNo < b.visits,
    remaining: b.visits - b.visitNo + 1,
    visitLabel: `Visit ${b.visitNo} of ${b.visits}`,
    planText: b.everyDays === 1 ? "every day" : "every 2 days",
  };
}

/* ---------- Cancelling and rescheduling ---------- */

/**
 * SAMPLE POLICY. Step: 0 accepted, 1 on the way, 2 arrived, 3 care in progress.
 * - Before the caregiver sets off: free.
 * - After they set off: the home visit charge is kept.
 * - Once care has started: cannot be cancelled.
 * The same wording is in the FAQ in lib/data.ts. Change both together.
 */
export function cancelTerms(b: Booking, step: number, scope: "one" | "all") {
  const remaining = b.visits - b.visitNo + 1;
  const count = scope === "all" ? remaining : 1;
  const gross = (b.unitPrice + VISIT_FEE) * count + (b.visits === 1 ? b.urgentFee : 0);
  const kept = step >= 1 ? VISIT_FEE : 0;
  const paidOnline = b.pay !== "cash";
  return {
    allowed: step < 3,
    count,
    kept,
    paidOnline,
    refund: paidOnline ? gross - kept : 0,
    due: paidOnline ? 0 : kept,
  };
}

/** A visit can move to another day or time until the caregiver sets off. Urgent visits cannot. */
export const canReschedule = (b: Booking, step: number) => step === 0 && b.slot !== URGENT_SLOT;
