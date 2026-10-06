"use client";

// App state. It is kept in the browser (localStorage), so it survives a refresh on the same device.
// When the backend exists, replace the load/save here and the `set` calls with API calls.

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { newId, type Booking, type Contact, type Draft, type Notice, type PayMethod, type VisitRecord } from "./booking";

export type Screen =
  | "login" | "otp" | "setup" | "legal"
  | "home" | "service" | "schedule" | "caregivers" | "caregiver" | "review"
  | "tracking" | "done" | "cancel" | "reschedule"
  | "bookings" | "records" | "profile"
  | "family" | "addresses" | "address" | "contact"
  | "notifications" | "help";

export const TAB_SCREENS: Screen[] = ["home", "bookings", "records", "profile"];

export type AppState = Draft & {
  screen: Screen;
  trail: Screen[]; // screens to return to when Back is pressed on a pushed screen
  phone: string;
  profileDone: boolean; // name and consent given on first login
  nameDraft: string;
  consent: { terms: boolean; health: boolean; updates: boolean };
  contact: Contact | null; // emergency / family contact
  editingId: string | null; // family member or address being edited (null = adding a new one)
  legalDoc: "terms" | "privacy";
  hasPrescription: boolean;
  pay: PayMethod;
  booking: Booking | null;
  step: number; // 0 accepted, 1 on the way, 2 arrived, 3 care in progress
  history: VisitRecord[];
  notifyFamily: boolean;
  notifications: Notice[];
  simulateFailure: boolean; // prototype tool: makes loads and actions fail, to show the error screens
};

const initialState: AppState = {
  screen: "login",
  trail: [],
  phone: "9876543210",
  profileDone: false,
  nameDraft: "",
  consent: { terms: false, health: false, updates: false },
  patients: [],
  addresses: [],
  contact: null,
  editingId: null,
  legalDoc: "terms",
  patientId: "me",
  addressId: null,
  serviceId: "inj",
  hasPrescription: false,
  dateIdx: 0,
  slot: null,
  repeat: false,
  count: 5,
  every: 1,
  sameNurse: true,
  caregiverId: "c1",
  vitalIds: ["bp"],
  womenOnly: false,
  language: null,
  notifyFamily: false,
  pay: "upi",
  booking: null,
  step: 0,
  history: [],
  notifications: [],
  simulateFailure: false,
};

const STORAGE_KEY = "nurse-at-home:v2";

type AppContextValue = {
  state: AppState;
  ready: boolean; // false until saved data has been read
  set: (patch: Partial<AppState>) => void;
  /** Go to a screen and forget the Back trail. Use for the main flow. */
  go: (screen: Screen) => void;
  /** Open a screen on top of the current one, so Back returns here. */
  open: (screen: Screen, patch?: Partial<AppState>) => void;
  back: (patch?: Partial<AppState>) => void;
  notify: (title: string, body: string) => void;
  reset: () => void;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(initialState);
  const [ready, setReady] = useState(false);

  // Read saved data once, after the page loads.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setState({ ...initialState, ...JSON.parse(saved), simulateFailure: false });
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

  const set = (patch: Partial<AppState>) => setState((prev) => ({ ...prev, ...patch }));
  const go = (screen: Screen) => set({ screen, trail: [] });
  const open = (screen: Screen, patch: Partial<AppState> = {}) =>
    setState((prev) => ({ ...prev, ...patch, screen, trail: [...prev.trail, prev.screen] }));
  const back = (patch: Partial<AppState> = {}) =>
    setState((prev) => ({
      ...prev,
      ...patch,
      screen: prev.trail[prev.trail.length - 1] ?? "home",
      trail: prev.trail.slice(0, -1),
    }));
  const notify = (title: string, body: string) =>
    setState((prev) => ({
      ...prev,
      notifications: [{ id: newId("n"), title, body, at: Date.now(), read: false }, ...prev.notifications].slice(0, 50),
    }));
  const reset = () => setState(initialState);

  return <AppContext.Provider value={{ state, ready, set, go, open, back, notify, reset }}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}
