"use client";

// CAREGIVER APP STATE. Saved in the browser under its own key, separate from the patient app.
// When the backend exists, replace the load/save here and the `set` calls with API calls.

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { setLang, type Lang } from "@/lib/i18n";
import type { Msg } from "@/lib/booking";
import type { PhotoFile } from "@/lib/prescription";
import { sampleJobs, type IdType, type Job, type Role } from "./data";

export type CgScreen =
  | "login" | "otp" | "role"
  | "kyc" | "kyc-personal" | "kyc-id" | "kyc-selfie" | "kyc-qualification" | "kyc-bank" | "review"
  | "jobs" | "job" | "visit" | "record" | "visit-done" | "cancel-visit"
  | "schedule" | "availability" | "earnings" | "profile" | "help" | "legal";

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
};

const STORAGE_KEY = "nurse-at-home-caregiver:v1";

type Ctx = {
  state: CgState;
  ready: boolean;
  set: (patch: Partial<CgState>) => void;
  update: (fn: (prev: CgState) => Partial<CgState>) => void;
  go: (screen: CgScreen) => void;
  open: (screen: CgScreen, patch?: Partial<CgState>) => void;
  back: (patch?: Partial<CgState>) => void;
  reset: () => void;
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
      if (saved) setState({ ...initialState, ...JSON.parse(saved) });
    } catch {
      // Storage blocked or unreadable: start fresh.
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage full or blocked: the app still works for this visit.
    }
  }, [state, ready]);

  const set = (patch: Partial<CgState>) => setState((prev) => ({ ...prev, ...patch }));
  const update = (fn: (prev: CgState) => Partial<CgState>) => setState((prev) => ({ ...prev, ...fn(prev) }));
  const go = (screen: CgScreen) => set({ screen, trail: [] });
  const open = (screen: CgScreen, patch: Partial<CgState> = {}) =>
    setState((prev) => ({ ...prev, ...patch, screen, trail: [...prev.trail, prev.screen] }));
  const back = (patch: Partial<CgState> = {}) =>
    setState((prev) => ({ ...prev, ...patch, screen: prev.trail[prev.trail.length - 1] ?? "jobs", trail: prev.trail.slice(0, -1) }));
  const reset = () => setState((prev) => ({ ...initialState, lang: prev.lang }));

  const jobs = sampleJobs(state.personal?.cityId ?? "hyd");
  const jobById = (id: string | null) => (id ? state.upcoming.find((j) => j.id === id) ?? jobs.find((j) => j.id === id) ?? null : null);

  return (
    <CgContext.Provider value={{ state, ready, set, update, go, open, back, reset, jobs, jobById }}>
      {children}
    </CgContext.Provider>
  );
}

export function useCg() {
  const ctx = useContext(CgContext);
  if (!ctx) throw new Error("useCg must be used inside CaregiverProvider");
  return ctx;
}

export { sampleEarnings };
