"use client";

// CAREGIVER APP ↔ DATABASE (phase 2): the signed-in caregiver's role, details (name, gender, date of birth,
// languages, city, area, PIN) and language are saved to their account. Documents, bank account and the
// verification decision move to the database in phases 3 and 4; until then they stay on the phone.

import { db } from "@/lib/supabase";
import type { Lang } from "@/lib/i18n";
import type { Role } from "./data";
import type { CgState, Personal } from "./store";

export type CgSnapshot = { lang: Lang; role: Role | null; personal: Personal | null };

export type PulledCaregiver = CgSnapshot & {
  exists: boolean;
  kycStatus: CgState["kycStatus"] | null;
  tier: "full" | "basic";
  suspended: CgState["suspended"];
  rejected: CgState["rejected"];
};

const LANGS: Lang[] = ["en", "te", "kn"];

export async function pullCaregiver(userId: string): Promise<PulledCaregiver> {
  const client = db("caregiver");
  const [profile, row] = await Promise.all([
    client.from("profiles").select("full_name, lang").eq("id", userId).maybeSingle(),
    client.from("caregivers").select("role, tier, kyc_status, rejected_step, rejected_reason, gender, dob, languages, city_id, area, pincode, suspended_reason, suspended_at").eq("id", userId).maybeSingle(),
  ]);
  if (profile.error) throw profile.error;
  if (row.error) throw row.error;
  const r = row.data;
  const lang = LANGS.includes(profile.data?.lang as Lang) ? (profile.data?.lang as Lang) : "en";
  const personal: Personal | null = r && r.gender && r.dob && r.city_id
    ? { name: profile.data?.full_name ?? "", gender: r.gender, dob: r.dob, languages: r.languages ?? [], cityId: r.city_id, area: r.area ?? "", pincode: r.pincode ?? "" }
    : null;
  return {
    exists: !!r,
    lang,
    role: (r?.role as Role) ?? null,
    personal,
    kycStatus: (r?.kyc_status as CgState["kycStatus"]) ?? null,
    tier: (r?.tier as "full" | "basic") ?? "full",
    suspended: r?.suspended_at ? { reason: r.suspended_reason ?? "", at: new Date(r.suspended_at).getTime() } : null,
    rejected: r?.kyc_status === "rejected" && r.rejected_step ? { step: r.rejected_step, reason: r.rejected_reason ?? "" } : null,
  };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Save what changed. `exists` says whether the caregiver row is already in the database. Returns the new value of exists. */
export async function pushCaregiver(userId: string, prev: CgSnapshot | null, next: CgSnapshot, exists: boolean): Promise<boolean> {
  const client = db("caregiver");
  if (!next.role) return exists;
  if (!exists) {
    const { error } = await client.from("caregivers").insert({ id: userId, role: next.role });
    if (error && error.code !== "23505") throw error; // 23505: already there (another phone made it)
    exists = true;
  } else if (prev?.role !== next.role) {
    const { error } = await client.from("caregivers").update({ role: next.role }).eq("id", userId);
    if (error) throw error;
  }
  if (next.personal && !same(prev?.personal ?? null, next.personal)) {
    const p = next.personal;
    const { error } = await client.from("caregivers")
      .update({ gender: p.gender || null, dob: p.dob || null, languages: p.languages, city_id: p.cityId || null, area: p.area, pincode: p.pincode })
      .eq("id", userId);
    if (error) throw error;
  }
  if (!prev || prev.lang !== next.lang || prev.personal?.name !== next.personal?.name) {
    const patch: Record<string, unknown> = { lang: next.lang };
    if (next.personal?.name) patch.full_name = next.personal.name;
    const { error } = await client.from("profiles").update(patch).eq("id", userId);
    if (error) throw error;
  }
  return exists;
}
