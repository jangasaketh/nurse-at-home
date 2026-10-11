// CAREGIVER APP: SAMPLE DATA AND SETTINGS.
// Every patient, address, request and earning here is an example. When the backend exists, requests,
// visits and earnings come from the API instead.
// Text is in English and translated on screen with t() (lib/i18n.ts). Place names and people's names are not translated.

import { CITIES, SERVICES, SLOTS, URGENT_FEE, URGENT_SLOT, VISIT_FEE, VITAL_CHECKS } from "@/lib/data";

/* ---------- Pay (PLACEHOLDERS: the owner must set these) ---------- */
// What the caregiver earns from each visit. Everything else the patient pays stays with the platform.
export const CAREGIVER_SHARE = 0.8; // of the service price
export const VISIT_FEE_SHARE = 1; // of the Rs 49 home visit charge (also what is paid for a missed visit or late cancellation)
export const URGENT_SHARE = 0.5; // of the Rs 100 urgent charge
export const PAYOUT_DAY = 1; // weekly payout on Monday (0 = Sunday)

/* ---------- Who can do what ---------- */
export type Role = "nurse" | "compounder";
/** Services a role may take. Compounders never see injections, drips or medication. */
export const servicesForRole = (role: Role) => SERVICES.filter((s) => role === "nurse" || !s.nurseOnly);

export const NURSE_COURSES = ["ANM", "GNM", "B.Sc Nursing", "Post Basic B.Sc Nursing", "M.Sc Nursing"];
export const COMPOUNDER_TRAINING = [
  "Diploma in Pharmacy (D.Pharm)",
  "Hospital ward assistant",
  "First aid and wound care course",
  "Other medical training",
];
export const ID_TYPES = [
  { id: "aadhaar", name: "Aadhaar" },
  { id: "pan", name: "PAN card" },
  { id: "dl", name: "Driving licence" },
  { id: "voter", name: "Voter ID" },
] as const;
export type IdType = (typeof ID_TYPES)[number]["id"];
export const SPOKEN_LANGUAGES = ["Telugu", "Kannada", "Tamil", "Malayalam", "Marathi", "Hindi", "Urdu", "English"];

/* ---------- Work settings ---------- */
export const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const HOURS = ["6:00 AM", "7:00 AM", "8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM", "12:00 PM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM", "5:00 PM", "6:00 PM", "7:00 PM", "8:00 PM", "9:00 PM", "10:00 PM"];
export const RADIUS_KM = [3, 5, 10, 15];

/** Hour of day (0 to 23) for a slot like "4:00 PM". */
export function slotHour(slot: string) {
  const m = slot.match(/^(\d+):\d+ (AM|PM)$/);
  if (!m) return -1;
  const h = Number(m[1]) % 12;
  return m[2] === "PM" ? h + 12 : h;
}

/* ---------- Sample requests ---------- */
export const AREAS: Record<string, string[]> = {
  hyd: ["Madhapur", "Kondapur", "Gachibowli", "Kukatpally", "Banjara Hills", "Ameerpet"],
  blr: ["Indiranagar", "Koramangala", "HSR Layout", "Whitefield", "Jayanagar", "Malleswaram"],
  bom: ["Andheri West", "Bandra West", "Powai", "Goregaon East", "Dadar", "Chembur"],
  maa: ["Adyar", "T. Nagar", "Velachery", "Anna Nagar", "Mylapore", "Tambaram"],
  trv: ["Kowdiar", "Pattom", "Vazhuthacaud", "Kazhakoottam", "Sasthamangalam", "Peroorkada"],
};
const STREETS = ["Flat 302, Sai Residency, 4th Cross", "House 18, 2nd Main Road", "Flat 11B, Green Park Apartments", "Villa 7, Lake View Enclave", "House 45, Temple Street", "Flat 604, Sunrise Towers", "House 9, Gandhi Nagar, 1st Lane", "Flat 203, Lotus Heights"];
const LANDMARKS = ["Opposite the post office", "Next to the Hanuman temple", "Behind the government school", "Near the bus stop", "Above the medical shop", "Lane after the petrol pump", "Near the park gate", "Opposite the bank"];

export type Job = {
  id: string;
  serviceId: string;
  patient: { first: string; full: string; age: number; gender: "F" | "M" };
  area: string;
  address: string; // full address, shown only after the request is accepted
  landmark: string;
  cityId: string;
  distanceKm: number;
  dateOffset: number; // days from today
  slot: string; // a time from SLOTS, or URGENT_SLOT
  visits: number; // 1, or a course of repeat visits
  everyDays: number;
  visitNo: number;
  sameCaregiver: boolean;
  vitalIds: string[];
  womenOnly: boolean;
  language: string; // language the patient prefers
  pay: "online" | "cash";
  note: string; // from the patient
  receivedAt: number;
};

type Template = Omit<Job, "id" | "area" | "address" | "landmark" | "cityId" | "language" | "receivedAt"> & { areaIdx: number };

// The sample requests, in the order they arrive. Built for whichever city the caregiver works in.
const TEMPLATES: Template[] = [
  { serviceId: "inj", patient: { first: "Lakshmi", full: "Lakshmi Reddy", age: 64, gender: "F" }, areaIdx: 0, distanceKm: 1.8, dateOffset: 0, slot: "4:00 PM", visits: 5, everyDays: 1, visitNo: 1, sameCaregiver: true, vitalIds: [], womenOnly: false, pay: "online", note: "Vitamin B12 injection for 5 days. The medicine is in the fridge." },
  { serviceId: "dress", patient: { first: "Arjun", full: "Arjun Mehta", age: 34, gender: "M" }, areaIdx: 1, distanceKm: 2.6, dateOffset: 0, slot: URGENT_SLOT, visits: 1, everyDays: 1, visitNo: 1, sameCaregiver: true, vitalIds: [], womenOnly: false, pay: "cash", note: "Bike accident yesterday. Cut on the left knee, stitched at the clinic." },
  { serviceId: "vitals", patient: { first: "Kamala", full: "Kamala Subramanian", age: 78, gender: "F" }, areaIdx: 2, distanceKm: 3.4, dateOffset: 1, slot: "6:00 AM", visits: 1, everyDays: 1, visitNo: 1, sameCaregiver: true, vitalIds: ["bp", "sugar", "spo2"], womenOnly: true, pay: "online", note: "Fasting sugar, so please come before breakfast." },
  { serviceId: "iv", patient: { first: "Rahul", full: "Rahul Kulkarni", age: 45, gender: "M" }, areaIdx: 3, distanceKm: 4.1, dateOffset: 0, slot: "12:00 PM", visits: 1, everyDays: 1, visitNo: 1, sameCaregiver: true, vitalIds: [], womenOnly: false, pay: "online", note: "One bottle of saline as prescribed. Weak after fever." },
  { serviceId: "elder", patient: { first: "Shanta", full: "Shanta Desai", age: 82, gender: "F" }, areaIdx: 4, distanceKm: 2.2, dateOffset: 0, slot: "7:00 PM", visits: 7, everyDays: 2, visitNo: 1, sameCaregiver: true, vitalIds: [], womenOnly: true, pay: "cash", note: "Bedsore on the lower back. She cannot sit up on her own." },
  { serviceId: "med", patient: { first: "Gopal", full: "Gopal Nair", age: 70, gender: "M" }, areaIdx: 5, distanceKm: 1.1, dateOffset: 1, slot: "9:00 AM", visits: 10, everyDays: 1, visitNo: 1, sameCaregiver: false, vitalIds: [], womenOnly: false, pay: "online", note: "Morning insulin and tablets. He forgets doses." },
  { serviceId: "dress", patient: { first: "Priya", full: "Priya Venkatesh", age: 29, gender: "F" }, areaIdx: 0, distanceKm: 0.8, dateOffset: 0, slot: "4:00 PM", visits: 1, everyDays: 1, visitNo: 1, sameCaregiver: true, vitalIds: [], womenOnly: false, pay: "online", note: "Dressing change for stitches on the right hand." },
  { serviceId: "vitals", patient: { first: "Imran", full: "Imran Ahmed", age: 52, gender: "M" }, areaIdx: 1, distanceKm: 3.0, dateOffset: 0, slot: URGENT_SLOT, visits: 1, everyDays: 1, visitNo: 1, sameCaregiver: true, vitalIds: ["temp", "pulse", "spo2"], womenOnly: false, pay: "cash", note: "Fever since last night. Wants a check before calling the doctor." },
];

export function sampleJobs(cityId: string): Job[] {
  const city = CITIES.find((c) => c.id === cityId) ?? CITIES[0];
  const areas = AREAS[city.id] ?? AREAS.hyd;
  return TEMPLATES.map(({ areaIdx, ...tpl }, i) => ({
    ...tpl,
    id: `job-${i + 1}`,
    area: areas[areaIdx % areas.length],
    address: `${STREETS[i % STREETS.length]}, ${areas[areaIdx % areas.length]}, ${city.name}`,
    landmark: LANDMARKS[i % LANDMARKS.length],
    cityId: city.id,
    language: i % 3 === 2 ? "English" : city.language,
    receivedAt: 0,
  }));
}

/* ---------- Money ---------- */
export const serviceOf = (job: Job) => SERVICES.find((s) => s.id === job.serviceId) ?? SERVICES[0];
export const checksOf = (job: Job) => VITAL_CHECKS.filter((v) => job.vitalIds.includes(v.id));
export const isUrgent = (job: Job) => job.slot === URGENT_SLOT;

/** What the patient pays for one visit. */
export function visitPrice(job: Job) {
  const service = serviceOf(job);
  const servicePrice = job.serviceId === "vitals" ? checksOf(job).reduce((sum, c) => sum + c.price, 0) : service.price;
  const urgent = isUrgent(job) ? URGENT_FEE : 0;
  return { servicePrice, visitFee: VISIT_FEE, urgent, total: servicePrice + VISIT_FEE + urgent };
}

/** What the caregiver earns for one visit, line by line. */
export function earningFor(job: Job) {
  const p = visitPrice(job);
  const service = Math.round(p.servicePrice * CAREGIVER_SHARE);
  const visitFee = Math.round(p.visitFee * VISIT_FEE_SHARE);
  const urgent = Math.round(p.urgent * URGENT_SHARE);
  return { service, visitFee, urgent, total: service + visitFee + urgent, patientPays: p.total };
}

export const NO_SHOW_PAY = Math.round(VISIT_FEE * VISIT_FEE_SHARE); // paid when nobody answers the door

/* ---------- Visit record: reading checks ---------- */
// Plain-language flags only. The caregiver tells the family to share the reading with their doctor.
export type ReadingField = { id: string; label: string; unit: string; min: number; max: number; step?: string };
export const READING_FIELDS: Record<string, ReadingField[]> = {
  bp: [
    { id: "bp_sys", label: "Upper (systolic)", unit: "mmHg", min: 60, max: 260 },
    { id: "bp_dia", label: "Lower (diastolic)", unit: "mmHg", min: 30, max: 160 },
  ],
  sugar: [{ id: "sugar", label: "Blood sugar", unit: "mg/dL", min: 20, max: 600 }],
  temp: [{ id: "temp", label: "Temperature", unit: "°F", min: 90, max: 110, step: "0.1" }],
  spo2: [{ id: "spo2", label: "Oxygen level (SpO2)", unit: "%", min: 50, max: 100 }],
  pulse: [{ id: "pulse", label: "Pulse (heart rate)", unit: "bpm", min: 30, max: 220 }],
  weight: [{ id: "weight", label: "Weight", unit: "kg", min: 1, max: 250, step: "0.1" }],
};

/** Returns a warning for a reading outside the usual range, or null. */
export function readingFlag(id: string, values: Record<string, string>): string | null {
  const n = (k: string) => Number(values[k]);
  switch (id) {
    case "bp": {
      if (!values.bp_sys || !values.bp_dia) return null;
      if (n("bp_sys") >= 180 || n("bp_dia") >= 120) return "Very high blood pressure. Ask the family to contact their doctor today.";
      if (n("bp_sys") >= 140 || n("bp_dia") >= 90) return "Blood pressure is high. Ask the family to share it with their doctor.";
      if (n("bp_sys") < 90 || n("bp_dia") < 60) return "Blood pressure is low. Ask the family to share it with their doctor.";
      return null;
    }
    case "sugar":
      if (!values.sugar) return null;
      if (n("sugar") < 70) return "Sugar is low. Give something sweet if the patient can swallow, and tell the family to call their doctor.";
      if (n("sugar") >= 250) return "Sugar is very high. Ask the family to contact their doctor today.";
      return null;
    case "temp":
      if (!values.temp) return null;
      if (n("temp") >= 103) return "High fever. Ask the family to contact their doctor today.";
      if (n("temp") >= 100.4) return "Fever. Ask the family to share it with their doctor.";
      return null;
    case "spo2":
      if (!values.spo2) return null;
      if (n("spo2") < 90) return "Oxygen is very low. This can be an emergency: help the family call 112 or go to hospital.";
      if (n("spo2") < 94) return "Oxygen is low. Ask the family to contact their doctor today.";
      return null;
    case "pulse":
      if (!values.pulse) return null;
      if (n("pulse") > 120 || n("pulse") < 45) return "Pulse is far from normal. Ask the family to contact their doctor today.";
      if (n("pulse") > 100 || n("pulse") < 50) return "Pulse is outside the usual range. Ask the family to share it with their doctor.";
      return null;
    default:
      return null;
  }
}

/* ---------- Visit record: per-service choices ---------- */
export const INJECTION_SITES = ["Left upper arm", "Right upper arm", "Left thigh", "Right thigh", "Buttock", "Belly (under the skin)"];
export const WOUND_STATES = ["Healing well", "Some redness or discharge", "Looks infected. Needs a doctor"];
export const NEXT_DRESSING = ["Tomorrow", "In 2 days", "In 3 days", "No more dressing needed"];
export const SIDE_EFFECTS = ["None", "Mild, told the family", "Serious. Needs a doctor"];

/* ---------- Leaving a visit ---------- */
export const CAREGIVER_CANCEL_REASONS = ["I am unwell", "My vehicle broke down", "Emergency at home", "I accepted by mistake", "Something else"];
export const DECLINE_REASONS = ["Too far", "Not free at that time", "Not comfortable with this service", "Something else"];

/** Sample prescription text shown during the safety check (the real one is the patient's photo). */
export const SAMPLE_RX: Record<string, { lines: string[]; doctor: string }> = {
  inj: { doctor: "Dr. S. Rao, MBBS, MD", lines: ["Inj. Vitamin B12 (Methylcobalamin) 1500 mcg", "1 ampoule IM, once daily × 5 days"] },
  iv: { doctor: "Dr. K. Iyer, MBBS", lines: ["Inj. Normal saline (0.9% NaCl) 500 ml", "IV over 1 hour, once"] },
  med: { doctor: "Dr. P. Menon, MBBS, MD", lines: ["Inj. Insulin (as per chart) before breakfast", "Tab. Metformin 500 mg after breakfast"] },
};

/* ---------- Answering requests (PLACEHOLDERS) ---------- */
export const OFFER_MINUTES = 15; // time to answer a scheduled request
export const OFFER_MINUTES_URGENT = 3; // time to answer an urgent ("within 60 minutes") request

/* ---------- Registration renewal (PLACEHOLDER) ---------- */
export const RENEWAL_WARN_DAYS = 60; // start reminding this many days before a nurse's registration expires

/* ---------- Report a problem ---------- */
export const REPORT_TOPICS = ["Problem at a visit", "Payment or payout", "A patient behaved badly", "Safety concern", "The app is not working", "Something else"];

/* ---------- Patient cancels (sample reasons) ---------- */
export const PATIENT_CANCEL_REASONS = ["The patient is feeling better", "The doctor changed the treatment", "I need a different day or time"];

/** SAMPLE ratings that arrive after a finished visit (the patient rates in their app). */
export const SAMPLE_NEW_REVIEWS = [
  { stars: 5, text: "Kind and quick. Explained what she was doing.", tags: ["Gentle", "Explains well"] },
  { stars: 5, text: "Arrived on time and left everything clean.", tags: ["On time", "Clean and careful"] },
  { stars: 4, text: "Good work. Would like a call before arriving next time.", tags: ["Clean and careful"] },
];

export { SLOTS, URGENT_SLOT };
