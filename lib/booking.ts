// Booking rules and helpers. No UI in this file.

import {
  CAREGIVERS, CITIES, HOUSE, PATIENTS, ROUTINE_CHECK_IDS, SERVICES, SLOTS, URGENT_FEE, URGENT_SLOT,
  VISIT_FEE, VITAL_CHECKS, VITALS_SERVICE_ID, type Caregiver, type City, type Service,
} from "./data";

/** A confirmed booking: one visit, or a course of repeat visits. */
export type Booking = {
  serviceId: string;
  patientId: string;
  startOffset: number; // days from today for the first visit
  slot: string;
  visits: number;
  everyDays: number; // 1 = every day, 2 = every 2 days
  sameCaregiver: boolean; // true = same person every visit
  caregiverId: string;
  visitNo: number; // which visit is next (1-based)
  rotateFrom: number; // visit number from which "any available" rotation starts
  womenOnly: boolean;
  language: string | null;
  cityId: string;
  vitalIds: string[]; // checks chosen for a vitals visit
};

export type VisitRecord = { title: string; when: string; who: string; by: string; note: string };

/** The choices a patient makes before confirming. */
export type Draft = {
  serviceId: string;
  patientId: string;
  dateIdx: number;
  slot: string | null;
  repeat: boolean;
  count: number;
  every: number;
  sameNurse: boolean;
  caregiverId: string;
  womenOnly: boolean; // patient preference
  language: string | null; // patient preference
  cityId: string;
  vitalIds: string[]; // checks chosen for a vitals visit
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function dayAt(offset: number) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
  const short = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  const word = offset === 0 ? "Today" : offset === 1 ? "Tomorrow" : DAYS[d.getDay()];
  return { weekday: offset === 0 ? "Today" : DAYS[d.getDay()], date: d.getDate(), short, full: `${word}, ${short}` };
}

export const money = (n: number) => "₹" + n.toLocaleString("en-IN");

export const serviceById = (id: string) => SERVICES.find((s) => s.id === id) ?? SERVICES[0];
export const patientById = (id: string) => PATIENTS.find((p) => p.id === id) ?? PATIENTS[0];

export const cityById = (id: string) => CITIES.find((c) => c.id === id) ?? CITIES[0];
export const addressIn = (city: City) => `${HOUSE}, ${city.area}, ${city.name}`;
/** Language choices offered in a city: its own language, plus Hindi and English. */
export const languagesIn = (city: City) => [city.language, "Hindi", "English"];

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

export function describeDraft(d: Draft) {
  const service = serviceById(d.serviceId);
  const patient = patientById(d.patientId);
  const city = cityById(d.cityId);
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
    address: addressIn(city),
    languages: languagesIn(city),
    caregivers,
    noWomenFree: d.womenOnly && caregivers.length === 0 && withoutGender.length > 0,
    othersFree: withoutGender.length,
    caregiver,
    visits,
    slot,
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
  const patient = patientById(b.patientId);
  // Later visits of an "any available" course still respect the patient's preferences.
  const city = cityById(b.cityId);
  const preferred = caregiversFor(service, city).filter(
    (c) => (isFreeAt(c, b.slot) && matchesPreferences(c, b.womenOnly, b.language)) || c.id === b.caregiverId,
  );
  const list = preferred.length ? preferred : caregiversFor(service, city);
  const firstIdx = Math.max(0, list.findIndex((c) => c.id === b.caregiverId));
  // "Any available" has no real matching yet, so the demo rotates through the list.
  const caregiver = b.sameCaregiver ? list[firstIdx] : list[(firstIdx + b.visitNo - b.rotateFrom) % list.length];
  const offset = b.startOffset + (b.visitNo - 1) * b.everyDays;
  const isCourse = b.visits > 1;
  return {
    service,
    patient,
    caregiver,
    readings: readingsFor(service, b.vitalIds),
    who: roleWord(service),
    when: `${dayAt(offset).full}, ${b.slot}`,
    nextWhen: `${dayAt(offset + b.everyDays).full}, ${b.slot}`,
    isCourse,
    hasNext: isCourse && b.visitNo < b.visits,
    visitLabel: `Visit ${b.visitNo} of ${b.visits}`,
    planText: b.everyDays === 1 ? "every day" : "every 2 days",
  };
}
