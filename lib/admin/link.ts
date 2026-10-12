// ADMIN PANEL ↔ CAREGIVER APP, for the prototype.
// Both apps are on the same site, so they share the browser's saved data. The admin panel reads the caregiver
// app's saved state and writes its decisions straight into it; the caregiver app picks them up at once
// (it listens for changes; see lib/caregiver/store.tsx).
// When the backend exists, these functions become API calls and the caregiver app gets a push notification.

import { approvalPatch, CG_STORAGE_KEY, type CgNotice, type CgState, type KycStep } from "@/lib/caregiver/store";
import { joinMsg, msg, newId, type Msg } from "@/lib/booking";
import { ID_TYPES } from "@/lib/caregiver/data";
import { weekTotals } from "@/lib/caregiver/rules";
import { mondayOf, type AdminTicket, type Applicant, type Member, type Renewal, type Tier } from "./data";

export function readCg(): CgState | null {
  try {
    const raw = window.localStorage.getItem(CG_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CgState) : null;
  } catch {
    return null;
  }
}

/** Read the newest caregiver state, change it, save it. Returns false if there is no caregiver in this browser. */
export function writeCg(fn: (s: CgState) => Partial<CgState>): boolean {
  const cur = readCg();
  if (!cur) return false;
  try {
    window.localStorage.setItem(CG_STORAGE_KEY, JSON.stringify({ ...cur, ...fn(cur) }));
    return true;
  } catch {
    return false;
  }
}

const notice = (n: Omit<CgNotice, "id" | "at" | "read">): CgNotice => ({ ...n, id: newId("n"), at: Date.now(), read: false });
const withNotice = (s: CgState, n: Omit<CgNotice, "id" | "at" | "read">) => [notice(n), ...(s.notices ?? [])].slice(0, 60);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Mar 2031" as a message, so the month name follows the caregiver's language. */
const monthMsg = (ym: string): Msg => { const [y, m] = ym.split("-"); return joinMsg(" ", msg(MONTHS[Number(m) - 1] ?? "Jan"), y); };
const last4 = (acc?: string) => (acc ? `••••${acc.slice(-4)}` : "");

/* ---------- Reading ---------- */

/** The caregiver from the app, as a verification request (only while their documents are waiting). */
export function liveApplicant(cg: CgState | null): Applicant | null {
  if (!cg || cg.kycStatus !== "submitted" || !cg.role) return null;
  const p = cg.personal;
  const q = cg.qualification;
  return {
    id: "live",
    live: true,
    name: p?.name || "New caregiver",
    phone: cg.phone,
    role: cg.role,
    gender: p?.gender ?? "",
    dob: p?.dob ?? "",
    cityId: p?.cityId ?? "hyd",
    area: p?.area ?? "",
    pincode: p?.pincode ?? "",
    languages: p?.languages ?? [],
    submittedAt: Math.max(...[cg.idProof?.photo?.addedAt, cg.selfie?.addedAt, q?.certificate?.addedAt].filter((x): x is number => typeof x === "number"), 0) || Date.now(),
    idType: ID_TYPES.find((x) => x.id === cg.idProof?.type)?.name ?? "ID",
    idLast4: cg.idProof?.number ? cg.idProof.number.slice(-4) : "",
    idPhoto: cg.idProof?.photo ?? null,
    selfie: cg.selfie,
    course: q?.course ?? "",
    council: q?.council ?? "",
    regNo: q?.regNo ?? "",
    validUntil: q?.validUntil,
    years: q?.years ?? "",
    certificate: q?.certificate ?? null,
    refName: q?.refName ?? "",
    refPhone: q?.refPhone ?? "",
    bank: { holder: cg.bank?.holder ?? "", account: last4(cg.bank?.account), ifsc: cg.bank?.ifsc ?? "", upi: cg.bank?.upi ?? "" },
    notes: [],
  };
}

/** The caregiver from the app, as a working caregiver (once approved). */
export function liveMember(cg: CgState | null): Member | null {
  if (!cg || cg.kycStatus !== "approved" || !cg.role) return null;
  const p = cg.personal;
  const q = cg.qualification;
  const reviews = cg.reviews ?? [];
  const visits = (cg.records ?? []).filter((r) => r.kind === "completed").length;
  return {
    id: "live",
    live: true,
    name: p?.name || "Caregiver",
    role: cg.role,
    tier: cg.role === "compounder" ? "basic" : cg.tier ?? "full",
    gender: p?.gender ?? "",
    cityId: p?.cityId ?? "hyd",
    area: p?.area ?? "",
    phone: cg.phone,
    joinedAt: Date.now(),
    rating: reviews.length ? Math.round((reviews.reduce((s, r) => s + r.stars, 0) / reviews.length) * 10) / 10 : 0,
    ratings: reviews.length,
    visits,
    cancels30: 0,
    complaints: 0,
    course: q?.course ?? "",
    council: q?.council ?? "",
    regNo: q?.regNo ?? "",
    validUntil: q?.validUntil,
    online: !!cg.online,
    bankLast4: cg.bank?.account.slice(-4) ?? "",
  };
}

export function liveRenewal(cg: CgState | null): Renewal | null {
  if (!cg?.renewal || cg.kycStatus !== "approved") return null;
  return { id: "live-renewal", memberId: "live", live: true, validUntil: cg.renewal.validUntil, certificate: cg.renewal.certificate, sentAt: cg.renewal.at };
}

export function liveTickets(cg: CgState | null): (AdminTicket & { cgStatus: "open" | "resolved"; cgReply: string | null })[] {
  if (!cg) return [];
  return (cg.tickets ?? []).map((tk) => ({
    id: tk.id,
    from: "caregiver" as const,
    live: true,
    name: cg.personal?.name || "Caregiver",
    phone: cg.phone,
    topic: tk.topic,
    message: tk.message,
    bookingId: null,
    at: tk.at,
    urgent: tk.topic === "Safety concern" || tk.topic === "A patient behaved badly",
    photo: tk.photo,
    cgStatus: tk.status,
    cgReply: tk.reply?.text ?? null,
  }));
}

/** This week's earnings and cash collected for the caregiver in the app. */
export function liveWeek(cg: CgState | null) {
  if (!cg || cg.kycStatus !== "approved") return null;
  const w = weekTotals(cg.earnings ?? []);
  const monday = mondayOf(Date.now());
  const visits = (cg.earnings ?? []).filter((e) => e.at >= monday && e.kind === "visit").length;
  return { earned: w.earned, cash: w.cash, visits, account: cg.bank?.account.slice(-4) ?? "0000" };
}

/* ---------- Writing (admin decisions) ---------- */

export function approveLive(tier: Tier) {
  return writeCg((s) => {
    const t: Tier = s.role === "compounder" ? "basic" : tier;
    const patch = approvalPatch(s);
    const notices = t === "basic" && s.role === "nurse"
      ? [notice({ kind: "verified", title: { k: "Approved for dressing and vitals visits" }, body: { k: "For now you get wound dressing, elder care dressing and vitals requests. We will tell you when injections and drips are added." }, to: "jobs" }), ...(patch.notices ?? [])]
      : patch.notices;
    return { ...patch, notices, tier: t };
  });
}

export function sendBackLive(step: KycStep, reason: string) {
  return writeCg((s) => ({
    kycStatus: "rejected",
    rejected: { step, reason },
    notices: withNotice(s, { kind: "document", title: { k: "One document needs another look" }, body: msg(reason), to: "review" }),
  }));
}

export function setTierLive(tier: Tier) {
  return writeCg((s) => ({
    tier,
    notices: withNotice(s, tier === "basic"
      ? { kind: "verified", title: { k: "Your visits have changed" }, body: { k: "For now you get wound dressing, elder care dressing and vitals requests. We will tell you when injections and drips are added." }, to: "jobs" }
      : { kind: "verified", title: { k: "Your visits have changed" }, body: { k: "You can now take every nurse service, including injections, IV drips and medication." }, to: "jobs" }),
  }));
}

export function suspendLive(reason: string) {
  return writeCg(() => ({ suspended: { reason, at: Date.now() }, online: false }));
}

export function reinstateLive() {
  return writeCg((s) => ({
    suspended: null,
    notices: withNotice(s, { kind: "verified", title: { k: "Your account is active again" }, body: { k: "Go online on the Jobs screen to start getting requests near you." }, to: "jobs" }),
  }));
}

export function approveRenewalLive() {
  return writeCg((s) => (s.renewal && s.qualification ? {
    qualification: { ...s.qualification, validUntil: s.renewal.validUntil, certificate: s.renewal.certificate },
    renewal: null,
    notices: withNotice(s, { kind: "verified", title: { k: "Registration renewed" }, body: { k: "Your registration is now valid until {month}.", v: { month: monthMsg(s.renewal.validUntil) } }, to: "profile" }),
  } : {}));
}

export function rejectRenewalLive(reason: string) {
  return writeCg((s) => ({
    renewal: null,
    notices: withNotice(s, { kind: "document", title: { k: "Renewal not accepted" }, body: msg(reason), to: "renew" }),
  }));
}

export function remindRenewalLive() {
  return writeCg((s) => ({
    notices: withNotice(s, { kind: "document", title: { k: "Your registration expires soon" }, body: { k: "Send your renewed certificate so you keep getting injection and drip requests." }, to: "renew" }),
  }));
}

export function replyTicketLive(id: string, text: string, resolve: boolean) {
  return writeCg((s) => ({
    tickets: (s.tickets ?? []).map((tk) => (tk.id === id ? { ...tk, reply: { text, at: Date.now() }, status: resolve ? "resolved" : tk.status } : tk)),
    notices: withNotice(s, { kind: "support", title: { k: "Support replied to {id}", v: { id } }, body: text, to: "report" }),
  }));
}

export function payLive(amount: number, reference: string) {
  return writeCg((s) => {
    const account = s.bank?.account.slice(-4) ?? "0000";
    return {
      payouts: [{ id: newId("p"), at: Date.now(), amount, account, reference }, ...(s.payouts ?? [])],
      notices: withNotice(s, { kind: "payout", title: { k: "Payout sent" }, body: { k: "{amount} was sent to your account •••• {acc}.", v: { amount: `₹${amount.toLocaleString("en-IN")}`, acc: account } }, to: "payouts" }),
    };
  });
}

export function setTicketStatusLive(id: string, status: "open" | "resolved") {
  return writeCg((s) => ({ tickets: (s.tickets ?? []).map((tk) => (tk.id === id ? { ...tk, status } : tk)) }));
}

/** A message from the team to caregivers (shown as written, in English). */
export function messageLive(title: string, body: string) {
  return writeCg((s) => ({ notices: withNotice(s, { kind: "message", title, body, to: "jobs" }) }));
}
