"use client";

// ADMIN PANEL STATE. The admin's decisions are saved in this browser under their own key; the sample data
// (lib/admin/data.ts) is rebuilt each time and the decisions are laid on top of it.
// The caregiver in the caregiver app (same browser) is read live and changed through lib/admin/link.ts.
// When the backend exists, replace the load/save here and the actions with API calls.

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ADMIN_STORAGE_KEY, applyPrices } from "@/lib/data";
import { CG_STORAGE_KEY, type CgState, type KycStep } from "@/lib/caregiver/store";
import {
  DEFAULT_SETTINGS, mondayOf, sampleApplicants, sampleBookings, sampleMembers, sampleRefunds, sampleRenewals, sampleTickets, weekKey,
  type AdminBooking, type AdminPage, type AdminTicket, type Applicant, type BookingStatus, type Member, type RefundRequest, type Renewal,
  type Settings, type Tier,
} from "./data";
import * as link from "./link";

export type Decision = { status: "approved" | "sent-back"; tier?: Tier; step?: KycStep; reason?: string; at: number };
export type MemberEdit = { suspended?: { reason: string; at: number } | null; tier?: Tier; validUntil?: string };
export type RenewalDecision = { status: "approved" | "rejected"; reason?: string; at: number };
export type BookingEdit = { status?: BookingStatus; caregiverId?: string; note?: string; at: number };
export type RefundDecision = { status: "approved" | "declined"; amount: number; note: string; at: number };
export type TicketState = { status: "open" | "resolved"; replies: { text: string; at: number }[] };
export type PaidRow = { reference: string; at: number; amount: number };
export type Activity = { id: string; at: number; text: string; page: AdminPage };

export type AdminState = {
  signedIn: boolean;
  adminName: string;
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
};

const initialState: AdminState = {
  signedIn: false,
  adminName: "",
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
};

/* ---------- Everything the screens show: sample data with the decisions applied ---------- */

export type ApplicantRow = Applicant & { decision: Decision | null };
export type MemberRow = Member & { suspended: { reason: string; at: number } | null };
export type RenewalRow = Renewal & { member: MemberRow | null; decision: RenewalDecision | null };
export type RefundRow = RefundRequest & { booking: AdminBooking | null; decision: RefundDecision | null };
export type TicketRow = AdminTicket & { status: "open" | "resolved"; replies: { text: string; at: number }[] };

function useView(state: AdminState, cg: CgState | null, nowMs: number) {
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

    return { live, applicants, members, memberById, renewals, bookings, bookingById, refunds, tickets };
  }, [state.applicantDecisions, state.memberEdits, state.renewalDecisions, state.bookingEdits, state.extraRefunds, state.refundDecisions, state.tickets, cg, nowMs]);
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
  /** Re-read the caregiver app after writing to it. */
  refreshCg: () => void;
  resetDemo: () => void;
};

const AdminContext = createContext<Ctx | null>(null);

export function AdminProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AdminState>(initialState);
  const [ready, setReady] = useState(false);
  const [cg, setCg] = useState<CgState | null>(null);
  const [nowMs] = useState(() => Date.now());

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(ADMIN_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<AdminState>;
        setState({ ...initialState, ...parsed, settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) } });
      }
    } catch {
      // Storage blocked or unreadable: start fresh.
    }
    setCg(link.readCg());
    setReady(true);
    // The caregiver app saves in another tab: show its changes at once.
    const onStorage = (e: StorageEvent) => { if (e.key === CG_STORAGE_KEY) setCg(link.readCg()); };
    const onFocus = () => setCg(link.readCg());
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
    applyPrices(state.settings.prices, state.settings.checks);
  }, [state, ready]);

  const view = useView(state, cg, nowMs);

  const set = (patch: Partial<AdminState>) => setState((prev) => ({ ...prev, ...patch }));
  const update = (fn: (prev: AdminState) => Partial<AdminState>) => setState((prev) => ({ ...prev, ...fn(prev) }));
  const go = (page: AdminPage) => set({ page });
  const log = (text: string, page: AdminPage) =>
    setState((prev) => ({ ...prev, activity: [{ id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, at: Date.now(), text, page }, ...prev.activity].slice(0, 300) }));
  const refreshCg = () => setCg(link.readCg());
  const resetDemo = () => setState((prev) => ({ ...initialState, signedIn: prev.signedIn, adminName: prev.adminName, page: prev.page }));

  return (
    <AdminContext.Provider value={{ state, ready, nowMs, cg, view, set, update, go, log, refreshCg, resetDemo }}>
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
