"use client";

// App state. It is kept in the browser (localStorage), so it survives a refresh on the same device.
// When the backend exists, replace the load/save here and the `set` calls with API calls.

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { setLang, type Lang } from "./i18n";
import type { Prescription } from "./prescription";
import { pullAccount, pushAccount, type AccountSnapshot } from "./patient-sync";
import { db } from "./supabase";
import { SELF, newId, type Booking, type Contact, type Draft, type Msg, type Notice, type PayMethod, type VisitRecord } from "./booking";

export type Screen =
  | "login" | "otp" | "setup" | "legal"
  | "home" | "service" | "schedule" | "caregivers" | "caregiver" | "review"
  | "tracking" | "done" | "cancel" | "reschedule"
  | "bookings" | "records" | "profile"
  | "family" | "addresses" | "address" | "contact"
  | "notifications" | "help";

export const TAB_SCREENS: Screen[] = ["home", "bookings", "records", "profile"];

export type AppState = Draft & {
  lang: Lang; // English, Telugu or Kannada
  screen: Screen;
  trail: Screen[]; // screens to return to when Back is pressed on a pushed screen
  phone: string;
  profileDone: boolean; // name and consent given on first login
  nameDraft: string;
  consent: { terms: boolean; health: boolean; updates: boolean };
  contact: Contact | null; // emergency / family contact
  editingId: string | null; // family member or address being edited (null = adding a new one)
  legalDoc: "terms" | "privacy";
  prescription: Prescription | null; // for the booking being made
  installDismissed: boolean; // "Not now" on the Install the app card on Home
  pay: PayMethod;
  booking: Booking | null;
  step: number; // 0 accepted, 1 on the way, 2 arrived, 3 care in progress
  history: VisitRecord[];
  notifyFamily: boolean;
  notifications: Notice[];
  arrears: number; // unpaid home visit charge from a cash booking, added to the next booking
  caregiverLate: boolean; // prototype tool: the caregiver is running more than 30 minutes late
  simulateFailure: boolean; // prototype tool: makes loads and actions fail, to show the error screens
  mode: "live" | "demo"; // live = real sign-in, saved to the account; demo = sample data, any code works
  userId: string | null; // the signed-in account (live mode)
  remoteIds: Record<string, string>; // local id of a family member or address -> its id in the database
  syncError: boolean; // the last save to the account failed (tried again on the next change)
};

const initialState: AppState = {
  lang: "en",
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
  prescription: null,
  installDismissed: false,
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
  arrears: 0,
  caregiverLate: false,
  simulateFailure: false,
  mode: "live",
  userId: null,
  remoteIds: {},
  syncError: false,
};

const STORAGE_KEY = "nurse-at-home:v3";

type AppContextValue = {
  state: AppState;
  ready: boolean; // false until saved data has been read
  set: (patch: Partial<AppState>) => void;
  /** Go to a screen and forget the Back trail. Use for the main flow. */
  go: (screen: Screen) => void;
  /** Open a screen on top of the current one, so Back returns here. */
  open: (screen: Screen, patch?: Partial<AppState>) => void;
  back: (patch?: Partial<AppState>) => void;
  notify: (title: Msg, body: Msg) => void;
  reset: () => void;
  /** After a real sign-in: load the account from the database and continue to the right screen. */
  signedIn: (userId: string) => Promise<void>;
  /** Sign out of the account (live) and clear this phone. */
  signOut: () => Promise<void>;
};

/** What is saved to the account, taken from the app state. */
const snapshotOf = (s: AppState): AccountSnapshot => ({
  name: s.patients.find((p) => p.relation === SELF)?.name ?? s.nameDraft.trim(),
  lang: s.lang,
  consented: s.profileDone,
  patients: s.patients,
  addresses: s.addresses,
  contact: s.contact,
});

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(initialState);
  const [ready, setReady] = useState(false);

  // Every t("...") call reads this. Set during render, so all screens draw in the chosen language.
  setLang(state.lang);
  useEffect(() => { document.documentElement.lang = state.lang; }, [state.lang]);

  // Read saved data once, after the page loads.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<AppState>;
        // Saved before 1.1.0 (no sign-in yet): that was the demo.
        const mode = parsed.mode ?? (parsed.profileDone ? "demo" : "live");
        setState({ ...initialState, ...parsed, mode, simulateFailure: false, syncError: false });
      }
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

  // Live mode: when the app opens with a saved sign-in, refresh the account from the database
  // (so changes made on another phone show here). If the sign-in has ended, go back to the login screen.
  const lastPushed = useRef<AccountSnapshot | null>(null);
  const idsRef = useRef<Record<string, string>>({});
  const [synced, setSynced] = useState(false);
  useEffect(() => {
    if (!ready || state.mode !== "live" || !state.userId || synced) return;
    let cancelled = false;
    (async () => {
      const { data } = await db("patient").auth.getSession();
      if (cancelled) return;
      if (!data.session || data.session.user.id !== state.userId) {
        setState((prev) => ({ ...initialState, lang: prev.lang }));
        return;
      }
      try {
        const acc = await pullAccount(state.userId!);
        if (cancelled) return;
        idsRef.current = { ...state.remoteIds, ...acc.remoteIds };
        setState((prev) => mergePulled(prev, acc));
        lastPushed.current = { name: acc.name, lang: acc.lang, consented: acc.consented, patients: acc.patients, addresses: acc.addresses, contact: acc.contact };
      } catch {
        // Offline: keep what is on the phone; changes are saved when the connection is back.
        lastPushed.current = snapshotOf(state);
      }
      setSynced(true);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, state.mode, state.userId, synced]);

  // Live mode: save changes to the account (family, addresses, emergency contact, name, language, consent).
  const snap = snapshotOf(state);
  const snapKey = JSON.stringify(snap);
  useEffect(() => {
    if (!ready || state.mode !== "live" || !state.userId || !synced || !state.profileDone) return;
    if (lastPushed.current && JSON.stringify(lastPushed.current) === snapKey) return;
    const next = snap;
    const prevSnap = lastPushed.current;
    // Give new family members and addresses their database ids now, so two quick saves cannot create two rows.
    const ids = { ...state.remoteIds, ...idsRef.current };
    for (const x of [...next.patients, ...next.addresses]) ids[x.id] ??= crypto.randomUUID();
    idsRef.current = ids;
    lastPushed.current = next;
    pushAccount(state.userId, prevSnap, next, ids)
      .then((remoteIds) => {
        setState((prev) => ({ ...prev, remoteIds: { ...prev.remoteIds, ...remoteIds }, syncError: false }));
      })
      .catch(() => {
        // Try again with the next change, from the last snapshot that was saved.
        lastPushed.current = prevSnap;
        setState((prev) => ({ ...prev, syncError: true }));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapKey, ready, state.mode, state.userId, synced, state.profileDone]);

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
  const notify = (title: Msg, body: Msg) =>
    setState((prev) => ({
      ...prev,
      notifications: [{ id: newId("n"), title, body, at: Date.now(), read: false }, ...prev.notifications].slice(0, 50),
    }));
  // Keep the chosen language when erasing everything else.
  const reset = () => {
    if (state.mode === "live") void db("patient").auth.signOut();
    lastPushed.current = null;
    idsRef.current = {};
    setSynced(false);
    setState((prev) => ({ ...initialState, lang: prev.lang }));
  };

  const signedIn = async (userId: string) => {
    const acc = await pullAccount(userId);
    idsRef.current = { ...acc.remoteIds };
    lastPushed.current = acc.hasProfile ? { name: acc.name, lang: acc.lang, consented: acc.consented, patients: acc.patients, addresses: acc.addresses, contact: acc.contact } : null;
    setSynced(true);
    setState((prev) => {
      const merged = mergePulled({ ...prev, mode: "live", userId, remoteIds: {} }, acc);
      // First sign-in on this account: ask for the name and consent. Otherwise straight to Home.
      return acc.hasProfile
        ? { ...merged, profileDone: true, screen: merged.addresses.length ? "home" : "address", trail: merged.addresses.length ? [] : ["home"], editingId: null }
        : { ...merged, profileDone: false, nameDraft: "", screen: "setup", trail: [] };
    });
  };

  const signOut = async () => {
    if (state.mode === "live") await db("patient").auth.signOut().catch(() => {});
    lastPushed.current = null;
    idsRef.current = {};
    setSynced(false);
    setState((prev) => ({ ...initialState, lang: prev.lang }));
  };

  return <AppContext.Provider value={{ state, ready, set, go, open, back, notify, reset, signedIn, signOut }}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}

/** Lay the account read from the database over the app state (the database wins for these fields). */
function mergePulled(prev: AppState, acc: Awaited<ReturnType<typeof pullAccount>>): AppState {
  if (!acc.hasProfile) return { ...prev, remoteIds: { ...prev.remoteIds, ...acc.remoteIds } };
  const patients = acc.patients.length ? acc.patients : [{ id: "me", name: acc.name, relation: SELF, age: null, gender: "" as const }];
  return {
    ...prev,
    lang: acc.lang,
    nameDraft: acc.name,
    profileDone: true,
    consent: { terms: true, health: true, updates: false },
    patients,
    addresses: acc.addresses,
    contact: acc.contact,
    patientId: patients.some((p) => p.id === prev.patientId) ? prev.patientId : "me",
    addressId: acc.addresses.some((a) => a.id === prev.addressId) ? prev.addressId : acc.addresses[0]?.id ?? null,
    remoteIds: { ...prev.remoteIds, ...acc.remoteIds },
  };
}
