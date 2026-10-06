"use client";

// App state. Everything lives in memory for now: refreshing the page starts again.
// When the backend exists, replace `set` calls with API calls.

import { createContext, useContext, useState, type ReactNode } from "react";
import type { Booking, Draft, VisitRecord } from "./booking";

export type Screen =
  | "login" | "otp" | "home" | "service" | "schedule" | "caregivers" | "caregiver"
  | "review" | "tracking" | "done" | "bookings" | "records" | "profile";

export const TAB_SCREENS: Screen[] = ["home", "bookings", "records", "profile"];

export type AppState = Draft & {
  screen: Screen;
  phone: string;
  hasPrescription: boolean;
  pay: "upi" | "card" | "cash";
  booking: Booking | null;
  step: number; // 0 accepted, 1 on the way, 2 arrived, 3 care in progress
  history: VisitRecord[];
  notifyFamily: boolean; // send visit updates to the emergency contact
};

const initialState: AppState = {
  screen: "login",
  phone: "9876543210",
  patientId: "p2",
  serviceId: "inj",
  hasPrescription: false,
  dateIdx: 0,
  slot: null,
  repeat: false,
  count: 5,
  every: 1,
  sameNurse: true,
  caregiverId: "c1",
  cityId: "hyd",
  vitalIds: ["bp"],
  womenOnly: false,
  language: null,
  notifyFamily: false,
  pay: "upi",
  booking: null,
  step: 0,
  history: [],
};

type AppContextValue = {
  state: AppState;
  set: (patch: Partial<AppState>) => void;
  go: (screen: Screen) => void;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(initialState);
  const set = (patch: Partial<AppState>) => setState((prev) => ({ ...prev, ...patch }));
  const go = (screen: Screen) => set({ screen });
  return <AppContext.Provider value={{ state, set, go }}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}
