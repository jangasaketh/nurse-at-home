"use client";

// SETTINGS FROM THE SERVER (phase 6). The admin panel's Settings page (prices, services, charges, the
// cancellation rule, pay split, time limits, cities and areas) is saved to the database. The signed-in
// patient and caregiver apps read it when they open, and again every few minutes, so a change reaches
// every phone. The database itself already uses these numbers for bookings and earnings (004_bookings.sql).

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { applyServices, BUILT_IN_SERVICES, setPaymentsOn, setRules, VITAL_CHECKS, VITALS_SERVICE_ID, type ServiceSetting } from "./data";
import { setPaySettings } from "./caregiver/data";
import type { IconName } from "@/components/Icon";

export type CityRow = { id: string; name: string; state: string; language: string; open: boolean; areas: string[] };

export type ServerSettings = {
  services: ServiceSetting[];
  checks: Record<string, number>;
  visitFee: number;
  urgentFee: number;
  timed: boolean;
  graceMinutes: number;
  freeUntilHours: number;
  lateMinutes: number;
  noShowMinutes: number;
  caregiverShare: number;
  visitFeeShare: number;
  urgentShare: number;
  payoutDay: number;
  offerMinutes: number;
  offerMinutesUrgent: number;
  renewalWarnDays: number;
  cities: CityRow[];
  paymentsOn: boolean; // online payment switched on (Settings → Payments)
};

type Row = Record<string, unknown>;
const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v !== "" && Number.isFinite(Number(v)) ? Number(v) : d);

/** Read every setting from the database (anyone may read them, signed in or not). */
export async function pullSettings(client: SupabaseClient): Promise<ServerSettings> {
  const [settings, services, checks, cities, areas] = await Promise.all([
    client.from("settings").select("key, value"),
    client.from("services").select("*").order("sort"),
    client.from("vital_checks").select("id, price").order("sort"),
    client.from("cities").select("id, name, state, language, open, sort").order("sort"),
    client.from("city_areas").select("city_id, name").order("name"),
  ]);
  for (const r of [settings, services, checks, cities, areas]) if (r.error) throw r.error;
  const v = (key: string): Row => ((settings.data ?? []).find((r) => r.key === key)?.value as Row) ?? {};
  const charges = v("charges"), rule = v("cancel_rule"), pay = v("pay_split"), limits = v("time_limits"), payments = v("payments");
  return {
    services: (services.data ?? []).map((s) => {
      const base = BUILT_IN_SERVICES.find((b) => b.id === s.id);
      return {
        id: s.id, name: s.name, short: s.short ?? "", price: s.price, mins: s.mins ?? "30 minutes", nurseOnly: !!s.nurse_only,
        needsPrescription: !!s.needs_prescription, active: !!s.active, custom: !!s.custom || !base, icon: (s.icon ?? "heart") as IconName,
        nurseBrings: s.nurse_brings || base?.nurseBrings || "", youKeepReady: s.keep_ready || base?.youKeepReady || "",
        includes: (s.includes as string[])?.length ? (s.includes as string[]) : base?.includes ?? [],
      };
    }),
    checks: Object.fromEntries((checks.data ?? []).map((c) => [c.id, c.price])),
    visitFee: num(charges.visitFee, 49),
    urgentFee: num(charges.urgentFee, 100),
    timed: rule.timed === undefined ? true : rule.timed !== false,
    graceMinutes: num(rule.graceMinutes, 5),
    freeUntilHours: num(rule.freeUntilHours, 2),
    lateMinutes: num(rule.lateMinutes, 30),
    noShowMinutes: num(rule.noShowMinutes, 10),
    caregiverShare: num(pay.caregiverShare, 80),
    visitFeeShare: num(pay.visitFeeShare, 100),
    urgentShare: num(pay.urgentShare, 50),
    payoutDay: num(pay.payoutDay, 1),
    offerMinutes: num(limits.offerMinutes, 15),
    offerMinutesUrgent: num(limits.offerMinutesUrgent, 3),
    renewalWarnDays: num(limits.renewalWarnDays, 60),
    paymentsOn: payments.enabled === true,
    cities: (cities.data ?? []).map((c) => ({
      id: c.id, name: c.name, state: c.state, language: c.language, open: !!c.open,
      areas: (areas.data ?? []).filter((a) => a.city_id === c.id).map((a) => a.name as string),
    })),
  };
}

/** Use the settings in this app: prices and services, charges, the cancellation rule, pay split, time limits. */
export function applyServerSettings(st: ServerSettings) {
  applyServices(st.services, st.checks);
  setPaymentsOn(!!st.paymentsOn);
  setRules({ visitFee: st.visitFee, urgentFee: st.urgentFee, timed: st.timed, graceMinutes: st.graceMinutes, freeUntilHours: st.freeUntilHours, lateMinutes: st.lateMinutes, noShowMinutes: st.noShowMinutes });
  setPaySettings({ caregiverShare: st.caregiverShare, visitFeeShare: st.visitFeeShare, urgentShare: st.urgentShare, payoutDay: st.payoutDay, offerMinutes: st.offerMinutes, offerMinutesUrgent: st.offerMinutesUrgent, renewalWarnDays: st.renewalWarnDays });
}

const CACHE_KEY = "nurse-at-home-settings:v1";

/** The last settings read, so the app shows the right prices at once, even offline. */
export function cachedSettings(): ServerSettings | null {
  try { return JSON.parse(window.localStorage.getItem(CACHE_KEY) ?? "null"); } catch { return null; }
}
export function cacheSettings(st: ServerSettings) {
  try { window.localStorage.setItem(CACHE_KEY, JSON.stringify(st)); } catch { /* storage full or blocked */ }
}

/* ---------- Saving (admin panel, owners only: the database refuses anyone else) ---------- */

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Save what changed. `prev` is what was read from the server. */
export async function pushSettings(client: SupabaseClient, userId: string, prev: ServerSettings, next: ServerSettings) {
  const now = new Date().toISOString();
  const groups: [string, Row, Row][] = [
    ["charges", { visitFee: next.visitFee, urgentFee: next.urgentFee }, { visitFee: prev.visitFee, urgentFee: prev.urgentFee }],
    ["cancel_rule", { graceMinutes: next.graceMinutes, freeUntilHours: next.freeUntilHours, lateMinutes: next.lateMinutes, noShowMinutes: next.noShowMinutes, timed: next.timed },
      { graceMinutes: prev.graceMinutes, freeUntilHours: prev.freeUntilHours, lateMinutes: prev.lateMinutes, noShowMinutes: prev.noShowMinutes, timed: prev.timed }],
    ["pay_split", { caregiverShare: next.caregiverShare, visitFeeShare: next.visitFeeShare, urgentShare: next.urgentShare, payoutDay: next.payoutDay },
      { caregiverShare: prev.caregiverShare, visitFeeShare: prev.visitFeeShare, urgentShare: prev.urgentShare, payoutDay: prev.payoutDay }],
    ["time_limits", { offerMinutes: next.offerMinutes, offerMinutesUrgent: next.offerMinutesUrgent, renewalWarnDays: next.renewalWarnDays },
      { offerMinutes: prev.offerMinutes, offerMinutesUrgent: prev.offerMinutesUrgent, renewalWarnDays: prev.renewalWarnDays }],
    ["payments", { enabled: !!next.paymentsOn }, { enabled: !!prev.paymentsOn }],
  ];
  const settingRows = groups.filter(([, n, p]) => !same(n, p)).map(([key, value]) => ({ key, value, updated_at: now, updated_by: userId }));
  if (settingRows.length) {
    const { error } = await client.from("settings").upsert(settingRows);
    if (error) throw error;
  }

  // Services: changed or new ones are saved; a service removed in the panel is switched off (old bookings keep it).
  const minCheck = Math.min(...Object.values(next.checks).filter((n) => n > 0), 30);
  const svcRows = next.services.map((s, i) => ({ s, i })).filter(({ s }) => !same(s, prev.services.find((p) => p.id === s.id))).map(({ s, i }) => ({
    id: s.id, name: s.name, short: s.short, price: s.id === VITALS_SERVICE_ID ? minCheck : Math.max(1, Math.round(s.price)), mins: s.mins,
    nurse_only: s.nurseOnly, needs_prescription: s.needsPrescription, active: s.active, icon: s.icon, nurse_brings: s.nurseBrings,
    keep_ready: s.youKeepReady, includes: s.includes, custom: s.custom, sort: i + 1, updated_at: now,
  }));
  for (const gone of prev.services.filter((p) => !next.services.some((s) => s.id === p.id))) {
    svcRows.push({ ...{ id: gone.id, name: gone.name, short: gone.short, price: Math.max(1, gone.price), mins: gone.mins, nurse_only: gone.nurseOnly,
      needs_prescription: gone.needsPrescription, active: false, icon: gone.icon, nurse_brings: gone.nurseBrings, keep_ready: gone.youKeepReady, includes: gone.includes,
      custom: gone.custom, sort: 99, updated_at: now } });
  }
  if (svcRows.length) {
    const { error } = await client.from("services").upsert(svcRows);
    if (error) throw error;
  }

  const checkRows = VITAL_CHECKS.filter((c) => next.checks[c.id] !== prev.checks[c.id]).map((c, i) => ({ id: c.id, name: c.name, price: next.checks[c.id], sort: i + 1 }));
  for (const row of checkRows) {
    const { error } = await client.from("vital_checks").update({ price: row.price }).eq("id", row.id);
    if (error) throw error;
  }

  // Cities and their areas.
  const cityRows = next.cities.map((c, i) => ({ c, i })).filter(({ c }) => {
    const p = prev.cities.find((x) => x.id === c.id);
    return !p || p.name !== c.name || p.open !== c.open || p.state !== c.state || p.language !== c.language;
  }).map(({ c, i }) => ({ id: c.id, name: c.name, state: c.state, language: c.language, open: c.open, sort: i + 1 }));
  if (cityRows.length) {
    const { error } = await client.from("cities").upsert(cityRows);
    if (error) throw error;
  }
  for (const c of next.cities) {
    const before = prev.cities.find((x) => x.id === c.id)?.areas ?? [];
    const added = c.areas.filter((a) => !before.includes(a));
    const removed = before.filter((a) => !c.areas.includes(a));
    if (added.length) {
      const { error } = await client.from("city_areas").upsert(added.map((name) => ({ city_id: c.id, name })), { onConflict: "city_id,name" });
      if (error) throw error;
    }
    if (removed.length) {
      const { error } = await client.from("city_areas").delete().eq("city_id", c.id).in("name", removed);
      if (error) throw error;
    }
  }
}

/**
 * Patient and caregiver apps (live mode): use the server's settings. The last ones read are used at once,
 * then fresh ones are read now and every 5 minutes. Returns a number that changes when settings change,
 * so the app draws again with the new prices and rules.
 */
export function useServerSettings(client: () => SupabaseClient, live: boolean) {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!live) return;
    const cached = cachedSettings();
    if (cached) { applyServerSettings(cached); setVersion((v) => v + 1); }
    let gone = false;
    const read = async () => {
      try {
        const st = await pullSettings(client());
        if (gone) return;
        if (JSON.stringify(st) !== JSON.stringify(cachedSettings())) { applyServerSettings(st); cacheSettings(st); setVersion((v) => v + 1); }
        else if (!cached) { applyServerSettings(st); setVersion((v) => v + 1); }
      } catch { /* offline: keep what we have */ }
    };
    void read();
    const id = setInterval(() => { if (document.visibilityState !== "hidden") void read(); }, 5 * 60000);
    return () => { gone = true; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);
  return version;
}
