"use client";

// ADMIN PANEL ↔ DATABASE (phases 3 and 4): real caregivers, their documents, verification decisions and
// history. Reading uses the access rules (the verification team sees documents; others see less);
// every decision goes through a database function (supabase/003_verification.sql).

import { db } from "@/lib/supabase";
import { viewLinks } from "@/lib/files";
import { ID_TYPES } from "@/lib/caregiver/data";
import type { PhotoFile } from "@/lib/prescription";
import type { Applicant, HistoryEvent, HistoryKind, Member, Renewal, Tier } from "./data";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export type SentBackRow = { id: string; name: string; cityId: string; step: string; reason: string; at: number };
export type ApprovedRow = { id: string; name: string; role: "nurse" | "compounder"; tier: Tier; cityId: string; at: number };

export type LiveData = {
  applicants: Applicant[];
  sentBack: SentBackRow[];
  approved: ApprovedRow[];
  members: (Member & { suspended: { reason: string; at: number } | null })[];
  renewals: Renewal[];
  history: Record<string, HistoryEvent[]>;
  docs: Record<string, { id: PhotoFile | null; selfie: PhotoFile | null; certificate: PhotoFile | null; renewal: PhotoFile | null }>;
  loadedAt: number;
};

const ms = (d: string | null | undefined) => (d ? new Date(d).getTime() : 0);
const ym = (d: string | null | undefined) => (d ? d.slice(0, 7) : undefined);

function photo(doc: Row | undefined): PhotoFile | null {
  if (!doc) return null;
  const path: string = doc.storage_path;
  return { kind: path.toLowerCase().endsWith(".pdf") ? "pdf" : "image", name: path.split("/").pop() ?? doc.kind, size: 0, dataUrl: null, addedAt: ms(doc.created_at), path };
}

const ACTION_KIND: Record<string, HistoryKind> = {
  approved: "approved", sent_back: "sent-back", paused: "paused", reinstated: "reinstated", tier: "tier",
  renewal_approved: "renewal-approved", renewal_refused: "renewal-refused", reminder: "reminder",
};

export async function loadLive(): Promise<LiveData> {
  const client = db("admin");
  const cg = await client.from("caregivers").select("*").order("created_at", { ascending: false });
  if (cg.error) throw cg.error;
  const rows = cg.data ?? [];
  const ids = rows.map((r) => r.id);
  const none = ["00000000-0000-0000-0000-000000000000"];
  const [profiles, quals, banks, docs, audit, team] = await Promise.all([
    client.from("profiles").select("id, full_name, phone").in("id", ids.length ? ids : none),
    client.from("caregiver_qualifications").select("*").in("caregiver_id", ids.length ? ids : none),
    client.from("caregiver_bank").select("caregiver_id, holder, account_number, ifsc, upi").in("caregiver_id", ids.length ? ids : none),
    client.from("kyc_documents").select("*").in("caregiver_id", ids.length ? ids : none).order("created_at", { ascending: false }),
    client.from("audit_log").select("actor, action, subject_id, detail, created_at").in("subject_id", ids.length ? ids : none).order("created_at", { ascending: false }),
    client.from("admin_users").select("id, name"),
  ]);
  // Some of these are hidden from some roles by the access rules: treat a refusal as "nothing to show".
  const list = (r: { data: Row[] | null; error: unknown }) => (r.error ? [] : r.data ?? []);
  const P = new Map(list(profiles).map((p) => [p.id, p]));
  const Q = new Map(list(quals).map((q) => [q.caregiver_id, q]));
  const B = new Map(list(banks).map((b) => [b.caregiver_id, b]));
  const D = list(docs);
  const A = list(audit);
  const names = new Map(list(team).map((m) => [m.id, m.name]));
  const latest = (id: string, kind: string) => D.find((d) => d.caregiver_id === id && d.kind === kind && d.status !== "rejected");

  const applicants: Applicant[] = [];
  const sentBack: SentBackRow[] = [];
  const approved: ApprovedRow[] = [];
  const members: LiveData["members"] = [];
  const history: Record<string, HistoryEvent[]> = {};
  const docsOf: LiveData["docs"] = {};

  for (const r of rows) {
    const p = P.get(r.id) ?? {};
    const q = Q.get(r.id) ?? {};
    const b = B.get(r.id);
    const name = p.full_name || "New caregiver";
    const phone = (p.phone ?? "").replace(/^91/, "");
    const idDoc = latest(r.id, "id");
    docsOf[r.id] = {
      id: photo(idDoc), selfie: photo(latest(r.id, "selfie")), certificate: photo(latest(r.id, "certificate")),
      renewal: photo(D.find((d) => d.caregiver_id === r.id && d.kind === "renewal" && d.status === "submitted")),
    };
    const sent = D.filter((d) => d.caregiver_id === r.id && d.kind !== "renewal").map((d) => ms(d.created_at));
    const submittedAt = sent.length ? Math.max(...sent) : ms(r.updated_at);

    // History: documents sent, and every decision in the audit log.
    const ev: HistoryEvent[] = [];
    // Documents sent together form one entry; a decision in between starts a new one.
    const mine = A.filter((x) => x.subject_id === r.id);
    const decisionTimes = mine.map((a) => ms(a.created_at));
    const sentDocs = D.filter((x) => x.caregiver_id === r.id).sort((x, y) => ms(x.created_at) - ms(y.created_at));
    let group: { at: number; last: number; kinds: string[] } | null = null;
    const flush = () => { if (group) ev.push({ at: group.at, kind: "documents", text: group.kinds.join(", ") }); group = null; };
    for (const d of sentDocs) {
      const at = ms(d.created_at);
      if (d.kind === "renewal") { ev.push({ at, kind: "renewal-sent", text: `Renewed registration certificate, valid until ${ym(d.valid_until) ?? "?"}` }); continue; }
      const label = d.kind === "id" ? "ID" : d.kind === "selfie" ? "selfie" : "certificate";
      if (group && (at - group.last > 120000 || decisionTimes.some((t) => t > group!.last && t <= at))) flush();
      if (!group) group = { at, last: at, kinds: [] };
      group.kinds.push(label);
      group.last = at;
    }
    flush();
    for (const a of mine) {
      const kind = ACTION_KIND[a.action];
      if (kind) ev.push({ at: ms(a.created_at), kind, text: a.detail?.text ?? "", by: names.get(a.actor) ?? undefined });
    }
    history[r.id] = ev.sort((x, y) => y.at - x.at);

    if (r.kyc_status === "submitted") {
      applicants.push({
        id: r.id, db: true, name, phone, role: r.role, gender: r.gender ?? "", dob: r.dob ?? "", cityId: r.city_id ?? "hyd", area: r.area ?? "", pincode: r.pincode ?? "",
        languages: r.languages ?? [], submittedAt,
        idType: ID_TYPES.find((x) => x.id === idDoc?.id_type)?.name ?? "ID", idLast4: idDoc?.id_last4 ?? "",
        idPhoto: photo(idDoc), selfie: photo(latest(r.id, "selfie")), certificate: photo(latest(r.id, "certificate")),
        course: q.course ?? "", council: q.council ?? "", regNo: q.reg_no ?? "", validUntil: ym(q.valid_until), years: q.years != null ? String(q.years) : "",
        refName: q.ref_name ?? "", refPhone: q.ref_phone ?? "",
        bank: { holder: b?.holder ?? "", account: b?.account_number ? `••••${String(b.account_number).slice(-4)}` : "", ifsc: b?.ifsc ?? "", upi: b?.upi ?? "" },
        notes: [], resubmitted: ev.some((e) => e.kind === "sent-back"),
      });
    } else if (r.kyc_status === "rejected") {
      const last = ev.find((e) => e.kind === "sent-back");
      sentBack.push({ id: r.id, name, cityId: r.city_id ?? "hyd", step: r.rejected_step ?? "", reason: r.rejected_reason ?? "", at: last?.at ?? ms(r.updated_at) });
    } else if (r.kyc_status === "approved") {
      const ok = ev.find((e) => e.kind === "approved");
      approved.push({ id: r.id, name, role: r.role, tier: r.tier, cityId: r.city_id ?? "hyd", at: ok?.at ?? ms(r.updated_at) });
      members.push({
        id: r.id, db: true, name, role: r.role, tier: r.role === "compounder" ? "basic" : r.tier, gender: r.gender ?? "", cityId: r.city_id ?? "hyd", area: r.area ?? "", phone,
        joinedAt: ok?.at ?? ms(r.created_at), rating: Number(r.rating ?? 0), ratings: r.ratings_count ?? 0, visits: r.visits_done ?? 0, cancels30: 0, complaints: 0,
        course: q.course ?? "", council: q.council ?? "", regNo: q.reg_no ?? "", validUntil: ym(q.valid_until), online: !!r.online,
        bankLast4: b?.account_number ? String(b.account_number).slice(-4) : "",
        suspended: r.suspended_at ? { reason: r.suspended_reason ?? "", at: ms(r.suspended_at) } : null,
      });
    }
  }

  const renewals: Renewal[] = D.filter((d) => d.kind === "renewal" && d.status === "submitted").map((d) => ({
    id: d.id, memberId: d.caregiver_id, db: true, validUntil: ym(d.valid_until) ?? "", certificate: photo(d), sentAt: ms(d.created_at),
  }));

  return { applicants, sentBack, approved, members, renewals, history, docs: docsOf, loadedAt: Date.now() };
}

/** Fill in 10-minute links so the documents can be seen. */
export async function withLinks<T extends PhotoFile | null>(files: T[]): Promise<T[]> {
  const links = await viewLinks("admin", "kyc", files.map((f) => f?.path ?? "").filter(Boolean));
  return files.map((f) => (f && f.path && links[f.path] ? { ...f, dataUrl: links[f.path] } : f));
}

/* ---------- Decisions (each is one database function) ---------- */

const rpc = async (fn: string, args: Record<string, unknown>) => {
  const { data, error } = await db("admin").rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

export const approveCaregiver = (id: string, tier: Tier, checklist: string[]) => rpc("review_caregiver", { p_caregiver: id, p_decision: "approved", p_tier: tier, p_checklist: checklist });
export const sendBackCaregiver = (id: string, step: string, reason: string) => rpc("review_caregiver", { p_caregiver: id, p_decision: "sent_back", p_step: step, p_reason: reason });
export const pauseCaregiver = (id: string, reason: string | null) => rpc("set_caregiver_pause", { p_caregiver: id, p_reason: reason });
export const setTier = (id: string, tier: Tier) => rpc("set_caregiver_tier", { p_caregiver: id, p_tier: tier });
export const reviewRenewal = (docId: string, approve: boolean, reason?: string) => rpc("review_renewal", { p_document: docId, p_approve: approve, p_reason: reason ?? null });
export const remindRenewal = (id: string) => rpc("remind_renewal", { p_caregiver: id });
export const sendBroadcast = (title: string, body: string, city: string | null, role: string | null, onlineOnly: boolean) =>
  rpc("send_broadcast", { p_title: title, p_body: body, p_city: city, p_role: role, p_online_only: onlineOnly }) as Promise<number>;
