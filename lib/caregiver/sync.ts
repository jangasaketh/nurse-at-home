"use client";

// CAREGIVER APP ↔ DATABASE (phase 2): the signed-in caregiver's role, details (name, gender, date of birth,
// languages, city, area, PIN) and language are saved to their account. Documents, bank account and the
// verification decision move to the database in phases 3 and 4; until then they stay on the phone.

import { db } from "@/lib/supabase";
import type { Lang } from "@/lib/i18n";
import type { Role } from "./data";
import type { Bank, CgNotice, CgState, IdProof, Personal, Qualification } from "./store";
import type { IdType } from "./data";
import type { PhotoFile } from "@/lib/prescription";
import { uploadFile, viewLinks } from "@/lib/files";

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

/* ---------- Phase 3 and 4: documents and the verification decision ---------- */


type DocRow = { id: string; kind: string; storage_path: string; id_type: string | null; id_last4: string | null; valid_until: string | null; status: string; reason: string | null; created_at: string };

const ym = (d: string | null) => (d ? d.slice(0, 7) : undefined);
/** "2031-03" → "2031-03-31" (registration is valid to the end of that month). */
export const endOfMonth = (ymStr: string) => {
  const [y, m] = ymStr.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 0));
  return d.toISOString().slice(0, 10);
};

function photoFrom(row: DocRow, links: Record<string, string>): PhotoFile {
  const pdf = row.storage_path.toLowerCase().endsWith(".pdf");
  return { kind: pdf ? "pdf" : "image", name: row.storage_path.split("/").pop() ?? row.kind, size: 0, dataUrl: pdf ? null : links[row.storage_path] ?? null, addedAt: new Date(row.created_at).getTime(), path: row.storage_path };
}

export type PulledDocs = {
  idProof: IdProof | null;
  selfie: PhotoFile | null;
  qualification: Qualification | null;
  bank: Bank | null;
  renewal: { certificate: PhotoFile; validUntil: string; at: number } | null;
  notices: CgNotice[];
};

/** Everything sent for verification, read back (with 10-minute links to see the photos). */
export async function pullDocs(userId: string): Promise<PulledDocs> {
  const client = db("caregiver");
  const [q, b, d] = await Promise.all([
    client.from("caregiver_qualifications").select("course, council, reg_no, years, valid_until, ref_name, ref_phone").eq("caregiver_id", userId).maybeSingle(),
    client.from("caregiver_bank").select("holder, account_number, ifsc, upi").eq("caregiver_id", userId).maybeSingle(),
    client.from("kyc_documents").select("id, kind, storage_path, id_type, id_last4, valid_until, status, reason, created_at").eq("caregiver_id", userId).order("created_at", { ascending: false }),
  ]);
  for (const r of [q, b, d]) if (r.error) throw r.error;
  const docs = (d.data ?? []) as DocRow[];
  // The newest document of each kind that was not sent back.
  const latest = (kind: string) => docs.find((x) => x.kind === kind && x.status !== "rejected") ?? null;
  const idDoc = latest("id"), selfieDoc = latest("selfie"), certDoc = latest("certificate");
  const renewalDoc = docs.find((x) => x.kind === "renewal" && x.status === "submitted") ?? null;
  const links = await viewLinks("caregiver", "kyc", [idDoc, selfieDoc, certDoc, renewalDoc].filter(Boolean).map((x) => x!.storage_path));
  const notices = await pullNotices(userId);
  return {
    idProof: idDoc ? { type: (idDoc.id_type ?? "aadhaar") as IdType, number: idDoc.id_last4 ?? "", photo: photoFrom(idDoc, links) } : null,
    selfie: selfieDoc ? photoFrom(selfieDoc, links) : null,
    qualification: q.data ? {
      course: q.data.course, council: q.data.council, regNo: q.data.reg_no, years: String(q.data.years ?? ""), certificate: certDoc ? photoFrom(certDoc, links) : null,
      refName: q.data.ref_name ?? "", refPhone: q.data.ref_phone ?? "", validUntil: ym(q.data.valid_until),
    } : null,
    bank: b.data ? { holder: b.data.holder, account: b.data.account_number, ifsc: b.data.ifsc, upi: b.data.upi ?? "" } : null,
    renewal: renewalDoc ? { certificate: photoFrom(renewalDoc, links), validUntil: ym(renewalDoc.valid_until) ?? "", at: new Date(renewalDoc.created_at).getTime() } : null,
    notices,
  };
}

/** Notifications sent by the team (newest first). */
export async function pullNotices(userId: string): Promise<CgNotice[]> {
  const { data, error } = await db("caregiver").from("notifications").select("id, kind, title, body, target, read, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(60);
  if (error) throw error;
  return (data ?? []).map((n) => ({
    id: n.id, kind: (n.kind as CgNotice["kind"]) ?? "message", title: n.title as CgNotice["title"], body: n.body as CgNotice["body"],
    at: new Date(n.created_at).getTime(), read: !!n.read, to: (n.target ?? undefined) as CgNotice["to"],
  }));
}

/** The decision fields only (checked every few seconds while waiting). */
export async function pullStatus(userId: string) {
  const { data, error } = await db("caregiver").from("caregivers").select("kyc_status, tier, rejected_step, rejected_reason, suspended_reason, suspended_at").eq("id", userId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    kycStatus: data.kyc_status as CgState["kycStatus"],
    tier: data.tier as "full" | "basic",
    rejected: data.kyc_status === "rejected" && data.rejected_step ? { step: data.rejected_step, reason: data.rejected_reason ?? "" } as CgState["rejected"] : null,
    suspended: data.suspended_at ? { reason: data.suspended_reason ?? "", at: new Date(data.suspended_at).getTime() } : null,
  };
}

export class Missing extends Error {
  constructor(public steps: string[]) { super(`Missing: ${steps.join(", ")}`); }
}

/**
 * Send everything for checking: upload the photos not uploaded yet, save the qualification and bank
 * account, then ask the database to mark it as sent (it checks that nothing is missing).
 * Returns the documents with their storage paths filled in.
 */
export async function sendForVerification(userId: string, s: CgState): Promise<{ idProof: IdProof; selfie: PhotoFile; qualification: Qualification }> {
  if (!s.idProof?.photo || !s.selfie || !s.qualification?.certificate || !s.bank || !s.personal || !s.role) throw new Missing(["documents"]);
  const client = db("caregiver");
  // Role and details first (the database checks them).
  await pushCaregiver(userId, null, { lang: s.lang, role: s.role, personal: s.personal }, s.cgExists);

  const send = async (kind: "id" | "selfie" | "certificate", p: PhotoFile, extra: Record<string, unknown> = {}) => {
    if (p.path) return p;
    const path = await uploadFile("caregiver", "kyc", userId, kind, p);
    const { error } = await client.from("kyc_documents").insert({ caregiver_id: userId, kind, storage_path: path, ...extra });
    if (error) throw error;
    return { ...p, path };
  };
  const idPhoto = await send("id", s.idProof.photo, { id_type: s.idProof.type, id_last4: s.idProof.number.slice(-4) });
  const selfie = await send("selfie", s.selfie);
  const certificate = await send("certificate", s.qualification.certificate);

  const q = s.qualification;
  const qErr = (await client.from("caregiver_qualifications").upsert({
    caregiver_id: userId, course: q.course, council: q.council, reg_no: q.regNo, years: Number(q.years) || 0,
    valid_until: q.validUntil ? endOfMonth(q.validUntil) : null, ref_name: q.refName, ref_phone: q.refPhone,
  })).error;
  if (qErr) throw qErr;
  const bErr = (await client.from("caregiver_bank").upsert({ caregiver_id: userId, holder: s.bank.holder, account_number: s.bank.account, ifsc: s.bank.ifsc, upi: s.bank.upi })).error;
  if (bErr) throw bErr;

  const { error } = await client.rpc("submit_verification");
  if (error) throw error;
  return { idProof: { ...s.idProof, photo: idPhoto }, selfie, qualification: { ...q, certificate } };
}

/** A renewed registration certificate, for the team to check. */
export async function sendRenewal(userId: string, certificate: PhotoFile, validUntil: string): Promise<PhotoFile> {
  const path = await uploadFile("caregiver", "kyc", userId, "renewal", certificate);
  const { error } = await db("caregiver").from("kyc_documents").insert({ caregiver_id: userId, kind: "renewal", storage_path: path, valid_until: endOfMonth(validUntil) });
  if (error) throw error;
  return { ...certificate, path };
}

/** Mark the team's notifications as read. */
export async function markNoticesRead(userId: string, ids: string[]) {
  const uuids = ids.filter((id) => /^[0-9a-f-]{36}$/.test(id));
  if (!uuids.length) return;
  await db("caregiver").from("notifications").update({ read: true }).eq("user_id", userId).in("id", uuids);
}
