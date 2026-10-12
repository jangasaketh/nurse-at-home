"use client";

// ADMIN PANEL STATE. The admin's decisions are saved in this browser under their own key; the sample data
// (lib/admin/data.ts) is rebuilt each time and the decisions are laid on top of it.
// The caregiver in the caregiver app (same browser) is read live and changed through lib/admin/link.ts.
// When the backend exists, replace the load/save here and the actions with API calls.

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ADMIN_STORAGE_KEY, applyServices, servicesFromPrices } from "@/lib/data";
import { CG_STORAGE_KEY, type CgState, type KycStep } from "@/lib/caregiver/store";
import {
  DEFAULT_SETTINGS, mondayOf, setCityNames, sampleAccounts, sampleApplicants, sampleBookings, sampleHistory, sampleMembers, sampleRefunds, sampleRenewals, sampleTeam,
  sampleTickets, weekKey,
  type AdminBooking, type AdminPage, type AdminRole, type AdminTicket, type Applicant, type BookingStatus, type HistoryEvent, type HistoryKind, type Member,
  type PatientAccount, type RefundRequest, type Renewal, type Settings, type TeamMember, type Tier,
} from "./data";
import * as link from "./link";
import { PATIENT_STORAGE_KEY, readPatient, type LivePatient } from "./patient-link";

export type Decision = { status: "approved" | "sent-back"; tier?: Tier; step?: KycStep; reason?: string; at: number };
export type MemberEdit = { suspended?: { reason: string; at: number } | null; tier?: Tier; validUntil?: string };
export type RenewalDecision = { status: "approved" | "rejected"; reason?: string; at: number };
export type BookingEdit = { status?: BookingStatus; caregiverId?: string; note?: string; at: number };
export type RefundDecision = { status: "approved" | "declined"; amount: number; note: string; at: number };
export type TicketState = { status: "open" | "resolved"; replies: { text: string; at: number }[] };
export type PaidRow = { reference: string; at: number; amount: number };
export type Activity = { id: string; at: number; text: string; page: AdminPage; by?: string };
export type Broadcast = { id: string; at: number; title: string; body: string; cityId: string; role: "all" | "nurse" | "compounder"; onlineOnly: boolean; recipients: number; by: string };

export type AdminState = {
  signedIn: boolean;
  adminName: string;
  adminEmail: string;
  role: AdminRole; // the signed-in team member's role (decides which pages they see)
  team: TeamMember[];
  page: AdminPage;
  applicantDecisions: Record<string, Decision>;
  memberEdits: Record<string, MemberEdit>;
  renewalDecisions: Record<string, RenewalDecision>;
  reminders: Record<string, number>; // member id -> when a renewal reminder was sent
  bookingEdits: Record<string, BookingEdit>;
  extraRefunds: RefundRequest[]; // refunds started by the admin from a booking
  refundDecisions: Record<string, RefundDecision>;
  tickets: Record<string, TicketState>;
  paid: Record<string, Record<string, PaidRow>>; // week (Monday date) -> member id -> payout
  cashReceived: Record<string, Record<string, { at: number; amount: number }>>;
  settings: Settings;
  activity: Activity[];
  history: Record<string, HistoryEvent[]>; // caregiver (or applicant) id -> events recorded in this panel
  broadcasts: Broadcast[]; // messages sent to caregivers
};

const initialState: AdminState = {
  signedIn: false,
  adminName: "",
  adminEmail: "",
  role: "owner",
  team: sampleTeam(),
  page: "dashboard",
  applicantDecisions: {},
  memberEdits: {},
  renewalDecisions: {},
  reminders: {},
  bookingEdits: {},
  extraRefunds: [],
  refundDecisions: {},
  tickets: {},
  paid: {},
  cashReceived: {},
  settings: DEFAULT_SETTINGS,
  activity: [],
  history: {},
  broadcasts: [],
};

/* ---------- Everything the screens show: sample data with the decisions applied ---------- */

export type ApplicantRow = Applicant & { decision: Decision | null };
export type MemberRow = Member & { suspended: { reason: string; at: number } | null };
export type RenewalRow = Renewal & { member: MemberRow | null; decision: RenewalDecision | null };
export type RefundRow = RefundRequest & { booking: AdminBooking | null; decision: RefundDecision | null };
export type TicketRow = AdminTicket & { status: "open" | "resolved"; replies: { text: string; at: number }[] };

function useView(state: AdminState, cg: CgState | null, patient: LivePatient | null, nowMs: number) {
  return useMemo(() => {
    const live = { applicant: link.liveApplicant(cg), member: link.liveMember(cg), renewal: link.liveRenewal(cg), tickets: link.liveTickets(cg), week: link.liveWeek(cg) };

    const applicants: ApplicantRow[] = [
      ...(live.applicant ? [{ ...live.applicant, resubmitted: state.applicantDecisions.live?.status === "sent-back", decision: null }] : []),
      ...sampleApplicants(nowMs).map((a) => ({ ...a, decision: state.applicantDecisions[a.id] ?? null })),
    ];

    const fromApproved: Member[] = applicants
      .filter((a) => !a.live && a.decision?.status === "approved")
      .map((a) => ({
        id: a.id, name: a.name, role: a.role, tier: a.role === "compounder" ? "basic" : a.decision?.tier ?? "full", gender: a.gender, cityId: a.cityId, area: a.area, phone: a.phone,
        joinedAt: a.decision?.at ?? nowMs, rating: 0, ratings: 0, visits: 0, cancels30: 0, complaints: 0, course: a.course, council: a.council, regNo: a.regNo,
        validUntil: a.validUntil, online: false, bankLast4: a.bank.account.slice(-4),
      }));
    const baseMembers = sampleMembers(nowMs);
    const members: MemberRow[] = [
      ...(live.member ? [{ ...live.member, suspended: cg?.suspended ?? null }] : []),
      ...[...baseMembers, ...fromApproved].map((m) => {
        const e = state.memberEdits[m.id] ?? {};
        return { ...m, tier: e.tier ?? m.tier, validUntil: e.validUntil ?? m.validUntil, suspended: e.suspended ?? null, online: e.suspended ? false : m.online };
      }),
    ];
    const memberById = (id: string) => members.find((m) => m.id === id) ?? null;

    const renewals: RenewalRow[] = [
      ...(live.renewal ? [live.renewal] : []),
      ...sampleRenewals(baseMembers, nowMs),
    ].map((r) => ({ ...r, member: memberById(r.memberId), decision: r.live ? null : state.renewalDecisions[r.id] ?? null }));

    const bookings: AdminBooking[] = sampleBookings(baseMembers, nowMs).map((b) => {
      const e = state.bookingEdits[b.id];
      return e ? { ...b, status: e.status ?? b.status, caregiverId: e.caregiverId ?? b.caregiverId } : b;
    });
    const bookingById = (id: string | null) => (id ? bookings.find((b) => b.id === id) ?? null : null);

    const refunds: RefundRow[] = [...state.extraRefunds, ...sampleRefunds(bookings, nowMs)].map((r) => ({
      ...r, booking: bookingById(r.bookingId), decision: state.refundDecisions[r.id] ?? null,
    }));

    const tickets: TicketRow[] = [
      ...live.tickets.map((tk) => {
        const own = state.tickets[tk.id];
        return { ...tk, status: tk.cgStatus, replies: own?.replies ?? (tk.cgReply ? [{ text: tk.cgReply, at: tk.at }] : []) };
      }),
      ...sampleTickets(bookings, nowMs).map((tk) => ({ ...tk, status: state.tickets[tk.id]?.status ?? ("open" as const), replies: state.tickets[tk.id]?.replies ?? [] })),
    ].sort((a, b) => b.at - a.at);

    const accounts: PatientAccount[] = [...(patient ? [patient.account] : []), ...sampleAccounts(nowMs)];

    /** Everything that happened to a caregiver: sample past events, what was done in this panel, and (live) what the app shows. */
    const historyOf = (id: string): HistoryEvent[] => {
      const m = memberById(id);
      const own = state.history[id] ?? [];
      const base = m && baseMembers.some((x) => x.id === id) ? sampleHistory(m, nowMs) : [];
      const fromApp: HistoryEvent[] = [];
      if (id === "live" && cg) {
        const sent = [cg.idProof?.photo?.addedAt, cg.selfie?.addedAt, cg.qualification?.certificate?.addedAt].filter((x): x is number => typeof x === "number");
        if (sent.length) fromApp.push({ at: Math.min(...sent), kind: "documents", text: "ID, selfie, qualification and bank account (caregiver app)" });
        if (cg.renewal) fromApp.push({ at: cg.renewal.at, kind: "renewal-sent", text: "Renewed registration certificate (caregiver app)" });
      }
      const applicant = applicants.find((a) => a.id === id && !a.live);
      if (applicant && !base.length) fromApp.push({ at: applicant.submittedAt, kind: "documents", text: "ID, selfie, qualification and bank account" });
      return [...base, ...fromApp, ...own].sort((a, b) => b.at - a.at);
    };

    return { live, applicants, members, memberById, renewals, bookings, bookingById, refunds, tickets, accounts, patient, historyOf };
  }, [state.applicantDecisions, state.memberEdits, state.renewalDecisions, state.bookingEdits, state.extraRefunds, state.refundDecisions, state.tickets, state.history, cg, patient, nowMs]);
}

export type AdminView = ReturnType<typeof useView>;

/* ---------- Context ---------- */

type Ctx = {
  state: AdminState;
  ready: boolean;
  nowMs: number;
  cg: CgState | null;
  view: AdminView;
  set: (patch: Partial<AdminState>) => void;
  update: (fn: (prev: AdminState) => Partial<AdminState>) => void;
  go: (page: AdminPage) => void;
  log: (text: string, page: AdminPage) => void;
  /** Record an event in a caregiver's history. */
  addHistory: (id: string, kind: HistoryKind, text: string) => void;
  /** Re-read the caregiver app after writing to it. */
  refreshCg: () => void;
  resetDemo: () => void;
};

const AdminContext = createContext<Ctx | null>(null);

export function AdminProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AdminState>(initialState);
  const [ready, setReady] = useState(false);
  const [cg, setCg] = useState<CgState | null>(null);
  const [patient, setPatient] = useState<LivePatient | null>(null);
  const [nowMs] = useState(() => Date.now());

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(ADMIN_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<AdminState>;
        const st = { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) };
        // Settings saved by 1.0.6 and 1.0.7 had prices only and cities without areas.
        if (!parsed.settings?.services) st.services = servicesFromPrices(parsed.settings?.prices);
        delete st.prices;
        st.cities = st.cities.map((c) => ({ ...c, areas: c.areas ?? DEFAULT_SETTINGS.cities.find((d) => d.id === c.id)?.areas ?? [] }));
        setState({ ...initialState, ...parsed, team: parsed.team?.length ? parsed.team : initialState.team, settings: st });
      }
    } catch {
      // Storage blocked or unreadable: start fresh.
    }
    setCg(link.readCg());
    setPatient(readPatient());
    setReady(true);
    // The caregiver and patient apps save in other tabs: show their changes at once.
    const onStorage = (e: StorageEvent) => {
      if (e.key === CG_STORAGE_KEY) setCg(link.readCg());
      if (e.key === PATIENT_STORAGE_KEY) setPatient(readPatient());
    };
    const onFocus = () => { setCg(link.readCg()); setPatient(readPatient()); };
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);
    return () => { window.removeEventListener("storage", onStorage); window.removeEventListener("focus", onFocus); };
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage full or blocked: decisions last until the page is closed.
    }
  }, [state, ready]);

  // Keep the shared services list and city names in step with the saved settings (idempotent, so safe during render).
  if (ready) {
    applyServices(state.settings.services, state.settings.checks);
    setCityNames(state.settings.cities);
  }

  const view = useView(state, cg, patient, nowMs);

  const set = (patch: Partial<AdminState>) => setState((prev) => ({ ...prev, ...patch }));
  const update = (fn: (prev: AdminState) => Partial<AdminState>) => setState((prev) => ({ ...prev, ...fn(prev) }));
  const go = (page: AdminPage) => set({ page });
  const log = (text: string, page: AdminPage) =>
    setState((prev) => ({ ...prev, activity: [{ id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, at: Date.now(), text, page, by: prev.adminName }, ...prev.activity].slice(0, 300) }));
  const addHistory = (id: string, kind: HistoryKind, text: string) =>
    setState((prev) => ({ ...prev, history: { ...prev.history, [id]: [...(prev.history[id] ?? []), { at: Date.now(), kind, text, by: prev.adminName }] } }));
  const refreshCg = () => setCg(link.readCg());
  const resetDemo = () => setState((prev) => ({ ...initialState, signedIn: prev.signedIn, adminName: prev.adminName, adminEmail: prev.adminEmail, role: prev.role, page: prev.page }));

  return (
    <AdminContext.Provider value={{ state, ready, nowMs, cg, view, set, update, go, log, addHistory, refreshCg, resetDemo }}>
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin must be used inside AdminProvider");
  return ctx;
}

export const currentWeekKey = (nowMs: number) => weekKey(mondayOf(nowMs));
