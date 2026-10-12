"use client";

// ADMIN: everyone who is verified. Change what they can take, pause (suspend) or reinstate them.

import { useState } from "react";
import { useAdmin, type MemberRow } from "@/lib/admin/store";
import * as link from "@/lib/admin/link";
import {
  ago, cityName, dateOnly, dateTime, daysUntilMonthEnd, HISTORY_TEXT, monthText, sampleDocs, serviceName, STATUS_TEXT, TIER_TEXT, type HistoryKind, type Tier,
} from "@/lib/admin/data";
import { Badge, Doc, Drawer, Empty, Field, LiveBadge, PageHead, Select, useToast, type Tone } from "./ui";

export const SUSPEND_REASONS = [
  "A complaint about a visit is being looked into.",
  "You missed visits without telling the patient.",
  "Your documents need to be checked again.",
];

type Status = "all" | "online" | "active" | "suspended" | "expiring";

export function CaregiversPage() {
  const { view, state, nowMs } = useAdmin();
  const [city, setCity] = useState("all");
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState<Status>("all");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const warn = state.settings.renewalWarnDays;
  const rows = view.members.filter((m) => {
    const left = daysUntilMonthEnd(m.validUntil, nowMs);
    if (city !== "all" && m.cityId !== city) return false;
    if (role !== "all" && m.role !== role) return false;
    if (status === "online" && !(m.online && !m.suspended)) return false;
    if (status === "active" && m.suspended) return false;
    if (status === "suspended" && !m.suspended) return false;
    if (status === "expiring" && !(m.role === "nurse" && left !== null && left <= warn)) return false;
    if (q && !`${m.name} ${m.phone} ${m.regNo}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
  const open = view.members.find((m) => m.id === openId) ?? null;

  return (
    <>
      <PageHead title="Caregivers" sub={`${view.members.length} verified caregivers. ${view.members.filter((m) => m.suspended).length} paused.`} />
      <div className="afilters">
        <Field id="cg-search" label="Search" value={q} onChange={setQ} placeholder="Name, phone or reg. no." />
        <Select id="cg-city" label="City" value={city} onChange={setCity} options={[{ value: "all", label: "All cities" }, ...state.settings.cities.map((c) => ({ value: c.id, label: c.name }))]} />
        <Select id="cg-role" label="Role" value={role} onChange={setRole} options={[{ value: "all", label: "Nurses and compounders" }, { value: "nurse", label: "Nurses" }, { value: "compounder", label: "Compounders" }]} />
        <Select<Status> id="cg-status" label="Status" value={status} onChange={setStatus} options={[
          { value: "all", label: "All" }, { value: "online", label: "Online now" }, { value: "active", label: "Active" }, { value: "suspended", label: "Paused" }, { value: "expiring", label: "Registration expiring" },
        ]} />
      </div>
      <section className="acard acard-flat">
        {rows.length === 0 ? <Empty title="No caregivers match" body="Change the filters above." /> : (
          <div className="atable-wrap">
            <table className="atable">
              <thead><tr><th>Caregiver</th><th>Can take</th><th>City</th><th className="num">Rating</th><th className="num">Visits</th><th className="num">Cancelled (30 days)</th><th>Registration</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map((m) => {
                  const left = daysUntilMonthEnd(m.validUntil, nowMs);
                  return (
                    <tr key={m.id} className="click" onClick={() => setOpenId(m.id)}>
                      <td><span className="adm-strong">{m.name}</span>{m.live && <> <LiveBadge /></>}<span className="sub">{m.role === "nurse" ? "Registered nurse" : "Compounder"} · {m.phone}</span></td>
                      <td>{m.role === "compounder" ? "Dressing and vitals" : TIER_TEXT[m.tier]}</td>
                      <td>{cityName(m.cityId)}<span className="sub">{m.area}</span></td>
                      <td className="num">{m.ratings ? `${m.rating.toFixed(1)} ★` : "New"}<span className="sub">{m.ratings} ratings</span></td>
                      <td className="num">{m.visits}</td>
                      <td className="num">{m.cancels30 >= 3 ? <Badge tone="danger">{m.cancels30}</Badge> : m.cancels30}</td>
                      <td className="nowrap">{m.role !== "nurse" ? <span className="adm-muted">Not needed</span> : <>{monthText(m.validUntil)} {left !== null && left < 0 ? <Badge tone="danger">Lapsed</Badge> : left !== null && left <= warn ? <Badge tone="warn">{left} days</Badge> : null}</>}</td>
                      <td>{m.suspended ? <Badge tone="danger">Paused</Badge> : m.online ? <Badge tone="ok">Online</Badge> : <Badge>Offline</Badge>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {open && <MemberDrawer m={open} onClose={() => setOpenId(null)} />}
    </>
  );
}

function MemberDrawer({ m, onClose }: { m: MemberRow; onClose: () => void }) {
  const { view, update, log, addHistory, refreshCg, nowMs, state } = useAdmin();
  const toast = useToast();
  const [mode, setMode] = useState<"suspend" | "tier" | null>(null);
  const [reason, setReason] = useState(SUSPEND_REASONS[0]);
  const [own, setOwn] = useState("");
  const [tier, setTier] = useState<Tier>(m.tier);
  const [tried, setTried] = useState(false);
  const recent = view.bookings.filter((b) => b.caregiverId === m.id).slice(0, 6);
  const tickets = view.tickets.filter((tk) => tk.name === m.name);
  const finalReason = reason === "own" ? own.trim() : reason;
  const left = daysUntilMonthEnd(m.validUntil, nowMs);
  const edit = (patch: object) => update((prev) => ({ memberEdits: { ...prev.memberEdits, [m.id]: { ...prev.memberEdits[m.id], ...patch } } }));

  const suspend = () => {
    setTried(true);
    if (finalReason.length < 10) return;
    if (m.live) link.suspendLive(finalReason); else edit({ suspended: { reason: finalReason, at: Date.now() } });
    log(`Paused ${m.name}: “${finalReason}”`, "caregivers");
    addHistory(m.id, "paused", finalReason);
    refreshCg();
    toast(`${m.name} is paused and gets no requests`);
    setMode(null);
  };
  const reinstate = () => {
    if (m.live) link.reinstateLive(); else edit({ suspended: null });
    log(`Reinstated ${m.name}`, "caregivers");
    addHistory(m.id, "reinstated", "Can take requests again");
    refreshCg();
    toast(`${m.name} is active again`);
  };
  const saveTier = () => {
    if (m.live) link.setTierLive(tier); else edit({ tier });
    log(`Changed what ${m.name} can take: ${TIER_TEXT[tier].toLowerCase()}`, "caregivers");
    addHistory(m.id, "tier", TIER_TEXT[tier]);
    refreshCg();
    toast("Saved");
    setMode(null);
  };

  const footer = mode === "suspend" ? (
    <><button type="button" className="abtn" onClick={() => setMode(null)}>Cancel</button><button type="button" className="abtn abtn-danger" onClick={suspend}>Pause {m.name.split(" ")[0]}</button></>
  ) : mode === "tier" ? (
    <><button type="button" className="abtn" onClick={() => setMode(null)}>Cancel</button><button type="button" className="abtn abtn-primary" onClick={saveTier} disabled={tier === m.tier}>Save</button></>
  ) : (
    <>
      {m.role === "nurse" && <button type="button" className="abtn" onClick={() => { setTier(m.tier); setMode("tier"); }}>Change what they can take</button>}
      {m.suspended
        ? <button type="button" className="abtn abtn-primary" onClick={reinstate}>Reinstate</button>
        : <button type="button" className="abtn abtn-danger" onClick={() => { setMode("suspend"); setTried(false); }}>Pause (suspend)…</button>}
    </>
  );

  return (
    <Drawer label={m.name} onClose={onClose} footer={footer}
      title={<span className="adm-row">{m.name}{m.live && <LiveBadge />}{m.suspended ? <Badge tone="danger">Paused</Badge> : m.online ? <Badge tone="ok">Online</Badge> : <Badge>Offline</Badge>}</span>}
      sub={`${m.role === "nurse" ? "Registered nurse" : "Compounder"} · ${m.area}, ${cityName(m.cityId)} · joined ${dateOnly(m.joinedAt)}`}>
      {m.suspended && <div className="anote danger"><b>Paused {ago(m.suspended.at, nowMs)}.</b> Reason shown to them: “{m.suspended.reason}” They get no requests until reinstated.</div>}
      <div className="agrid agrid-4">
        <div className="astat"><span className="label">Rating</span><span className="value">{m.ratings ? m.rating.toFixed(1) : "—"}</span><span className="sub">{m.ratings} ratings</span></div>
        <div className="astat"><span className="label">Visits</span><span className="value">{m.visits}</span></div>
        <div className="astat"><span className="label">Cancelled, 30 days</span><span className="value">{m.cancels30}</span></div>
        <div className="astat"><span className="label">Complaints</span><span className="value">{m.complaints + tickets.length}</span></div>
      </div>
      <dl className="akv">
        <dt>Phone</dt><dd>{m.phone}</dd>
        <dt>Can take</dt><dd>{m.role === "compounder" ? "Wound dressing, elder care dressing, vitals" : m.tier === "full" ? "All nurse services" : "Dressing and vitals only (set by us)"}</dd>
        <dt>{m.role === "nurse" ? "Course" : "Training"}</dt><dd>{m.course}</dd>
        {m.role === "nurse" && <><dt>Council, reg. no.</dt><dd>{m.council} · {m.regNo}</dd><dt>Valid until</dt><dd>{monthText(m.validUntil)}{left !== null && left < 0 ? " (lapsed: dressing and vitals only until renewed)" : left !== null && left <= state.settings.renewalWarnDays ? ` (${left} days left)` : ""}</dd></>}
        <dt>Payouts to</dt><dd>Account ••••{m.bankLast4}</dd>
      </dl>

      {mode === "tier" && (
        <section className="acard" style={{ borderColor: "var(--a-primary)" }}>
          <h3>What can {m.name.split(" ")[0]} take?</h3>
          <div className="adm-col" role="radiogroup" aria-label="Visits they can take">
            {(["full", "basic"] as Tier[]).map((x) => (
              <label key={x} className="achoice"><input type="radio" name="mtier" checked={tier === x} onChange={() => setTier(x)} /><span>{TIER_TEXT[x]}</span></label>
            ))}
          </div>
          <p className="adm-small adm-muted">They get a notification in the caregiver app.</p>
        </section>
      )}

      {mode === "suspend" && (
        <section className="acard" style={{ borderColor: "var(--a-danger)" }}>
          <h3>Pause {m.name.split(" ")[0]}</h3>
          <p className="adm-small adm-muted">They go offline, get no new requests, and see this reason in the caregiver app. Visits already accepted should be reassigned in Bookings.</p>
          <div className="adm-col" role="radiogroup" aria-label="Reason">
            {SUSPEND_REASONS.map((r) => <label key={r} className="achoice"><input type="radio" name="sreason" checked={reason === r} onChange={() => setReason(r)} /><span>{r}</span></label>)}
            <label className="achoice"><input type="radio" name="sreason" checked={reason === "own"} onChange={() => setReason("own")} /><span>Write my own reason (shown in English)</span></label>
            {reason === "own" && (
              <label className="afield" htmlFor="adm-suspend-own"><span>Reason</span>
                <textarea id="adm-suspend-own" value={own} onChange={(e) => setOwn(e.target.value)} />
                {tried && finalReason.length < 10 && <span className="err" role="alert">Write at least a sentence.</span>}
              </label>
            )}
          </div>
        </section>
      )}

      <MemberDocs m={m} />
      <MemberHistory id={m.id} />

      <section className="adm-col">
        <h3>Recent bookings</h3>
        {recent.length === 0 ? <p className="adm-muted adm-small">{m.live ? "Visits from the caregiver app are sample requests and are not listed here." : "No bookings yet."}</p> : (
          <table className="atable">
            <tbody>
              {recent.map((b) => (
                <tr key={b.id}><td className="nowrap">{b.id}</td><td>{serviceName(b.serviceId)}</td><td className="nowrap">{dateTime(b.at)}</td><td>{STATUS_TEXT[b.status]}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </Drawer>
  );
}

/* ---------- Documents on file and history ---------- */

function MemberDocs({ m }: { m: MemberRow }) {
  const { cg, view } = useAdmin();
  const applicant = view.applicants.find((a) => a.id === m.id && !a.live);
  const docs = m.live
    ? { id: cg?.idProof?.photo ?? null, selfie: cg?.selfie ?? null, certificate: cg?.qualification?.certificate ?? null, renewal: cg?.renewal?.certificate ?? null }
    : applicant
      ? { id: applicant.idPhoto, selfie: applicant.selfie, certificate: applicant.certificate, renewal: null }
      : { ...sampleDocs(m), renewal: view.renewals.find((r) => r.memberId === m.id && !r.decision)?.certificate ?? null };
  return (
    <section className="adm-col">
      <h3>Documents on file</h3>
      <div className="adocs">
        <Doc file={docs.id} label="Government ID" />
        <Doc file={docs.selfie} label="Selfie" />
        <Doc file={docs.certificate} label={m.role === "nurse" ? "Registration certificate" : "Training certificate"} />
        {docs.renewal && <Doc file={docs.renewal} label="Renewed certificate (waiting)" />}
      </div>
    </section>
  );
}

const HISTORY_TONE: Record<HistoryKind, Tone> = {
  documents: "info", "sent-back": "warn", approved: "ok", tier: "info", paused: "danger", reinstated: "ok",
  "renewal-sent": "info", "renewal-approved": "ok", "renewal-refused": "warn", reminder: "muted",
};
type HistoryFilter = "all" | "documents" | "sent-back" | "paused";
const FILTER_KINDS: Record<HistoryFilter, HistoryKind[] | null> = {
  all: null,
  documents: ["documents", "renewal-sent", "renewal-approved", "renewal-refused", "reminder"],
  "sent-back": ["sent-back", "renewal-refused"],
  paused: ["paused", "reinstated"],
};

function MemberHistory({ id }: { id: string }) {
  const { view } = useAdmin();
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const all = view.historyOf(id);
  const list = all.filter((e) => !FILTER_KINDS[filter] || FILTER_KINDS[filter]!.includes(e.kind));
  const n = (f: HistoryFilter) => all.filter((e) => !FILTER_KINDS[f] || FILTER_KINDS[f]!.includes(e.kind)).length;
  return (
    <section className="adm-col">
      <div className="acard-head">
        <h3>History</h3>
        <div className="adm-row" role="group" aria-label="Show in history" style={{ gap: 6 }}>
          {([["all", "Everything"], ["documents", "Documents"], ["sent-back", "Send-backs"], ["paused", "Pauses"]] as [HistoryFilter, string][]).map(([f, label]) => (
            <button key={f} type="button" className={`abtn abtn-sm ${filter === f ? "abtn-primary" : ""}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>{label} ({n(f)})</button>
          ))}
        </div>
      </div>
      {list.length === 0 ? <p className="adm-small adm-muted">Nothing of this kind yet.</p> : (
        <div className="atimeline" data-testid="history">
          {list.map((e, i) => (
            <div key={i} className="adm-col" style={{ gap: 2 }}>
              <span className="adm-row" style={{ gap: 8 }}><Badge tone={HISTORY_TONE[e.kind]}>{HISTORY_TEXT[e.kind]}</Badge><span className="adm-small adm-muted">{dateTime(e.at)}{e.by ? ` · ${e.by}` : ""}</span></span>
              <span className="adm-small">{e.text}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
