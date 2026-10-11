"use client";

// ADMIN: caregiver verification (documents), renewed registrations, and registrations about to lapse.

import { useState } from "react";
import { useAdmin, type ApplicantRow, type RenewalRow } from "@/lib/admin/store";
import { KYC_STEPS, type KycStep } from "@/lib/caregiver/store";
import { IFSC_RE, isAdult } from "@/lib/caregiver/rules";
import * as link from "@/lib/admin/link";
import {
  ago, cityName, dateTime, daysUntilMonthEnd, monthText, REVIEW_CHECKS, SEND_BACK_REASONS, STEP_NAMES, TIER_TEXT, type Tier,
} from "@/lib/admin/data";
import { Badge, Doc, Drawer, Empty, LiveBadge, PageHead, Tabs, useToast } from "./ui";

type Tab = "waiting" | "sent-back" | "approved" | "renewals" | "expiring";

export const RENEWAL_REASONS = [
  "The certificate photo is not readable. Take it again so all the text is clear.",
  "The new date does not match the certificate. Check it and send again.",
];

const age = (dob: string) => {
  if (!dob) return "";
  const d = new Date(dob);
  const n = new Date();
  let a = n.getFullYear() - d.getFullYear();
  if (n < new Date(n.getFullYear(), d.getMonth(), d.getDate())) a--;
  return `${a} years`;
};
const roleText = (role: string) => (role === "nurse" ? "Registered nurse" : "Compounder");
const waitedHours = (ms: number, nowMs: number) => Math.floor((nowMs - ms) / 3600000);

export function VerificationPage() {
  const { view, cg, state, nowMs } = useAdmin();
  const [tab, setTab] = useState<Tab>("waiting");
  const [openId, setOpenId] = useState<string | null>(null);
  const [renewalId, setRenewalId] = useState<string | null>(null);

  const waiting = view.applicants.filter((a) => a.live || !a.decision).sort((a, b) => a.submittedAt - b.submittedAt);
  const sentBack = [
    ...(cg?.kycStatus === "rejected" && cg.rejected ? [{ id: "live", name: cg.personal?.name || "New caregiver", cityId: cg.personal?.cityId ?? "hyd", step: cg.rejected.step, reason: cg.rejected.reason, at: state.applicantDecisions.live?.at ?? nowMs, live: true }] : []),
    ...view.applicants.filter((a) => !a.live && a.decision?.status === "sent-back").map((a) => ({ id: a.id, name: a.name, cityId: a.cityId, step: a.decision!.step!, reason: a.decision!.reason ?? "", at: a.decision!.at, live: false })),
  ];
  const approved = [
    ...(state.applicantDecisions.live?.status === "approved" && view.live.member ? [{ id: "live", name: view.live.member.name, role: view.live.member.role, tier: view.live.member.tier, cityId: view.live.member.cityId, at: state.applicantDecisions.live.at, live: true }] : []),
    ...view.applicants.filter((a) => !a.live && a.decision?.status === "approved").map((a) => ({ id: a.id, name: a.name, role: a.role, tier: (a.role === "compounder" ? "basic" : a.decision!.tier ?? "full") as Tier, cityId: a.cityId, at: a.decision!.at, live: false })),
  ];
  const renewals = view.renewals.filter((r) => !r.decision);
  const expiring = view.members.filter((m) => m.role === "nurse" && !m.suspended && (daysUntilMonthEnd(m.validUntil, nowMs) ?? 999) <= state.settings.renewalWarnDays && !renewals.some((r) => r.memberId === m.id))
    .sort((a, b) => (daysUntilMonthEnd(a.validUntil, nowMs) ?? 0) - (daysUntilMonthEnd(b.validUntil, nowMs) ?? 0));

  const open = view.applicants.find((a) => a.id === openId && (a.live || !a.decision)) ?? null;
  const openRenewal = renewals.find((r) => r.id === renewalId) ?? null;

  return (
    <>
      <PageHead title="Verification" sub="Check each caregiver’s ID, selfie and qualification before their first visit. We tell caregivers it takes about 2 working days." />
      <Tabs label="Verification lists" value={tab} onChange={setTab} tabs={[
        { id: "waiting", label: "Waiting", n: waiting.length },
        { id: "sent-back", label: "Sent back", n: sentBack.length },
        { id: "approved", label: "Approved here", n: approved.length },
        { id: "renewals", label: "Renewals", n: renewals.length },
        { id: "expiring", label: "Expiring soon", n: expiring.length },
      ]} />

      {tab === "waiting" && (
        <section className="acard acard-flat">
          {waiting.length === 0 ? <Empty title="Nobody is waiting" body="New caregivers appear here when they send their documents from the caregiver app." /> : (
            <div className="atable-wrap">
              <table className="atable">
                <thead><tr><th>Caregiver</th><th>Role</th><th>City</th><th>Sent</th><th>Waiting</th><th>Notes</th><th /></tr></thead>
                <tbody>
                  {waiting.map((a) => {
                    const h = waitedHours(a.submittedAt, nowMs);
                    return (
                      <tr key={a.id} className="click" onClick={() => setOpenId(a.id)}>
                        <td><span className="adm-strong">{a.name}</span>{a.live && <> <LiveBadge /></>}{a.resubmitted && <> <Badge tone="info">Sent again</Badge></>}<span className="sub">{a.phone}</span></td>
                        <td>{roleText(a.role)}</td>
                        <td>{cityName(a.cityId)}<span className="sub">{a.area}</span></td>
                        <td className="nowrap">{dateTime(a.submittedAt)}</td>
                        <td>{h >= 48 ? <Badge tone="danger">{h} hours</Badge> : h >= 24 ? <Badge tone="warn">{h} hours</Badge> : <Badge>{h < 1 ? "Under 1 hour" : `${h} hours`}</Badge>}</td>
                        <td className="adm-small">{a.notes[0] ?? <span className="adm-muted">None</span>}</td>
                        <td><button type="button" className="abtn abtn-sm" onClick={(e) => { e.stopPropagation(); setOpenId(a.id); }}>Review</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === "sent-back" && (
        <section className="acard acard-flat">
          {sentBack.length === 0 ? <Empty title="Nothing sent back" body="When you ask a caregiver to fix a document, they appear here until they send it again." /> : (
            <div className="atable-wrap">
              <table className="atable">
                <thead><tr><th>Caregiver</th><th>City</th><th>Document</th><th>Reason given</th><th>Sent back</th><th /></tr></thead>
                <tbody>
                  {sentBack.map((r) => (
                    <tr key={r.id}>
                      <td><span className="adm-strong">{r.name}</span>{r.live && <> <LiveBadge /></>}</td>
                      <td>{cityName(r.cityId)}</td>
                      <td>{STEP_NAMES[r.step]}</td>
                      <td className="adm-small">{r.reason}</td>
                      <td className="nowrap">{ago(r.at, nowMs)}</td>
                      <td>{r.live ? <span className="adm-small adm-muted">Waiting for them to fix it in the app</span> : <ResendButton id={r.id} name={r.name} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === "approved" && (
        <section className="acard acard-flat">
          {approved.length === 0 ? <Empty title="Nobody approved here yet" body="Caregivers you approve appear here, and in the Caregivers list." /> : (
            <div className="atable-wrap">
              <table className="atable">
                <thead><tr><th>Caregiver</th><th>Role</th><th>Can take</th><th>City</th><th>Approved</th></tr></thead>
                <tbody>
                  {approved.map((r) => (
                    <tr key={r.id}>
                      <td><span className="adm-strong">{r.name}</span>{r.live && <> <LiveBadge /></>}</td>
                      <td>{roleText(r.role)}</td>
                      <td>{TIER_TEXT[r.tier]}</td>
                      <td>{cityName(r.cityId)}</td>
                      <td className="nowrap">{dateTime(r.at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === "renewals" && (
        <section className="acard acard-flat">
          {renewals.length === 0 ? <Empty title="No renewals to check" body="Nurses send a renewed registration certificate from the caregiver app before theirs lapses." /> : (
            <div className="atable-wrap">
              <table className="atable">
                <thead><tr><th>Nurse</th><th>City</th><th>Valid until now</th><th>New date</th><th>Sent</th><th /></tr></thead>
                <tbody>
                  {renewals.map((r) => {
                    const left = daysUntilMonthEnd(r.member?.validUntil, nowMs);
                    return (
                      <tr key={r.id} className="click" onClick={() => setRenewalId(r.id)}>
                        <td><span className="adm-strong">{r.member?.name}</span>{r.live && <> <LiveBadge /></>}<span className="sub">Reg. no. {r.member?.regNo} · {r.member?.council}</span></td>
                        <td>{cityName(r.member?.cityId ?? "")}</td>
                        <td>{monthText(r.member?.validUntil)} {left !== null && left < 0 ? <Badge tone="danger">Lapsed</Badge> : <Badge tone="warn">{left} days left</Badge>}</td>
                        <td className="adm-strong">{monthText(r.validUntil)}</td>
                        <td className="nowrap">{ago(r.sentAt, nowMs)}</td>
                        <td><button type="button" className="abtn abtn-sm" onClick={(e) => { e.stopPropagation(); setRenewalId(r.id); }}>Check</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === "expiring" && <ExpiringList members={expiring} />}

      {open && <ReviewDrawer a={open} onClose={() => setOpenId(null)} />}
      {openRenewal && <RenewalDrawer r={openRenewal} onClose={() => setRenewalId(null)} />}
    </>
  );
}

/* ---------- Sent back: the sample caregiver sends the document again ---------- */

function ResendButton({ id, name }: { id: string; name: string }) {
  const { update, log } = useAdmin();
  const toast = useToast();
  return (
    <button type="button" className="abtn abtn-sm" onClick={() => {
      update((prev) => { const d = { ...prev.applicantDecisions }; delete d[id]; return { applicantDecisions: d }; });
      log(`${name} sent the document again (prototype)`, "verification");
      toast(`${name} is back in the Waiting list`);
    }}>Prototype: they send it again</button>
  );
}

/* ---------- Review one caregiver ---------- */

function autoChecks(a: ApplicantRow, nowMs: number) {
  const left = daysUntilMonthEnd(a.validUntil, nowMs);
  const first = a.name.trim().toLowerCase().split(/\s+/)[0] ?? "";
  const list: { ok: boolean | null; text: string }[] = [
    { ok: a.dob ? isAdult(a.dob) : null, text: a.dob ? `Age ${age(a.dob)}` : "Date of birth missing" },
    { ok: IFSC_RE.test(a.bank.ifsc), text: `IFSC code ${a.bank.ifsc || "missing"}` },
    { ok: !!first && a.bank.holder.toLowerCase().includes(first), text: `Bank account name: ${a.bank.holder || "missing"}` },
  ];
  if (a.role === "nurse") {
    list.push({ ok: left === null ? null : left > 0, text: left === null ? "Registration valid until: not given" : left < 0 ? `Registration lapsed (${monthText(a.validUntil)})` : `Registration valid until ${monthText(a.validUntil)} (${left} days)` });
  } else {
    list.push({ ok: null, text: a.refName ? `Reference to call: ${a.refName}${a.refPhone ? `, ${a.refPhone}` : ""}` : "No reference given. Check the training certificate carefully." });
  }
  return list;
}

function ReviewDrawer({ a, onClose }: { a: ApplicantRow; onClose: () => void }) {
  const { update, log, refreshCg, nowMs } = useAdmin();
  const toast = useToast();
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [mode, setMode] = useState<"approve" | "send-back" | null>(null);
  const [tier, setTier] = useState<Tier>("full");
  const [step, setStep] = useState<KycStep>("id");
  const [reason, setReason] = useState<string>(SEND_BACK_REASONS.id[0]);
  const [own, setOwn] = useState("");
  const [tried, setTried] = useState(false);

  const allChecks = Object.entries(REVIEW_CHECKS).flatMap(([sec, items]) => items.filter((x) => a.role === "nurse" ? !x.includes("(compounders)") : !x.includes("(nurses)")).map((x) => `${sec}:${x}`));
  const allTicked = allChecks.every((k) => ticked[k]);
  const finalReason = reason === "own" ? own.trim() : reason;

  const approve = () => {
    setTried(true);
    if (!allTicked) return;
    const t: Tier = a.role === "compounder" ? "basic" : tier;
    if (a.live && !link.approveLive(t)) { toast("The caregiver app data could not be changed. Is storage blocked?"); return; }
    update((prev) => ({ applicantDecisions: { ...prev.applicantDecisions, [a.id]: { status: "approved", tier: t, at: Date.now() } } }));
    log(`Approved ${a.name} (${roleText(a.role)}, ${TIER_TEXT[t].toLowerCase()})`, "verification");
    refreshCg();
    toast(`${a.name} is approved${a.live ? ". The caregiver app shows it now." : ""}`);
    onClose();
  };
  const sendBack = () => {
    setTried(true);
    if (finalReason.length < 10) return;
    if (a.live && !link.sendBackLive(step, finalReason)) { toast("The caregiver app data could not be changed. Is storage blocked?"); return; }
    update((prev) => ({ applicantDecisions: { ...prev.applicantDecisions, [a.id]: { status: "sent-back", step, reason: finalReason, at: Date.now() } } }));
    log(`Sent back ${a.name}'s ${STEP_NAMES[step].toLowerCase()}: “${finalReason}”`, "verification");
    refreshCg();
    toast(`Sent back to ${a.name}`);
    onClose();
  };

  const footer = mode === null ? (
    <>
      <button type="button" className="abtn" onClick={() => { setMode("send-back"); setTried(false); }}>Send a document back</button>
      <button type="button" className="abtn abtn-primary" onClick={() => { setMode("approve"); setTried(false); }}>Approve…</button>
    </>
  ) : mode === "approve" ? (
    <>
      <button type="button" className="abtn" onClick={() => setMode(null)}>Cancel</button>
      <button type="button" className="abtn abtn-primary" onClick={approve}>Approve {a.name.split(" ")[0]}</button>
    </>
  ) : (
    <>
      <button type="button" className="abtn" onClick={() => setMode(null)}>Cancel</button>
      <button type="button" className="abtn abtn-danger" onClick={sendBack}>Send back</button>
    </>
  );

  return (
    <Drawer label={`Review ${a.name}`} onClose={onClose} footer={footer}
      title={<span className="adm-row">{a.name} <Badge tone="info">{roleText(a.role)}</Badge>{a.live && <LiveBadge />}</span>}
      sub={`Sent ${ago(a.submittedAt, nowMs)} · ${cityName(a.cityId)}${a.resubmitted ? " · sent again after a fix" : ""}`}>
      {a.live && <div className="anote info">This is the caregiver you signed up in the caregiver app, in this browser. What you decide here shows in that app straight away.</div>}
      {a.notes.map((n) => <div key={n} className="anote">{n}</div>)}

      <div className="adocs">
        <Doc file={a.idPhoto} label={`${a.idType} (last 4: ${a.idLast4 || "—"})`} />
        <Doc file={a.selfie} label="Selfie" />
        <Doc file={a.certificate} label={a.role === "nurse" ? "Registration certificate" : "Training certificate"} />
      </div>

      <div className="agrid agrid-2" style={{ alignItems: "start" }}>
        <section className="adm-col">
          <h3>Details</h3>
          <dl className="akv">
            <dt>Phone</dt><dd>{a.phone}</dd>
            <dt>Gender, age</dt><dd>{a.gender === "F" ? "Woman" : a.gender === "M" ? "Man" : "—"}, {age(a.dob) || "—"}</dd>
            <dt>Works in</dt><dd>{a.area}, {cityName(a.cityId)} {a.pincode}</dd>
            <dt>Speaks</dt><dd>{a.languages.join(", ") || "—"}</dd>
            <dt>{a.role === "nurse" ? "Course" : "Training"}</dt><dd>{a.course || "—"}</dd>
            {a.role === "nurse" && <><dt>Council, reg. no.</dt><dd>{a.council} · {a.regNo}</dd><dt>Valid until</dt><dd>{monthText(a.validUntil)}</dd></>}
            <dt>Experience</dt><dd>{a.years ? `${a.years} years` : "—"}</dd>
            {a.role === "compounder" && <><dt>Reference</dt><dd>{a.refName ? `${a.refName}${a.refPhone ? `, ${a.refPhone}` : ""}` : "None given"}</dd></>}
            <dt>Bank account</dt><dd>{a.bank.holder} · {a.bank.account} · {a.bank.ifsc}{a.bank.upi ? ` · ${a.bank.upi}` : ""}</dd>
          </dl>
        </section>
        <section className="adm-col">
          <h3>Checked automatically</h3>
          <div className="adm-col" style={{ gap: 6 }}>
            {autoChecks(a, nowMs).map((c) => (
              <div key={c.text} className="adm-row adm-small" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
                <Badge tone={c.ok === null ? "info" : c.ok ? "ok" : "danger"}>{c.ok === null ? "Check" : c.ok ? "OK" : "Problem"}</Badge><span>{c.text}</span>
              </div>
            ))}
          </div>
          <h3 style={{ marginTop: 8 }}>Your checks</h3>
          <div className="achecks">
            {Object.entries(REVIEW_CHECKS).map(([sec, items]) => items
              .filter((x) => a.role === "nurse" ? !x.includes("(compounders)") : !x.includes("(nurses)"))
              .map((x) => {
                const k = `${sec}:${x}`;
                return (
                  <label key={k}><input type="checkbox" checked={!!ticked[k]} onChange={(e) => setTicked((cur) => ({ ...cur, [k]: e.target.checked }))} />{STEP_NAMES[sec]}: {x.replace(/ \((nurses|compounders)\)/, "")}</label>
                );
              }))}
          </div>
          <button type="button" className="abtn abtn-ghost abtn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setTicked(Object.fromEntries(allChecks.map((k) => [k, true])))}>Tick all checks</button>
        </section>
      </div>

      {mode === "approve" && (
        <section className="acard" style={{ borderColor: "var(--a-primary)" }}>
          <h3>Approve</h3>
          {a.role === "nurse" ? (
            <div className="adm-col" role="radiogroup" aria-label="Visits they can take">
              <label className="achoice"><input type="radio" name="tier" checked={tier === "full"} onChange={() => setTier("full")} /><span><b>All nurse services</b><br /><span className="adm-small adm-muted">Injections, IV drips, medication, dressing and vitals.</span></span></label>
              <label className="achoice"><input type="radio" name="tier" checked={tier === "basic"} onChange={() => setTier("basic")} /><span><b>Dressing and vitals only, for now</b><br /><span className="adm-small adm-muted">For example while the council registration is still being confirmed. You can change this later in Caregivers.</span></span></label>
            </div>
          ) : <p className="adm-small">Compounders can take wound dressing, elder care dressing and vitals checks.</p>}
          {tried && !allTicked && <div className="anote danger" role="alert">Tick every check before approving.</div>}
        </section>
      )}

      {mode === "send-back" && (
        <section className="acard" style={{ borderColor: "var(--a-danger)" }}>
          <h3>Send a document back</h3>
          <p className="adm-small adm-muted">The caregiver sees the reason and fixes only this step. Everything else they sent is kept.</p>
          <div className="adm-row" role="radiogroup" aria-label="Which document">
            {KYC_STEPS.map((s) => (
              <label key={s} className="achoice"><input type="radio" name="step" checked={step === s} onChange={() => { setStep(s); setReason(SEND_BACK_REASONS[s][0]); }} />{STEP_NAMES[s]}</label>
            ))}
          </div>
          <div className="adm-col" role="radiogroup" aria-label="Reason">
            {SEND_BACK_REASONS[step].map((r) => (
              <label key={r} className="achoice"><input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} /><span>{r}</span></label>
            ))}
            <label className="achoice"><input type="radio" name="reason" checked={reason === "own"} onChange={() => setReason("own")} /><span>Write my own reason (shown in English)</span></label>
            {reason === "own" && (
              <label className="afield" htmlFor="adm-own-reason"><span>Reason</span>
                <textarea id="adm-own-reason" value={own} onChange={(e) => setOwn(e.target.value)} placeholder="Say what is wrong and what to do." />
                {tried && finalReason.length < 10 && <span className="err" role="alert">Write at least a sentence.</span>}
              </label>
            )}
          </div>
        </section>
      )}
    </Drawer>
  );
}

/* ---------- Renewed registration ---------- */

function RenewalDrawer({ r, onClose }: { r: RenewalRow; onClose: () => void }) {
  const { update, log, refreshCg, nowMs } = useAdmin();
  const toast = useToast();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState(RENEWAL_REASONS[0]);
  const name = r.member?.name ?? "Nurse";

  const approve = () => {
    if (r.live && !link.approveRenewalLive()) { toast("The caregiver app data could not be changed."); return; }
    update((prev) => ({
      renewalDecisions: { ...prev.renewalDecisions, [r.id]: { status: "approved", at: Date.now() } },
      memberEdits: r.live ? prev.memberEdits : { ...prev.memberEdits, [r.memberId]: { ...prev.memberEdits[r.memberId], validUntil: r.validUntil } },
    }));
    log(`Approved ${name}'s renewed registration, valid until ${monthText(r.validUntil)}`, "verification");
    refreshCg();
    toast(`${name}'s registration is renewed`);
    onClose();
  };
  const reject = () => {
    if (r.live && !link.rejectRenewalLive(reason)) { toast("The caregiver app data could not be changed."); return; }
    update((prev) => ({ renewalDecisions: { ...prev.renewalDecisions, [r.id]: { status: "rejected", reason, at: Date.now() } } }));
    log(`Sent back ${name}'s renewal: “${reason}”`, "verification");
    refreshCg();
    toast(`Renewal sent back to ${name}`);
    onClose();
  };

  return (
    <Drawer narrow label={`Renewal for ${name}`} onClose={onClose}
      title={<span className="adm-row">{name}{r.live && <LiveBadge />}</span>}
      sub={`Renewed registration, sent ${ago(r.sentAt, nowMs)}`}
      footer={rejecting ? (
        <><button type="button" className="abtn" onClick={() => setRejecting(false)}>Cancel</button><button type="button" className="abtn abtn-danger" onClick={reject}>Send back</button></>
      ) : (
        <><button type="button" className="abtn" onClick={() => setRejecting(true)}>Send back…</button><button type="button" className="abtn abtn-primary" onClick={approve}>Approve renewal</button></>
      )}>
      <Doc file={r.certificate} label="Renewed certificate" />
      <dl className="akv">
        <dt>Council, reg. no.</dt><dd>{r.member?.council} · {r.member?.regNo}</dd>
        <dt>Valid until now</dt><dd>{monthText(r.member?.validUntil)}</dd>
        <dt>New date</dt><dd className="adm-strong">{monthText(r.validUntil)}</dd>
      </dl>
      <div className="anote info">Check that the certificate shows the same registration number and the new date. Look it up on the state council’s website if in doubt.</div>
      {rejecting && (
        <div className="adm-col" role="radiogroup" aria-label="Reason">
          {RENEWAL_REASONS.map((x) => <label key={x} className="achoice"><input type="radio" name="rreason" checked={reason === x} onChange={() => setReason(x)} /><span>{x}</span></label>)}
        </div>
      )}
    </Drawer>
  );
}

/* ---------- Registrations about to lapse ---------- */

function ExpiringList({ members }: { members: ReturnType<typeof useAdmin>["view"]["members"] }) {
  const { state, update, log, refreshCg, nowMs } = useAdmin();
  const toast = useToast();
  const remind = (id: string, name: string, live?: boolean) => {
    if (live) link.remindRenewalLive();
    update((prev) => ({ reminders: { ...prev.reminders, [id]: Date.now() } }));
    log(`Sent a renewal reminder to ${name}`, "verification");
    refreshCg();
    toast(`Reminder sent to ${name}`);
  };
  if (members.length === 0) return <section className="acard"><Empty title="No registrations lapsing soon" /></section>;
  return (
    <section className="acard acard-flat">
      <div className="atable-wrap">
        <table className="atable">
          <thead><tr><th>Nurse</th><th>City</th><th>Valid until</th><th>What happens</th><th>Last reminder</th><th /></tr></thead>
          <tbody>
            {members.map((m) => {
              const left = daysUntilMonthEnd(m.validUntil, nowMs) ?? 0;
              const last = state.reminders[m.id];
              return (
                <tr key={m.id}>
                  <td><span className="adm-strong">{m.name}</span>{m.live && <> <LiveBadge /></>}<span className="sub">Reg. no. {m.regNo} · {m.council}</span></td>
                  <td>{cityName(m.cityId)}</td>
                  <td className="nowrap">{monthText(m.validUntil)} {left < 0 ? <Badge tone="danger">Lapsed</Badge> : <Badge tone="warn">{left} days</Badge>}</td>
                  <td className="adm-small">{left < 0 ? "Gets only dressing and vitals requests until renewed." : "The caregiver app reminds them. Injection and drip requests stop when it lapses."}</td>
                  <td className="nowrap">{last ? ago(last, nowMs) : <span className="adm-muted">Never</span>}</td>
                  <td><button type="button" className="abtn abtn-sm" onClick={() => remind(m.id, m.name, m.live)}>Send reminder</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
