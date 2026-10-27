"use client";

// CAREGIVER APP STATE. Saved in the browser under its own key, separate from the patient app.
// When the backend exists, replace the load/save here and the `set` calls with API calls.

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { db } from "@/lib/supabase";
import { pullCaregiver, pushCaregiver, type CgSnapshot, type PulledCaregiver } from "./sync";
import { setLang, type Lang } from "@/lib/i18n";
import type { Msg } from "@/lib/booking";
import type { PhotoFile } from "@/lib/prescription";
import { sampleJobs, type IdType, type Job, type Role } from "./data";

export type CgScreen =
  | "login" | "otp" | "role"
  | "kyc" | "kyc-personal" | "kyc-id" | "kyc-selfie" | "kyc-qualification" | "kyc-bank" | "review"
  | "jobs" | "job" | "visit" | "record" | "visit-done" | "cancel-visit"
  | "schedule" | "availability" | "earnings" | "profile" | "help" | "legal"
  | "notifications" | "ratings" | "report" | "payouts" | "patient-cancelled" | "renew";

export const CG_TABS: CgScreen[] = ["jobs", "schedule", "earnings", "profile"];

export type Personal = { name: string; gender: "F" | "M" | ""; dob: string; languages: string[]; cityId: string; area: string; pincode: string };
export type IdProof = { type: IdType; number: string; photo: PhotoFile | null };
export type Qualification = {
  course: string; // nurse course, or compounder training
  council: string; // state of the nursing council (nurses)
  regNo: string; // registration or certificate number
  years: string;
  certificate: PhotoFile | null;
  refName: string; // compounders: a doctor or clinic who can vouch for them
  refPhone: string;
  validUntil?: string; // nurses: registration valid until, "YYYY-MM" (missing on data saved before 1.0.5)
};
export type Bank = { holder: string; account: string; ifsc: string; upi: string };

export type KycStep = "personal" | "id" | "selfie" | "qualification" | "bank";
export const KYC_STEPS: KycStep[] = ["personal", "id", "selfie", "qualification", "bank"];

export type KycStatus = "draft" | "submitted" | "approved" | "rejected";

export type Availability = { days: number[]; start: string; end: string; radiusKm: number; services: string[]; urgent: boolean };

/** One visit being carried out. */
export type ActiveVisit = {
  jobId: string;
  step: number; // 0 accepted, 1 on the way, 2 at the door, 3 safety check, 4 care in progress
  late: number; // minutes the caregiver said they are running late (0 = on time)
  waitStartedAt: number | null; // "nobody is answering" timer
  waitSkipped: boolean; // prototype: skip the 10-minute wait
  checks: Record<string, boolean>;
};

export type Earning = {
  id: string;
  at: number;
  kind: "visit" | "missed" | "late-cancel" | "stopped";
  title: Msg;
  patient: string;
  amount: number; // earned by the caregiver
  cash: number; // cash collected from the patient (already in the caregiver's hand)
  sample?: boolean;
};

export type VisitRecord = {
  kind: "completed" | "missed" | "stopped";
  jobId: string;
  title: Msg;
  patient: string;
  at: number;
  note: string;
  details: { label: Msg; value: Msg }[];
  readings: { label: Msg; value: string }[];
  warnings: Msg[];
  earned: number;
  cash: number;
  nextVisit: Msg | null;
};

/** An in-app notification. Titles and bodies are messages, so they follow the app language. */
export type CgNotice = {
  id: string;
  kind: "request" | "cancelled" | "payout" | "document" | "rating" | "verified" | "expired" | "support" | "message";
  title: Msg;
  body: Msg;
  at: number;
  read: boolean;
  key?: string; // stops the same reminder being added twice
  to?: CgScreen; // where tapping it goes
};

export type Review = { id: string; stars: number; text: Msg; tags: string[]; service: Msg; patient: string; at: number; sample?: boolean };

export type Ticket = { id: string; topic: string; visit: string | null; message: string; photo: PhotoFile | null; at: number; status: "open" | "resolved"; reply?: { text: string; at: number } | null };

export type Payout = { id: string; at: number; amount: number; account: string; reference: string; sample?: boolean };

/** What the caregiver sees after a patient cancels an accepted visit. */
export type PatientCancel = { title: Msg; patient: string; when: Msg; reason: string; paid: number; late: boolean };

export type CgState = {
  lang: Lang;
  screen: CgScreen;
  trail: CgScreen[];
  phone: string;
  role: Role | null;
  personal: Personal | null;
  idProof: IdProof | null;
  selfie: PhotoFile | null;
  qualification: Qualification | null;
  bank: Bank | null;
  agreed: boolean;
  kycStatus: KycStatus;
  rejected: { step: KycStep; reason: string } | null; // what to fix when a document was not accepted
  online: boolean;
  availability: Availability;
  requestIds: string[] | null; // sample requests still waiting; null until first online
  declined: string[];
  upcoming: Job[]; // accepted visits, earliest first
  openJobId: string | null; // the request or visit being looked at
  active: ActiveVisit | null;
  lastRecord: VisitRecord | null;
  records: VisitRecord[];
  earnings: Earning[];
  installDismissed: boolean;
  legalDoc: "terms" | "conduct";
  notices: CgNotice[];
  reviews: Review[];
  tickets: Ticket[];
  payouts: Payout[];
  offers: Record<string, number>; // request id -> when it was offered (for the time limit)
  expired: string[]; // requests that ran out of time
  lastCancel: PatientCancel | null;
  renewal: { certificate: PhotoFile; validUntil: string; at: number } | null; // renewed registration waiting for checking
  tier: "full" | "basic"; // set by the verification team: "basic" = dressing and vitals only, even for a nurse
  suspended: { reason: string; at: number } | null; // paused by the admin team: no requests until reinstated
  mode: "live" | "demo"; // live = real sign-in, details saved to the account; demo = sample data
  userId: string | null;
  cgExists: boolean; // the caregiver row is already in the database
  syncError: boolean;
};

const now = () => Date.now();
const DAY = 86400000;

// SAMPLE earnings from earlier in the week, so the Earnings screen shows how it works.
const sampleEarnings = (): Earning[] => [
  { id: "s1", at: now() - 1 * DAY, kind: "visit", title: { k: "Wound dressing" }, patient: "Suresh P.", amount: 289, cash: 349, sample: true },
  { id: "s2", at: now() - 2 * DAY, kind: "visit", title: { k: "Vitals check" }, patient: "Meera K.", amount: 145, cash: 0, sample: true },
  { id: "s3", at: now() - 2 * DAY, kind: "late-cancel", title: { k: "Late cancellation by the patient" }, patient: "Vijay R.", amount: 49, cash: 0, sample: true },
];

export const DEFAULT_AVAILABILITY: Availability = {
  days: [0, 1, 2, 3, 4, 5, 6],
  start: "6:00 AM",
  end: "10:00 PM",
  radiusKm: 5,
  services: ["inj", "iv", "dress", "elder", "med", "vitals"],
  urgent: true,
};

const initialState: CgState = {
  lang: "en",
  screen: "login",
  trail: [],
  phone: "9123456780",
  role: null,
  personal: null,
  idProof: null,
  selfie: null,
  qualification: null,
  bank: null,
  agreed: false,
  kycStatus: "draft",
  rejected: null,
  online: false,
  availability: DEFAULT_AVAILABILITY,
  requestIds: null,
  declined: [],
  upcoming: [],
  openJobId: null,
  active: null,
  lastRecord: null,
  records: [],
  earnings: [],
  installDismissed: false,
  legalDoc: "terms",
  notices: [],
  reviews: [],
  tickets: [],
  payouts: [],
  offers: {},
  expired: [],
  lastCancel: null,
  renewal: null,
  tier: "full",
  suspended: null,
  mode: "live",
  userId: null,
  cgExists: false,
  syncError: false,
};

export const CG_STORAGE_KEY = "nurse-at-home-caregiver:v1";
const STORAGE_KEY = CG_STORAGE_KEY;

type Ctx = {
  state: CgState;
  ready: boolean;
  set: (patch: Partial<CgState>) => void;
  update: (fn: (prev: CgState) => Partial<CgState>) => void;
  go: (screen: CgScreen) => void;
  open: (screen: CgScreen, patch?: Partial<CgState>) => void;
  back: (patch?: Partial<CgState>) => void;
  reset: () => void;
  /** After a real sign-in: load the caregiver's account and continue to the right screen. */
  signedIn: (userId: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** All sample jobs for the caregiver's city (requests and accepted visits are looked up here). */
  jobs: Job[];
  jobById: (id: string | null) => Job | null;
};

const CgContext = createContext<Ctx | null>(null);

export function CaregiverProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CgState>(initialState);
  const [ready, setReady] = useState(false);

  setLang(state.lang);
  useEffect(() => { document.documentElement.lang = state.lang; }, [state.lang]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<CgState>;
        // Saved before 1.1.0 (no sign-in yet): that was the demo.
        const mode = parsed.mode ?? (parsed.role ? "demo" : "live");
        setState({ ...initialState, ...parsed, mode, syncError: false });
      }
    } catch {
      // Storage blocked or unreadable: start fresh.
    }
    setReady(true);
    // The admin panel (another tab, same browser) can approve, send back or pause this caregiver.
    // Take its changes as soon as they are saved. When the backend exists, this becomes a push from the server.
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      try {
        const next = JSON.parse(e.newValue) as Partial<CgState>;
        setState((prev) => (JSON.stringify(prev) === e.newValue ? prev : { ...initialState, ...next }));
      } catch {
        // Ignore unreadable data.
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage full or blocked: the app still works for this visit.
    }
  }, [state, ready]);

  // Live mode: refresh from the database when the app opens; save role, details and language when they change.
  const lastPushed = useRef<CgSnapshot | null>(null);
  const [synced, setSynced] = useState(false);
  useEffect(() => {
    if (!ready || state.mode !== "live" || !state.userId || synced) return;
    let cancelled = false;
    (async () => {
      const { data } = await db("caregiver").auth.getSession();
      if (cancelled) return;
      if (!data.session || data.session.user.id !== state.userId) { setState((prev) => ({ ...initialState, lang: prev.lang })); return; }
      try {
        const acc = await pullCaregiver(state.userId!);
        if (cancelled) return;
        setState((prev) => mergeCaregiver(prev, acc));
        lastPushed.current = { lang: acc.lang, role: acc.role, personal: acc.personal };
      } catch {
        lastPushed.current = { lang: state.lang, role: state.role, personal: state.personal };
      }
      setSynced(true);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, state.mode, state.userId, synced]);

  const snapKey = JSON.stringify({ lang: state.lang, role: state.role, personal: state.personal });
  useEffect(() => {
    if (!ready || state.mode !== "live" || !state.userId || !synced || !state.role) return;
    if (lastPushed.current && JSON.stringify(lastPushed.current) === snapKey) return;
    const next: CgSnapshot = { lang: state.lang, role: state.role, personal: state.personal };
    const prevSnap = lastPushed.current;
    lastPushed.current = next;
    pushCaregiver(state.userId, prevSnap, next, state.cgExists)
      .then((exists) => setState((prev) => ({ ...prev, cgExists: exists, syncError: false })))
      .catch(() => { lastPushed.current = prevSnap; setState((prev) => ({ ...prev, syncError: true })); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapKey, ready, state.mode, state.userId, synced]);

  const signedIn = async (userId: string) => {
    const acc = await pullCaregiver(userId);
    lastPushed.current = acc.exists ? { lang: acc.lang, role: acc.role, personal: acc.personal } : null;
    setSynced(true);
    setState((prev) => {
      const merged = mergeCaregiver({ ...prev, mode: "live", userId }, acc);
      const screen: CgScreen = merged.kycStatus === "approved" ? "jobs" : merged.kycStatus === "submitted" ? "review" : merged.role ? "kyc" : "role";
      return { ...merged, screen, trail: [] };
    });
  };
  const signOut = async () => {
    if (state.mode === "live") await db("caregiver").auth.signOut().catch(() => {});
    lastPushed.current = null;
    setSynced(false);
    setState((prev) => ({ ...initialState, lang: prev.lang }));
  };

  const set = (patch: Partial<CgState>) => setState((prev) => ({ ...prev, ...patch }));
  // An empty change keeps the same state, so nothing re-draws or re-saves (the engine checks every second).
  const update = (fn: (prev: CgState) => Partial<CgState>) =>
    setState((prev) => { const patch = fn(prev); return Object.keys(patch).length ? { ...prev, ...patch } : prev; });
  const go = (screen: CgScreen) => set({ screen, trail: [] });
  const open = (screen: CgScreen, patch: Partial<CgState> = {}) =>
    setState((prev) => ({ ...prev, ...patch, screen, trail: [...prev.trail, prev.screen] }));
  const back = (patch: Partial<CgState> = {}) =>
    setState((prev) => ({ ...prev, ...patch, screen: prev.trail[prev.trail.length - 1] ?? "jobs", trail: prev.trail.slice(0, -1) }));
  const reset = () => {
    if (state.mode === "live") void db("caregiver").auth.signOut();
    lastPushed.current = null;
    setSynced(false);
    setState((prev) => ({ ...initialState, lang: prev.lang }));
  };

  const jobs = sampleJobs(state.personal?.cityId ?? "hyd");
  const jobById = (id: string | null) => (id ? state.upcoming.find((j) => j.id === id) ?? jobs.find((j) => j.id === id) ?? null : null);

  return (
    <CgContext.Provider value={{ state, ready, set, update, go, open, back, reset, signedIn, signOut, jobs, jobById }}>
      {children}
    </CgContext.Provider>
  );
}

export function useCg() {
  const ctx = useContext(CgContext);
  if (!ctx) throw new Error("useCg must be used inside CaregiverProvider");
  return ctx;
}

/* ---------- Sample history added when a caregiver is approved (prototype) ---------- */

const mondayBefore = (weeksAgo: number) => {
  const d = new Date();
  d.setHours(10, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7 * weeksAgo);
  return d.getTime();
};

// SAMPLE payouts for the last three Mondays.
const samplePayouts = (account: string): Payout[] => [
  { id: "p1", at: mondayBefore(0), amount: 3480, account, reference: "UTR 4129 8830 1172", sample: true },
  { id: "p2", at: mondayBefore(1), amount: 2915, account, reference: "UTR 4129 5521 0496", sample: true },
  { id: "p3", at: mondayBefore(2), amount: 3120, account, reference: "UTR 4128 9907 3315", sample: true },
];

// SAMPLE reviews from earlier patients.
const sampleReviews = (): Review[] => [
  { id: "r1", stars: 5, text: { k: "Very gentle with my father and explained every step." }, tags: ["Gentle", "Explains well"], service: { k: "Wound dressing" }, patient: "Suresh P.", at: now() - 1 * DAY, sample: true },
  { id: "r2", stars: 5, text: { k: "Came on time and the injection did not hurt." }, tags: ["On time"], service: { k: "Injection at home" }, patient: "Anitha R.", at: now() - 4 * DAY, sample: true },
  { id: "r3", stars: 4, text: { k: "Good care. Came 15 minutes late but called to tell us." }, tags: ["Kept us informed"], service: { k: "Vitals check" }, patient: "Meera K.", at: now() - 9 * DAY, sample: true },
  { id: "r4", stars: 5, text: { k: "Clean and careful. We will book her again." }, tags: ["Clean and careful", "On time"], service: { k: "Elder care dressing" }, patient: "Ramesh N.", at: now() - 15 * DAY, sample: true },
];

/** Everything added when verification is approved: sample history, and the first notifications. */
export function approvalPatch(s: CgState): Partial<CgState> {
  const account = s.bank?.account.slice(-4) ?? "0000";
  const payouts = s.payouts.length ? s.payouts : samplePayouts(account);
  const notices: CgNotice[] = [
    { id: "n-verified", kind: "verified", title: { k: "You are verified" }, body: { k: "Go online on the Jobs screen to start getting requests near you." }, at: now(), read: false, to: "jobs" },
    { id: "n-payout", kind: "payout", title: { k: "Payout sent" }, body: { k: "{amount} was sent to your account •••• {acc}.", v: { amount: `₹${payouts[0].amount.toLocaleString("en-IN")}`, acc: account } }, at: payouts[0].at, read: false, to: "payouts" },
    ...s.notices,
  ];
  return {
    kycStatus: "approved",
    rejected: null,
    earnings: s.earnings.length ? s.earnings : sampleEarnings(),
    payouts,
    reviews: s.reviews.length ? s.reviews : sampleReviews(),
    notices: s.notices.some((n) => n.id === "n-verified") ? s.notices : notices,
  };
}

export { sampleEarnings };

/** Lay the caregiver's account from the database over the phone's state. */
function mergeCaregiver(prev: CgState, acc: PulledCaregiver): CgState {
  if (!acc.exists) return { ...prev, cgExists: false, lang: acc.lang ?? prev.lang };
  const next: CgState = {
    ...prev,
    cgExists: true,
    lang: acc.lang,
    role: acc.role ?? prev.role,
    personal: acc.personal ?? prev.personal,
  };
  // The verification decision comes from the database once the team decides there (phase 4).
  if (acc.kycStatus === "approved" || acc.kycStatus === "rejected") {
    next.kycStatus = acc.kycStatus;
    next.tier = acc.tier;
    next.suspended = acc.suspended;
    next.rejected = acc.rejected;
  }
  return next;
}
