"use client";

// PATIENT APP ↔ DATABASE (phase 2): the signed-in patient's name, consent, language, family members,
// addresses and emergency contact are saved to their account, so they appear on any phone they sign in on.
// Bookings, visits and records still live on the phone until phase 5.

import { db } from "./supabase";
import { SELF, type Address, type Contact, type Patient } from "./booking";
import type { Lang } from "./i18n";

export type AccountSnapshot = {
  name: string;
  lang: Lang;
  consented: boolean;
  patients: Patient[];
  addresses: Address[];
  contact: Contact | null;
};

export type PulledAccount = AccountSnapshot & { remoteIds: Record<string, string>; hasProfile: boolean };

const uuid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(16)}-0000-4000-8000-${Math.random().toString(16).slice(2, 14).padEnd(12, "0")}`);
const toDbRelation = (r: string) => (r === SELF ? "Self" : r);
const fromDbRelation = (r: string) => (r === "Self" ? SELF : r);
const LANGS: Lang[] = ["en", "te", "kn"];

/** Read the account from the database after sign-in. */
export async function pullAccount(userId: string): Promise<PulledAccount> {
  const client = db("patient");
  const [profile, people, places, contact] = await Promise.all([
    client.from("profiles").select("full_name, lang, consent_at").eq("id", userId).maybeSingle(),
    client.from("patient_people").select("id, name, relation, age, gender, created_at").eq("account_id", userId).order("created_at"),
    client.from("addresses").select("id, label, line, area, city_id, pincode, landmark, created_at").eq("account_id", userId).order("created_at"),
    client.from("emergency_contacts").select("name, relation, phone").eq("account_id", userId).maybeSingle(),
  ]);
  for (const r of [profile, people, places, contact]) if (r.error) throw r.error;

  const remoteIds: Record<string, string> = {};
  const patients: Patient[] = (people.data ?? []).map((p) => {
    const self = p.relation === "Self";
    const local = self ? "me" : p.id;
    remoteIds[local] = p.id;
    return { id: local, name: p.name, relation: fromDbRelation(p.relation), age: p.age, gender: (p.gender ?? "") as Patient["gender"] };
  });
  // The account holder always comes first.
  patients.sort((a, b) => Number(b.relation === SELF) - Number(a.relation === SELF));
  const addresses: Address[] = (places.data ?? []).map((a) => {
    remoteIds[a.id] = a.id;
    return { id: a.id, label: a.label, line: a.line, area: a.area, cityId: a.city_id, pincode: a.pincode, landmark: a.landmark ?? "" };
  });
  const lang = LANGS.includes(profile.data?.lang as Lang) ? (profile.data?.lang as Lang) : "en";
  return {
    hasProfile: !!profile.data?.consent_at,
    name: profile.data?.full_name ?? "",
    lang,
    consented: !!profile.data?.consent_at,
    patients,
    addresses,
    contact: contact.data ? { name: contact.data.name, relation: contact.data.relation, phone: contact.data.phone } : null,
    remoteIds,
  };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Save what changed since the last snapshot. Returns the id map (local id → database id), with ids for
 * anything new. Throws if the database refuses, so the caller can try again on the next change.
 */
export async function pushAccount(userId: string, prev: AccountSnapshot | null, next: AccountSnapshot, ids: Record<string, string>): Promise<Record<string, string>> {
  const client = db("patient");
  const remoteIds = { ...ids };
  const idFor = (local: string) => (remoteIds[local] ??= uuid());

  // Profile: name, language, consent (given once, with the time).
  if (!prev || prev.name !== next.name || prev.lang !== next.lang || prev.consented !== next.consented) {
    const patch: Record<string, unknown> = { full_name: next.name, lang: next.lang };
    if (next.consented && !prev?.consented) patch.consent_at = new Date().toISOString();
    const { error } = await client.from("profiles").update(patch).eq("id", userId);
    if (error) throw error;
  }

  // Family members
  const changedPeople = next.patients.filter((p) => !same(p, prev?.patients.find((q) => q.id === p.id)));
  if (changedPeople.length) {
    const rows = changedPeople.map((p) => ({ id: idFor(p.id), account_id: userId, name: p.name, relation: toDbRelation(p.relation), age: p.age, gender: p.gender || "" }));
    const { error } = await client.from("patient_people").upsert(rows);
    if (error) throw error;
  }
  const gonePeople = (prev?.patients ?? []).filter((p) => !next.patients.some((q) => q.id === p.id) && remoteIds[p.id]);
  if (gonePeople.length) {
    const { error } = await client.from("patient_people").delete().in("id", gonePeople.map((p) => remoteIds[p.id]));
    if (error) throw error;
  }

  // Addresses
  const changedPlaces = next.addresses.filter((a) => !same(a, prev?.addresses.find((b) => b.id === a.id)));
  if (changedPlaces.length) {
    const rows = changedPlaces.map((a) => ({ id: idFor(a.id), account_id: userId, label: a.label, line: a.line, area: a.area, city_id: a.cityId, pincode: a.pincode, landmark: a.landmark }));
    const { error } = await client.from("addresses").upsert(rows);
    if (error) throw error;
  }
  const gonePlaces = (prev?.addresses ?? []).filter((a) => !next.addresses.some((b) => b.id === a.id) && remoteIds[a.id]);
  if (gonePlaces.length) {
    const { error } = await client.from("addresses").delete().in("id", gonePlaces.map((a) => remoteIds[a.id]));
    if (error) throw error;
  }

  // Emergency contact
  if (!same(prev?.contact ?? null, next.contact)) {
    const { error } = next.contact
      ? await client.from("emergency_contacts").upsert({ account_id: userId, ...next.contact })
      : await client.from("emergency_contacts").delete().eq("account_id", userId);
    if (error) throw error;
  }
  return remoteIds;
}
