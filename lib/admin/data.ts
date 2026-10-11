// ADMIN PANEL: SAMPLE DATA AND SETTINGS.
// Every caregiver, patient, booking, refund and ticket here is an example, built fresh each time the panel opens
// (dates are relative to today). What the admin decides is saved separately (lib/admin/store.tsx).
// When the backend exists, all of this comes from the API instead.

import {
  CITIES, DEFAULT_CHECK_PRICES, DEFAULT_SERVICE_PRICES, FREE_UNTIL_HOURS, GRACE_MINUTES, LATE_MINUTES, NO_SHOW_MINUTES,
  SERVICES, SLOTS, URGENT_FEE, VISIT_FEE, VITAL_CHECKS,
} from "@/lib/data";
import {
  AREAS, CAREGIVER_SHARE, OFFER_MINUTES, OFFER_MINUTES_URGENT, PAYOUT_DAY, RENEWAL_WARN_DAYS, URGENT_SHARE, VISIT_FEE_SHARE, type Role,
} from "@/lib/caregiver/data";
import type { PhotoFile } from "@/lib/prescription";

export type AdminPage = "dashboard" | "verification" | "caregivers" | "bookings" | "refunds" | "support" | "payouts" | "settings" | "activity";

export const DAY = 86400000;
const HOUR = 3600000;

/* ---------- Small helpers ---------- */

export const money = (n: number) => (n < 0 ? "−₹" : "₹") + Math.abs(Math.round(n)).toLocaleString("en-IN");
export const cityName = (id: string) => CITIES.find((c) => c.id === id)?.name ?? id;
export const serviceName = (id: string) => SERVICES.find((s) => s.id === id)?.name ?? id;
export const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };

/** "YYYY-MM", a number of months from now. */
export const monthFromNow = (months: number) => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const monthText = (ym?: string) => {
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return "Not given";
  const [y, m] = ym.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};
/** Days until the end of a "YYYY-MM" month (negative = already lapsed). */
export const daysUntilMonthEnd = (ym?: string, nowMs = Date.now()) => {
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return null;
  const [y, m] = ym.split("-").map(Number);
  return Math.ceil((new Date(y, m, 0, 23, 59, 59).getTime() - nowMs) / DAY);
};

export const dateTime = (ms: number) => {
  const d = new Date(ms);
  const time = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true }).toUpperCase();
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${time}`;
};
export const dateOnly = (ms: number) => { const d = new Date(ms); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
export const ago = (ms: number, nowMs = Date.now()) => {
  const mins = Math.round((nowMs - ms) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24) return `${Math.floor(mins / 60)} hr ago`;
  const days = Math.floor(mins / 1440);
  return days === 1 ? "yesterday" : `${days} days ago`;
};

/** Monday 00:00 of the week containing `ms`. */
export function mondayOf(ms: number) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}
export const weekKey = (monday: number) => new Date(monday).toISOString().slice(0, 10);

// Deterministic "random" numbers, so the sample data is the same every time the panel opens.
function seeded(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- Sample document pictures ---------- */

const svg = (body: string, w = 400, h = 260) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="sans-serif">${body}</svg>`)}`;

const photo = (name: string, dataUrl: string): PhotoFile => ({ kind: "image", name, size: 64000, dataUrl, addedAt: Date.now() });

export function sampleIdPhoto(name: string, last4: string) {
  return photo("id.jpg", svg(
    `<rect width="400" height="260" rx="14" fill="#f4f1e8"/><rect x="0" y="0" width="400" height="44" rx="14" fill="#c9732d"/><rect y="30" width="400" height="14" fill="#c9732d"/>` +
    `<text x="20" y="29" font-size="17" font-weight="700" fill="#fff">GOVERNMENT ID · SAMPLE</text>` +
    `<rect x="20" y="66" width="96" height="120" rx="6" fill="#d9d3c3"/><circle cx="68" cy="108" r="22" fill="#b5ab96"/><rect x="36" y="138" width="64" height="40" rx="18" fill="#b5ab96"/>` +
    `<text x="134" y="88" font-size="18" font-weight="700" fill="#3a3326">${name}</text>` +
    `<text x="134" y="116" font-size="14" fill="#6b6253">Date of birth: on file</text>` +
    `<text x="134" y="210" font-size="22" font-weight="700" fill="#3a3326" letter-spacing="3">XXXX XXXX ${last4}</text>`,
  ));
}
export function sampleSelfie(seed: number) {
  const tones = ["#c58c63", "#a96f4a", "#d7a27a", "#8d5a3b"];
  return photo("selfie.jpg", svg(
    `<rect width="300" height="380" fill="#dfe7ef"/><circle cx="150" cy="150" r="70" fill="${tones[seed % 4]}"/>` +
    `<rect x="60" y="250" width="180" height="160" rx="80" fill="#5b7894"/><text x="150" y="360" font-size="18" font-weight="700" fill="#fff" text-anchor="middle">SAMPLE</text>`, 300, 380,
  ));
}
export function sampleCertificate(name: string, course: string, regNo: string) {
  return photo("certificate.jpg", svg(
    `<rect width="400" height="290" fill="#fffdf6"/><rect x="10" y="10" width="380" height="270" fill="none" stroke="#b8963e" stroke-width="4"/>` +
    `<text x="200" y="60" font-size="20" font-weight="700" fill="#5a4413" text-anchor="middle">CERTIFICATE · SAMPLE</text>` +
    `<text x="200" y="104" font-size="14" fill="#6b5a35" text-anchor="middle">This is to certify that</text>` +
    `<text x="200" y="140" font-size="22" font-weight="700" fill="#2f2610" text-anchor="middle">${name}</text>` +
    `<text x="200" y="176" font-size="15" fill="#6b5a35" text-anchor="middle">${course}</text>` +
    `<text x="200" y="232" font-size="14" fill="#6b5a35" text-anchor="middle">${regNo ? `Reg. no. ${regNo}` : "Training certificate"}</text>`, 400, 290,
  ));
}

/* ---------- Settings (what the admin can change) ---------- */

export type CitySetting = { id: string; name: string; state: string; language: string; open: boolean };

export type Settings = {
  prices: Record<string, number>; // service id -> price (vitals is the total of the checks chosen)
  checks: Record<string, number>; // vitals check id -> price
  visitFee: number;
  urgentFee: number;
  graceMinutes: number;
  freeUntilHours: number;
  lateMinutes: number;
  noShowMinutes: number;
  caregiverShare: number; // percent of the service price
  visitFeeShare: number; // percent of the home visit charge
  urgentShare: number; // percent of the urgent charge
  payoutDay: number; // 0 = Sunday
  offerMinutes: number;
  offerMinutesUrgent: number;
  renewalWarnDays: number;
  cities: CitySetting[];
};

export const DEFAULT_SETTINGS: Settings = {
  prices: { ...DEFAULT_SERVICE_PRICES },
  checks: { ...DEFAULT_CHECK_PRICES },
  visitFee: VISIT_FEE,
  urgentFee: URGENT_FEE,
  graceMinutes: GRACE_MINUTES,
  freeUntilHours: FREE_UNTIL_HOURS,
  lateMinutes: LATE_MINUTES,
  noShowMinutes: NO_SHOW_MINUTES,
  caregiverShare: Math.round(CAREGIVER_SHARE * 100),
  visitFeeShare: Math.round(VISIT_FEE_SHARE * 100),
  urgentShare: Math.round(URGENT_SHARE * 100),
  payoutDay: PAYOUT_DAY,
  offerMinutes: OFFER_MINUTES,
  offerMinutesUrgent: OFFER_MINUTES_URGENT,
  renewalWarnDays: RENEWAL_WARN_DAYS,
  cities: CITIES.map((c) => ({ id: c.id, name: c.name, state: c.state, language: c.language, open: true })),
};

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/* ---------- People waiting for verification ---------- */

export type Applicant = {
  id: string;
  live?: boolean; // from the caregiver app in this browser
  name: string;
  phone: string;
  role: Role;
  gender: "F" | "M" | "";
  dob: string;
  cityId: string;
  area: string;
  pincode: string;
  languages: string[];
  submittedAt: number;
  idType: string;
  idLast4: string;
  idPhoto: PhotoFile | null;
  selfie: PhotoFile | null;
  course: string;
  council: string;
  regNo: string;
  validUntil?: string;
  years: string;
  certificate: PhotoFile | null;
  refName: string;
  refPhone: string;
  bank: { holder: string; account: string; ifsc: string; upi: string };
  notes: string[]; // things the team noticed (sample)
  resubmitted?: boolean;
};

const appl = (a: Omit<Applicant, "idPhoto" | "selfie" | "certificate">, seed: number): Applicant => ({
  ...a,
  idPhoto: sampleIdPhoto(a.name, a.idLast4),
  selfie: sampleSelfie(seed),
  certificate: sampleCertificate(a.name, a.course, a.regNo),
});

export function sampleApplicants(nowMs = Date.now()): Applicant[] {
  return [
    appl({ id: "a1", name: "Swathi Goud", phone: "9848012345", role: "nurse", gender: "F", dob: "1994-03-12", cityId: "hyd", area: "Kukatpally", pincode: "500072", languages: ["Telugu", "Hindi", "English"], submittedAt: nowMs - 26 * HOUR, idType: "Aadhaar", idLast4: "7731", course: "GNM", council: "Telangana", regNo: "52240", validUntil: monthFromNow(38), years: "6", refName: "", refPhone: "", bank: { holder: "Swathi Goud", account: "••••4410", ifsc: "SBIN0020871", upi: "swathi@okaxis" }, notes: [] }, 0),
    appl({ id: "a2", name: "Manjunath S", phone: "9900123456", role: "compounder", gender: "M", dob: "1988-11-02", cityId: "blr", area: "Jayanagar", pincode: "560041", languages: ["Kannada", "English"], submittedAt: nowMs - 20 * HOUR, idType: "Driving licence", idLast4: "0921", course: "Diploma in Pharmacy (D.Pharm)", council: "", regNo: "", years: "9", refName: "Dr. Ramesh Hegde, Jayanagar Clinic", refPhone: "9845011122", bank: { holder: "Manjunath S", account: "••••3398", ifsc: "CNRB0000412", upi: "" }, notes: ["Reference doctor not called yet."] }, 1),
    appl({ id: "a3", name: "Fatima Shaikh", phone: "9820044556", role: "nurse", gender: "F", dob: "1991-07-23", cityId: "bom", area: "Bandra West", pincode: "400050", languages: ["Marathi", "Hindi", "Urdu", "English"], submittedAt: nowMs - 9 * HOUR, idType: "Aadhaar", idLast4: "5512", course: "B.Sc Nursing", council: "Maharashtra", regNo: "XIV-88213", validUntil: monthFromNow(22), years: "7", refName: "", refPhone: "", bank: { holder: "Shaikh Traders", account: "••••7764", ifsc: "HDFC0000123", upi: "" }, notes: ["The bank account is in a business name, not her own."] }, 2),
    appl({ id: "a4", name: "Priya Menon", phone: "9447012233", role: "nurse", gender: "F", dob: "1996-01-30", cityId: "trv", area: "Pattom", pincode: "695004", languages: ["Malayalam", "English"], submittedAt: nowMs - 5 * HOUR, idType: "Voter ID", idLast4: "8820", course: "GNM", council: "Kerala", regNo: "KNMC-30117", validUntil: monthFromNow(14), years: "3", refName: "", refPhone: "", bank: { holder: "Priya Menon", account: "••••1290", ifsc: "FDRL0001234", upi: "priya@okhdfc" }, notes: ["The certificate photo is blurred near the registration number."] }, 3),
    appl({ id: "a5", name: "Arun Kumar", phone: "9840055667", role: "nurse", gender: "M", dob: "1990-09-09", cityId: "maa", area: "Velachery", pincode: "600042", languages: ["Tamil", "English"], submittedAt: nowMs - 2 * HOUR, idType: "PAN card", idLast4: "4F2K", course: "Post Basic B.Sc Nursing", council: "Tamil Nadu", regNo: "TNNMC-77120", validUntil: monthFromNow(2), years: "10", refName: "", refPhone: "", bank: { holder: "Arun Kumar", account: "••••6031", ifsc: "IOBA0000456", upi: "" }, notes: ["Registration expires in about 2 months. Approve, and the renewal reminder will start."] }, 4),
  ];
}

/** What a reviewer should check for each document. */
export const REVIEW_CHECKS: Record<string, string[]> = {
  personal: ["Name matches the ID", "18 or older", "City is one we are open in"],
  id: ["Photo is clear and not cut off", "Name matches the details", "Last 4 digits match the number given"],
  selfie: ["Face is clear, no mask, cap or sunglasses", "Same person as the ID photo"],
  qualification: ["Certificate is readable", "Name matches the ID", "Registration found with the state council (nurses)", "Reference called (compounders)"],
  bank: ["Account is in the caregiver's own name", "IFSC code is valid"],
};

/** Ready-made reasons when a document is sent back. They are translated in the caregiver app. */
export const SEND_BACK_REASONS: Record<string, string[]> = {
  personal: ["Your name does not match your ID. Enter it exactly as on the ID."],
  id: [
    "The ID photo is blurred. Take it again in good light.",
    "The ID number does not match the photo. Check the number and add the photo again.",
  ],
  selfie: ["Your face is not clear in the selfie. Take it again facing the light, without a mask or cap."],
  qualification: [
    "The certificate photo is not readable. Take it again so all the text is clear.",
    "We could not find this registration number with the council. Check the number and the state.",
  ],
  bank: ["The name on the bank account does not match your ID. Use your own account."],
};

export const STEP_NAMES: Record<string, string> = {
  personal: "Details", id: "Government ID", selfie: "Selfie", qualification: "Qualification", bank: "Bank account",
};

/* ---------- Caregivers already working ---------- */

export type Tier = "full" | "basic";
export const TIER_TEXT: Record<Tier, string> = {
  full: "All nurse services",
  basic: "Dressing and vitals only",
};

export type Member = {
  id: string;
  live?: boolean;
  name: string;
  role: Role;
  tier: Tier;
  gender: "F" | "M" | "";
  cityId: string;
  area: string;
  phone: string;
  joinedAt: number;
  rating: number;
  ratings: number;
  visits: number;
  cancels30: number; // visits they cancelled in the last 30 days
  complaints: number;
  course: string;
  council: string;
  regNo: string;
  validUntil?: string;
  online: boolean;
  bankLast4: string;
};

export function sampleMembers(nowMs = Date.now()): Member[] {
  const m = (x: Omit<Member, "joinedAt"> & { months: number }): Member => {
    const { months, ...rest } = x;
    return { ...rest, joinedAt: nowMs - months * 30 * DAY };
  };
  return [
    m({ id: "c1", name: "Anjali Thomas", role: "nurse", tier: "full", gender: "F", cityId: "hyd", area: "Madhapur", phone: "9876500011", months: 14, rating: 4.9, ratings: 188, visits: 212, cancels30: 0, complaints: 0, course: "GNM", council: "Telangana", regNo: "48213", validUntil: monthFromNow(30), online: true, bankLast4: "2201" }),
    m({ id: "c2", name: "Mohammed Irfan", role: "nurse", tier: "full", gender: "M", cityId: "hyd", area: "Banjara Hills", phone: "9876500022", months: 10, rating: 4.8, ratings: 121, visits: 147, cancels30: 1, complaints: 0, course: "B.Sc Nursing", council: "Telangana", regNo: "51907", validUntil: monthFromNow(19), online: true, bankLast4: "8812" }),
    m({ id: "c4", name: "Ravi Kumar", role: "compounder", tier: "basic", gender: "M", cityId: "hyd", area: "Ameerpet", phone: "9876500044", months: 20, rating: 4.6, ratings: 402, visits: 501, cancels30: 0, complaints: 1, course: "First aid and wound care course", council: "", regNo: "", online: false, bankLast4: "5530" }),
    m({ id: "m5", name: "Lakshmi Devi", role: "nurse", tier: "full", gender: "F", cityId: "hyd", area: "Gachibowli", phone: "9876500055", months: 8, rating: 4.7, ratings: 64, visits: 80, cancels30: 0, complaints: 0, course: "ANM", council: "Telangana", regNo: "40518", validUntil: monthFromNow(1), online: true, bankLast4: "9014" }),
    m({ id: "c3", name: "Sunita Yadav", role: "nurse", tier: "full", gender: "F", cityId: "blr", area: "Koramangala", phone: "9876500033", months: 16, rating: 4.7, ratings: 310, visits: 389, cancels30: 2, complaints: 1, course: "GNM", council: "Karnataka", regNo: "33684", validUntil: monthFromNow(44), online: false, bankLast4: "3367" }),
    m({ id: "m6", name: "Prakash Gowda", role: "compounder", tier: "basic", gender: "M", cityId: "blr", area: "Whitefield", phone: "9876500066", months: 5, rating: 4.4, ratings: 41, visits: 52, cancels30: 3, complaints: 2, course: "Hospital ward assistant", council: "", regNo: "", online: true, bankLast4: "7720" }),
    m({ id: "m7", name: "Shwetha Rao", role: "nurse", tier: "full", gender: "F", cityId: "blr", area: "HSR Layout", phone: "9876500077", months: 3, rating: 4.9, ratings: 22, visits: 25, cancels30: 0, complaints: 0, course: "B.Sc Nursing", council: "Karnataka", regNo: "61022", validUntil: monthFromNow(50), online: true, bankLast4: "1180" }),
    m({ id: "m8", name: "Pooja Patil", role: "nurse", tier: "full", gender: "F", cityId: "bom", area: "Andheri West", phone: "9876500088", months: 9, rating: 4.8, ratings: 97, visits: 118, cancels30: 0, complaints: 0, course: "GNM", council: "Maharashtra", regNo: "XIV-71204", validUntil: monthFromNow(26), online: false, bankLast4: "4471" }),
    m({ id: "m9", name: "Sachin More", role: "compounder", tier: "basic", gender: "M", cityId: "bom", area: "Goregaon East", phone: "9876500099", months: 6, rating: 4.5, ratings: 58, visits: 70, cancels30: 1, complaints: 0, course: "First aid and wound care course", council: "", regNo: "", online: true, bankLast4: "6625" }),
    m({ id: "m10", name: "Divya Subramanian", role: "nurse", tier: "full", gender: "F", cityId: "maa", area: "Adyar", phone: "9876500110", months: 11, rating: 4.8, ratings: 133, visits: 160, cancels30: 0, complaints: 0, course: "B.Sc Nursing", council: "Tamil Nadu", regNo: "TNNMC-55102", validUntil: monthFromNow(33), online: true, bankLast4: "3092" }),
    m({ id: "m11", name: "Karthik Raj", role: "nurse", tier: "full", gender: "M", cityId: "maa", area: "Anna Nagar", phone: "9876500121", months: 18, rating: 4.6, ratings: 240, visits: 288, cancels30: 1, complaints: 0, course: "GNM", council: "Tamil Nadu", regNo: "TNNMC-40981", validUntil: monthFromNow(-1), online: false, bankLast4: "8110" }),
    m({ id: "m12", name: "Asha Nair", role: "nurse", tier: "full", gender: "F", cityId: "trv", area: "Kowdiar", phone: "9876500132", months: 7, rating: 4.9, ratings: 76, visits: 90, cancels30: 0, complaints: 0, course: "GNM", council: "Kerala", regNo: "KNMC-28813", validUntil: monthFromNow(40), online: true, bankLast4: "2245" }),
    m({ id: "m13", name: "Biju Joseph", role: "compounder", tier: "basic", gender: "M", cityId: "trv", area: "Pattom", phone: "9876500143", months: 4, rating: 4.5, ratings: 30, visits: 36, cancels30: 0, complaints: 0, course: "Diploma in Pharmacy (D.Pharm)", council: "", regNo: "", online: false, bankLast4: "9903" }),
  ];
}

/* ---------- Renewed registrations waiting for checking ---------- */

export type Renewal = { id: string; memberId: string; live?: boolean; validUntil: string; certificate: PhotoFile | null; sentAt: number };

export function sampleRenewals(members: Member[], nowMs = Date.now()): Renewal[] {
  const name = (id: string) => members.find((x) => x.id === id)?.name ?? "";
  return [
    { id: "rn1", memberId: "m5", validUntil: monthFromNow(61), certificate: sampleCertificate(name("m5"), "Renewed registration", "40518"), sentAt: nowMs - 2 * DAY },
    { id: "rn2", memberId: "m11", validUntil: monthFromNow(59), certificate: sampleCertificate(name("m11"), "Renewed registration", "TNNMC-40981"), sentAt: nowMs - 3 * HOUR },
  ];
}

/* ---------- Bookings ---------- */

export type BookingStatus = "upcoming" | "in-progress" | "completed" | "cancelled-patient" | "cancelled-caregiver" | "missed" | "cancelled-admin";

export const STATUS_TEXT: Record<BookingStatus, string> = {
  upcoming: "Upcoming",
  "in-progress": "In progress",
  completed: "Completed",
  "cancelled-patient": "Cancelled by patient",
  "cancelled-caregiver": "Cancelled by caregiver",
  missed: "Missed (nobody home)",
  "cancelled-admin": "Cancelled by us",
};

export type AdminBooking = {
  id: string;
  serviceId: string;
  vitalIds: string[];
  patient: { name: string; age: number; gender: "F" | "M"; phone: string; forWhom: string };
  bookedBy: string;
  cityId: string;
  area: string;
  at: number; // visit time
  urgent: boolean;
  caregiverId: string;
  status: BookingStatus;
  pay: "upi" | "card" | "cash";
  bookedAt: number;
  visitNo: number;
  visits: number;
  servicePrice: number;
  visitFee: number;
  urgentFee: number;
  lateCancel: boolean; // the home visit charge was kept
  cancelReason?: string;
  hasPrescription: boolean;
};

const PATIENTS: [string, "F" | "M"][] = [
  ["Kamala Rao", "F"], ["Venkat Reddy", "M"], ["Shanthi Iyer", "F"], ["Gopal Krishnan", "M"], ["Meera Kulkarni", "F"],
  ["Abdul Rahman", "M"], ["Lalitha Menon", "F"], ["Suresh Pillai", "M"], ["Parvati Hegde", "F"], ["Ramesh Naidu", "M"],
  ["Anitha Joseph", "F"], ["Vijay Deshmukh", "M"], ["Saroja Murthy", "F"], ["Harish Shetty", "M"], ["Nirmala George", "F"],
  ["Prakash Jain", "M"], ["Usha Varma", "F"], ["Mahesh Babu K", "M"], ["Fathima Beevi", "F"], ["Narayan Swamy", "M"],
];
const FOR_WHOM = ["Self", "Mother", "Father", "Grandmother", "Grandfather", "Wife", "Husband"];
const CASH_HEAVY = ["c4", "m9"];
const SLOT_HOURS: Record<string, number> = { "6:00 AM": 6, "9:00 AM": 9, "12:00 PM": 12, "4:00 PM": 16, "7:00 PM": 19, "10:00 PM": 22 };
const PATIENT_CANCEL = ["The patient is feeling better", "The doctor changed the treatment", "I need a different day or time", "Booked by mistake"];
const CAREGIVER_CANCEL = ["I am unwell", "My vehicle broke down", "Emergency at home"];

export function sampleBookings(members: Member[], nowMs = Date.now()): AdminBooking[] {
  const rnd = seeded(20261011);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
  const today = startOfToday();
  const out: AdminBooking[] = [];
  let n = 10230;
  // 6 days ago .. tomorrow, a few more visits each day as the service grows.
  for (let day = -6; day <= 1; day++) {
    const count = 6 + Math.floor(rnd() * 3) + (day + 6) / 2;
    for (let i = 0; i < count; i++) {
      const cityId = rnd() < 0.42 ? "hyd" : pick(["blr", "blr", "bom", "maa", "trv"]);
      const local = members.filter((m) => m.cityId === cityId);
      let serviceId = pick(["inj", "inj", "inj", "iv", "dress", "dress", "elder", "med", "vitals", "vitals"]);
      const cg = pick(local);
      if (cg.role === "compounder" && ["inj", "iv", "med"].includes(serviceId)) serviceId = pick(["dress", "elder", "vitals"]);
      const urgent = rnd() < 0.12 && day >= -6;
      const slot = pick(SLOTS);
      const at = urgent ? today + day * DAY + (8 + Math.floor(rnd() * 12)) * HOUR + Math.floor(rnd() * 4) * 15 * 60000 : today + day * DAY + SLOT_HOURS[slot] * HOUR;
      const [name, gender] = pick(PATIENTS);
      const vitalIds = serviceId === "vitals" ? VITAL_CHECKS.filter(() => rnd() < 0.5).map((c) => c.id) : [];
      if (serviceId === "vitals" && vitalIds.length === 0) vitalIds.push("bp", "sugar");
      const servicePrice = serviceId === "vitals" ? vitalIds.reduce((s, id) => s + DEFAULT_CHECK_PRICES[id], 0) : DEFAULT_SERVICE_PRICES[serviceId];
      const r = rnd();
      let status: BookingStatus;
      if (at > nowMs + 30 * 60000) status = r < 0.06 ? "cancelled-patient" : "upcoming";
      else if (at > nowMs - 60 * 60000) status = "in-progress";
      else status = r < 0.8 ? "completed" : r < 0.9 ? "cancelled-patient" : r < 0.95 ? "missed" : "cancelled-caregiver";
      const visits = rnd() < 0.25 ? pick([3, 5, 7]) : 1;
      const lateCancel = status === "cancelled-patient" && rnd() < 0.45;
      out.push({
        id: `NH-${n++}`,
        serviceId,
        vitalIds,
        patient: { name, age: 24 + Math.floor(rnd() * 60), gender, phone: `98${Math.floor(10000000 + rnd() * 89999999)}`, forWhom: pick(FOR_WHOM) },
        bookedBy: name,
        cityId,
        area: pick(AREAS[cityId]),
        at,
        urgent,
        caregiverId: cg.id,
        status,
        // Some caregivers (in areas where patients prefer cash) collect mostly cash, so they owe us at the end of the week.
        pay: (CASH_HEAVY.includes(cg.id) ? rnd() < 0.9 : rnd() < 0.3) ? "cash" : rnd() < 0.7 ? "upi" : "card",
        bookedAt: at - (urgent ? 50 * 60000 : (2 + Math.floor(rnd() * 40)) * HOUR),
        visitNo: visits > 1 ? 1 + Math.floor(rnd() * visits) : 1,
        visits,
        servicePrice,
        visitFee: VISIT_FEE,
        urgentFee: urgent ? URGENT_FEE : 0,
        lateCancel,
        cancelReason: status === "cancelled-patient" ? pick(PATIENT_CANCEL) : status === "cancelled-caregiver" ? pick(CAREGIVER_CANCEL) : undefined,
        hasPrescription: ["inj", "iv", "med"].includes(serviceId),
      });
    }
  }
  return out.sort((a, b) => b.at - a.at);
}

/* ---------- Money for one booking ---------- */

export type PayLine = { patientPays: number; caregiverGets: number; platformKeeps: number; refundDue: number };

/** What the patient pays, what the caregiver earns and what the platform keeps, using the pay split in settings. */
export function moneyFor(b: AdminBooking, s: Settings, status: BookingStatus = b.status): PayLine {
  const full = b.servicePrice + b.visitFee + b.urgentFee;
  const cgFull = Math.round((b.servicePrice * s.caregiverShare) / 100) + Math.round((b.visitFee * s.visitFeeShare) / 100) + Math.round((b.urgentFee * s.urgentShare) / 100);
  const cgFee = Math.round((b.visitFee * s.visitFeeShare) / 100);
  switch (status) {
    case "completed":
    case "in-progress":
    case "upcoming":
      return { patientPays: full, caregiverGets: cgFull, platformKeeps: full - cgFull, refundDue: 0 };
    case "missed":
      return { patientPays: b.visitFee, caregiverGets: cgFee, platformKeeps: b.visitFee - cgFee, refundDue: b.pay === "cash" ? 0 : full - b.visitFee };
    case "cancelled-patient":
      return b.lateCancel
        ? { patientPays: b.visitFee, caregiverGets: cgFee, platformKeeps: b.visitFee - cgFee, refundDue: b.pay === "cash" ? 0 : full - b.visitFee }
        : { patientPays: 0, caregiverGets: 0, platformKeeps: 0, refundDue: b.pay === "cash" ? 0 : full };
    default: // cancelled by the caregiver or by us: the patient pays nothing
      return { patientPays: 0, caregiverGets: 0, platformKeeps: 0, refundDue: b.pay === "cash" ? 0 : full };
  }
}

export const isPaidOut = (st: BookingStatus) => st === "completed" || st === "missed" || st === "cancelled-patient";

/* ---------- Refund requests ---------- */

export type RefundRequest = { id: string; bookingId: string; reason: string; asked: number; at: number; from: string; createdByAdmin?: boolean };

export function sampleRefunds(bookings: AdminBooking[], nowMs = Date.now()): RefundRequest[] {
  const past = bookings.filter((b) => b.at < nowMs && b.pay !== "cash");
  const find = (fn: (b: AdminBooking) => boolean, skip = 0) => past.filter(fn)[skip];
  const out: RefundRequest[] = [];
  const add = (b: AdminBooking | undefined, reason: string, asked: (b: AdminBooking) => number, hoursAgo: number) => {
    if (b) out.push({ id: `R-${5100 + out.length}`, bookingId: b.id, reason, asked: asked(b), at: nowMs - hoursAgo * HOUR, from: b.bookedBy });
  };
  const full = (b: AdminBooking) => b.servicePrice + b.visitFee + b.urgentFee;
  add(find((b) => b.status === "cancelled-patient" && b.lateCancel), "My father was admitted to hospital that morning, so we had to cancel. Please return the visit charge.", (b) => b.visitFee, 3);
  add(find((b) => b.status === "completed" && b.serviceId === "dress"), "The dressing came off within an hour. I want my money back.", full, 7);
  add(find((b) => b.status === "completed" && b.urgent) ?? find((b) => b.status === "completed", 3), "The urgent visit took 95 minutes to arrive, not 60. Please return the urgent charge.", (b) => b.urgentFee || 100, 20);
  add(find((b) => b.status === "missed"), "We were at home. The doorbell is broken and the nurse did not call.", (b) => b.visitFee, 28);
  add(find((b) => b.status === "completed", 6), "I was charged twice for this visit. Two payments of the same amount on my UPI.", full, 40);
  return out;
}

/* ---------- Support tickets ---------- */

export type AdminTicket = {
  id: string;
  from: "patient" | "caregiver";
  live?: boolean;
  name: string;
  phone: string;
  topic: string;
  message: string;
  bookingId: string | null;
  at: number;
  urgent: boolean;
  photo: PhotoFile | null;
};

export function sampleTickets(bookings: AdminBooking[], nowMs = Date.now()): AdminTicket[] {
  const done = bookings.filter((b) => b.status === "completed");
  const b = (i: number) => done[i % Math.max(done.length, 1)];
  const t = (x: Omit<AdminTicket, "photo">): AdminTicket => ({ ...x, photo: null });
  return [
    t({ id: "T-2047", from: "patient", name: b(1)?.bookedBy ?? "Kamala Rao", phone: b(1)?.patient.phone ?? "", topic: "Problem after a visit", message: "The wound looks redder and is painful since yesterday's dressing. Should we see a doctor?", bookingId: b(1)?.id ?? null, at: nowMs - 40 * 60000, urgent: true }),
    t({ id: "T-2045", from: "caregiver", name: "Pooja Patil", phone: "9876500088", topic: "A patient behaved badly", message: "A family member shouted at me and refused to let me leave until I gave a second injection without a prescription.", bookingId: null, at: nowMs - 2 * HOUR, urgent: true }),
    t({ id: "T-2044", from: "patient", name: b(4)?.bookedBy ?? "Venkat Reddy", phone: b(4)?.patient.phone ?? "", topic: "Behaviour of the caregiver", message: "The nurse did not wear gloves and was in a hurry. Not happy with the visit.", bookingId: b(4)?.id ?? null, at: nowMs - 5 * HOUR, urgent: true }),
    t({ id: "T-2046", from: "patient", name: "Usha Varma", phone: "9845098450", topic: "App problem", message: "The prescription photo upload keeps saying the photo is too small to read.", bookingId: null, at: nowMs - 9 * HOUR, urgent: false }),
    t({ id: "T-2043", from: "caregiver", name: "Ravi Kumar", phone: "9876500044", topic: "Payment or payout", message: "Last Monday's payout was ₹420 less than my earnings screen showed.", bookingId: null, at: nowMs - 22 * HOUR, urgent: false }),
    t({ id: "T-2042", from: "patient", name: b(6)?.bookedBy ?? "Shanthi Iyer", phone: b(6)?.patient.phone ?? "", topic: "Payment", message: "Charged twice for one visit. Please check.", bookingId: b(6)?.id ?? null, at: nowMs - 41 * HOUR, urgent: false }),
    t({ id: "T-2041", from: "patient", name: b(9)?.bookedBy ?? "Gopal Krishnan", phone: b(9)?.patient.phone ?? "", topic: "Caregiver was late", message: "The caregiver came 40 minutes late and did not call.", bookingId: b(9)?.id ?? null, at: nowMs - 3 * DAY, urgent: false }),
  ];
}

/** Past payouts (sample), per caregiver, for the history table. */
export function samplePastPayouts(members: Member[], nowMs = Date.now()) {
  const rnd = seeded(77);
  const thisMonday = mondayOf(nowMs);
  return [1, 2, 3].map((w) => {
    const monday = thisMonday - w * 7 * DAY;
    const rows = members.filter((m) => !m.live).map((m) => ({ memberId: m.id, amount: 1200 + Math.round(rnd() * 3200), reference: `UTR ${4100 + w}${Math.floor(1000 + rnd() * 8999)} ${Math.floor(1000 + rnd() * 8999)}` }));
    return { monday, paidOn: monday + 7 * DAY + 10 * HOUR, rows, total: rows.reduce((s, r) => s + r.amount, 0) };
  });
}
