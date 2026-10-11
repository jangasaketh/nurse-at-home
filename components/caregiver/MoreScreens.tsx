"use client";

// CAREGIVER APP (1.0.5): notifications, ratings and reviews, report a problem, payout history and statements,
// a visit cancelled by the patient, and renewing a nursing registration.

import { useEffect, useState } from "react";
import { useCg, type CgNotice, type Ticket } from "@/lib/caregiver/store";
import { REPORT_TOPICS } from "@/lib/caregiver/data";
import { maskAccount, monthLabel, regStatus, weekStart } from "@/lib/caregiver/rules";
import { dayInfo, money, msg, newId, timeAgo, tx } from "@/lib/booking";
import { useAction, useLoad } from "@/lib/fake-api";
import { t } from "@/lib/i18n";
import type { PhotoFile } from "@/lib/prescription";
import { Icon, Star, type IconName } from "../Icon";
import { PhotoPicker } from "../PhotoPicker";
import { ActionError, BottomBar, Chip, EmptyState, Header, Skeleton } from "../ui";

const isoDate = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const monthKey = (ms: number) => isoDate(ms).slice(0, 7);

/* ---------- Notifications ---------- */

const NOTICE_ICON: Record<CgNotice["kind"], IconName> = {
  request: "bell", cancelled: "calendar", payout: "wallet", document: "file", rating: "heart", verified: "shield", expired: "clock", support: "help",
};

export function CgNotificationsScreen() {
  const { state, set, open, back } = useCg();
  const load = useLoad(false);
  // Remember which were unread when the screen opened, so they stay highlighted while it is open.
  const [fresh] = useState(() => new Set(state.notices.filter((n) => !n.read).map((n) => n.id)));
  useEffect(() => {
    if (load.status === "ready" && state.notices.some((n) => !n.read)) set({ notices: state.notices.map((n) => ({ ...n, read: true })) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load.status]);

  return (
    <div className="screen">
      <Header title={t("Notifications")} onBack={() => back()} />
      <div className="scroll">
        {load.status === "loading" && <Skeleton rows={3} />}
        {load.status === "ready" && state.notices.length === 0 && (
          <EmptyState icon="bell" title={t("Nothing here yet")} body={t("New requests, cancellations, payouts and reminders show up here.")} />
        )}
        {load.status === "ready" && state.notices.map((n) => (
          <button type="button" key={n.id} className={`card notice notice-btn ${fresh.has(n.id) ? "" : "read"}`} onClick={() => n.to && open(n.to)}>
            <span className={`notice-icon kind-${n.kind}`}><Icon name={NOTICE_ICON[n.kind]} size={18} /></span>
            <span className="stack-xs" style={{ minWidth: 0, flex: 1, textAlign: "left" }}>
              <span className="strong">{tx(n.title)}</span>
              <span className="small" style={{ color: "var(--ink-soft)" }}>{tx(n.body)}</span>
              <span className="tiny muted">{timeAgo(n.at)}</span>
            </span>
            {fresh.has(n.id) && <span className="dot" aria-label={t("New")} />}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------- Ratings and reviews ---------- */

export function RatingsScreen() {
  const { state, back } = useCg();
  const reviews = state.reviews;
  const avg = reviews.length ? reviews.reduce((s, r) => s + r.stars, 0) / reviews.length : 0;
  const counts = [5, 4, 3, 2, 1].map((n) => ({ n, c: reviews.filter((r) => r.stars === n).length }));
  const tagCounts = new Map<string, number>();
  for (const r of reviews) for (const tag of r.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  const topTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);

  return (
    <div className="screen">
      <Header title={t("Ratings and reviews")} onBack={() => back()} />
      <div className="scroll">
        {reviews.length === 0 ? (
          <EmptyState icon="heart" title={t("No ratings yet")} body={t("After each visit the patient can rate you. Ratings show here.")} />
        ) : (
          <>
            <div className="card rating-summary">
              <div className="stack-xs" style={{ alignItems: "center" }}>
                <span className="rating-big">{avg.toFixed(1)}</span>
                <span className="row-inline" style={{ gap: 2 }} aria-label={t("{n} out of 5", { n: avg.toFixed(1) })}>
                  {[1, 2, 3, 4, 5].map((n) => <Star key={n} filled={n <= Math.round(avg)} size={16} />)}
                </span>
                <span className="small muted">{t("{n} ratings", { n: reviews.length })}</span>
              </div>
              <div className="stack-xs" style={{ flex: 1 }}>
                {counts.map(({ n, c }) => (
                  <div key={n} className="bar-row">
                    <span className="tiny muted">{n}</span>
                    <span className="bar"><span style={{ width: `${reviews.length ? (c / reviews.length) * 100 : 0}%` }} /></span>
                    <span className="tiny muted">{c}</span>
                  </div>
                ))}
              </div>
            </div>
            {topTags.length > 0 && (
              <div className="stack-sm">
                <h2>{t("What patients mention")}</h2>
                <div className="wrap">{topTags.map(([tag, c]) => <span key={tag} className="tag">{t(tag)} · {c}</span>)}</div>
              </div>
            )}
            <div className="stack">
              <h2>{t("Reviews")}</h2>
              {reviews.map((r) => (
                <div key={r.id} className="card stack-sm">
                  <div className="between">
                    <span className="row-inline" style={{ gap: 2 }} aria-label={t("{n} out of 5", { n: r.stars })}>
                      {[1, 2, 3, 4, 5].map((n) => <Star key={n} filled={n <= r.stars} size={16} />)}
                    </span>
                    <span className="tiny muted">{timeAgo(r.at)}</span>
                  </div>
                  <span>{tx(r.text)}</span>
                  <span className="small muted">{r.patient} · {tx(r.service)}{r.sample ? ` · ${t("Sample")}` : ""}</span>
                </div>
              ))}
            </div>
            <p className="small muted">{t("Only patients who had a visit with you can rate you. Ratings below 3 stars are read by our team.")}</p>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- Report a problem ---------- */

export function ReportScreen() {
  const { state, update, back } = useCg();
  const action = useAction(false);
  const [topic, setTopic] = useState<string | null>(null);
  const [visit, setVisit] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [photo, setPhoto] = useState<PhotoFile | null>(null);
  const [tried, setTried] = useState(false);
  const [sent, setSent] = useState<Ticket | null>(null);
  const recent = state.records.slice(0, 3);

  const send = () => {
    setTried(true);
    if (!topic || message.trim().length < 10) return;
    const ticket: Ticket = { id: `T-${String(Math.floor(1000 + Math.random() * 9000))}`, topic, visit, message: message.trim(), photo, at: Date.now(), status: "open" };
    // TODO: create a support ticket through the API (with the photo uploaded to private storage).
    action.run(() => {
      update((prev) => ({
        tickets: [ticket, ...prev.tickets],
        notices: [{ id: newId("n"), kind: "support", title: msg("We got your report {id}", { id: ticket.id }), body: msg("Our support team will call you on +91 {phone}.", { phone: prev.phone }), at: Date.now(), read: false, to: "report" }, ...prev.notices],
      }));
      setSent(ticket);
    });
  };

  return (
    <div className="screen">
      <Header title={t("Report a problem")} onBack={() => back()} />
      <div className="scroll">
        <div className="danger-box small">{t("If you or a patient are in danger, call 112 first.")}</div>
        {sent ? (
          <div className="tint-box stack-sm" role="status">
            <div className="strong">{t("We got your report {id}", { id: sent.id })}</div>
            <div className="small">{t("Our support team will call you on +91 {phone}.", { phone: state.phone })}</div>
            <button type="button" className="link-btn small" onClick={() => { setSent(null); setTopic(null); setVisit(null); setMessage(""); setPhoto(null); setTried(false); }}>{t("Report something else")}</button>
          </div>
        ) : (
          <>
            <div className="stack" style={{ gap: 6 }}>
              <span className="label">{t("What is it about?")}</span>
              <div className="wrap" role="group" aria-label={t("What is it about?")}>
                {REPORT_TOPICS.map((x) => <Chip key={x} className="chip-pill chip-toggle" selected={topic === x} onClick={() => setTopic(x)}>{t(x)}</Chip>)}
              </div>
              {tried && !topic && <div role="alert" className="error">{t("Choose what it is about.")}</div>}
            </div>
            {recent.length > 0 && (
              <div className="stack" style={{ gap: 6 }}>
                <span className="label">{t("Which visit? (optional)")}</span>
                <div className="wrap" role="group" aria-label={t("Which visit? (optional)")}>
                  {recent.map((r) => {
                    const label = `${tx(r.title)} · ${r.patient.split(" ")[0]}`;
                    return <Chip key={`${r.jobId}-${r.at}`} className="chip-pill chip-toggle" selected={visit === label} onClick={() => setVisit(visit === label ? null : label)}>{label}</Chip>;
                  })}
                </div>
              </div>
            )}
            <div className="stack" style={{ gap: 6 }}>
              <label htmlFor="cg-report">{t("What happened?")}</label>
              <textarea id="cg-report" className="text-input" value={message} onChange={(e) => setMessage(e.target.value)} />
              {tried && message.trim().length < 10 && <div role="alert" className="error">{t("Tell us a little more, at least a sentence.")}</div>}
            </div>
            <div className="stack" style={{ gap: 6 }}>
              <span className="label">{t("Photo (optional)")}</span>
              <PhotoPicker value={photo} onChange={setPhoto} testId="cg-report" allowPdf={false} tone="primary" label={t("Photo")} />
            </div>
          </>
        )}

        {state.tickets.length > 0 && (
          <div className="stack">
            <h2>{t("Your reports")}</h2>
            <div className="list">
              {state.tickets.map((tk) => (
                <div key={tk.id} className="list-row" style={{ alignItems: "flex-start" }}>
                  <span className="stack-xs" style={{ flex: 1, minWidth: 0 }}>
                    <span className="strong">{tk.id} · {t(tk.topic)}</span>
                    <span className="small muted">{tk.message.length > 70 ? `${tk.message.slice(0, 70)}…` : tk.message}</span>
                    <span className="tiny muted">{timeAgo(tk.at)}</span>
                  </span>
                  <span className={`pill ${tk.status === "open" ? "pill-role" : "pill-ok"}`}>{tk.status === "open" ? t("Open") : t("Resolved")}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      {!sent && (
        <BottomBar>
          {action.failed && <ActionError />}
          <button type="button" className="btn btn-primary" disabled={action.busy} onClick={send}>{action.busy ? t("Sending…") : t("Send to support")}</button>
        </BottomBar>
      )}
    </div>
  );
}

/* ---------- Payout history and monthly statement ---------- */

const KIND_CSV: Record<string, string> = { visit: "Visit", missed: "Missed visit", "late-cancel": "Late cancellation", stopped: "Stopped for safety" };

export function PayoutsScreen() {
  const { state, back } = useCg();
  const months = [0, 1, 2].map((ago) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - ago);
    return monthKey(d.getTime());
  });
  const [month, setMonth] = useState(months[0]);
  const inMonth = state.earnings.filter((e) => monthKey(e.at) === month);
  const paidInMonth = state.payouts.filter((p) => monthKey(p.at) === month);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const totals = {
    visits: inMonth.filter((e) => e.kind === "visit").length,
    other: sum(inMonth.filter((e) => e.kind !== "visit").map((e) => e.amount)),
    earned: sum(inMonth.map((e) => e.amount)),
    cash: sum(inMonth.map((e) => e.cash)),
    paid: sum(paidInMonth.map((p) => p.amount)),
  };
  const pending = state.earnings.filter((e) => e.at >= weekStart());
  const pendingAmount = sum(pending.map((e) => e.amount)) - sum(pending.map((e) => e.cash));

  // A spreadsheet file the caregiver can keep for their records. Built on the phone; no server needed.
  const download = () => {
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const rows: (string | number)[][] = [
      ["Nurse at Home - monthly statement", month],
      ["Name", state.personal?.name ?? ""],
      ["Bank account", state.bank ? maskAccount(state.bank.account) : ""],
      [],
      ["Date", "Type", "Service", "Patient", "Earned (Rs)", "Cash collected (Rs)"],
      ...inMonth.map((e) => [isoDate(e.at), KIND_CSV[e.kind] ?? e.kind, typeof e.title === "object" && "k" in e.title ? e.title.k : "", e.patient, e.amount, e.cash]),
      [],
      ["Payouts", "Reference", "Amount (Rs)"],
      ...paidInMonth.map((p) => [isoDate(p.at), p.reference, p.amount]),
      [],
      ["Visits done", totals.visits],
      ["Earned", totals.earned],
      ["Cash collected", totals.cash],
      ["Paid to bank", totals.paid],
    ];
    const csv = rows.map((r) => r.map(esc).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `statement-${month}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="screen">
      <Header title={t("Payouts and statements")} onBack={() => back()} />
      <div className="scroll">
        <div className="tint-box stack-xs">
          <span className="small">{t("Next payout, on Monday")}</span>
          <span className="strong" style={{ fontSize: 20 }}>{money(Math.max(0, pendingAmount))}</span>
        </div>

        <div className="stack">
          <h2>{t("Payout history")}</h2>
          {state.payouts.length === 0 ? (
            <EmptyState icon="wallet" title={t("No payouts yet")} body={t("Each Monday's payout shows here with its bank reference.")} />
          ) : (
            <div className="list">
              {state.payouts.map((p) => (
                <div key={p.id} className="list-row" style={{ alignItems: "flex-start" }}>
                  <span className="stack-xs" style={{ flex: 1, minWidth: 0 }}>
                    <span className="strong">{dayInfo(isoDate(p.at)).short} · {t("To {acc}", { acc: `•••• ${p.account}` })}</span>
                    <span className="small muted">{p.reference}{p.sample ? ` · ${t("Sample")}` : ""}</span>
                  </span>
                  <span className="stack-xs" style={{ alignItems: "flex-end" }}>
                    <span className="strong">{money(p.amount)}</span>
                    <span className="pill pill-ok">{t("Paid")}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="stack">
          <h2>{t("Monthly statement")}</h2>
          <div className="grid grid-3" role="group" aria-label={t("Monthly statement")}>
            {months.map((m) => <Chip key={m} selected={month === m} onClick={() => setMonth(m)}>{monthLabel(m)}</Chip>)}
          </div>
          <div className="card stack price-lines" style={{ gap: 8 }}>
            <div className="line"><span className="muted">{t("Visits done")}</span><span>{totals.visits}</span></div>
            <div className="line"><span className="muted">{t("Missed visits and late cancellations")}</span><span>{money(totals.other)}</span></div>
            <div className="line"><span className="muted">{t("Earned")}</span><span>{money(totals.earned)}</span></div>
            <div className="line"><span className="muted">{t("Cash you collected")}</span><span>{money(totals.cash)}</span></div>
            <div className="line total"><span>{t("Paid to your bank")}</span><span>{money(totals.paid)}</span></div>
          </div>
          <button type="button" className="btn btn-outline" onClick={download}><Icon name="download" size={20} />{t("Download statement (CSV)")}</button>
          <p className="small muted">{t("Opens in Excel or Google Sheets. Keep it for your records and tax filing.")}</p>
        </div>
      </div>
    </div>
  );
}

/* ---------- The patient cancelled ---------- */

export function PatientCancelledScreen() {
  const { state, go } = useCg();
  const c = state.lastCancel;
  if (!c) return null;
  return (
    <div className="screen">
      <div className="scroll" style={{ paddingTop: 36 }}>
        <span className="state-icon"><Icon name="calendar" size={24} /></span>
        <h1>{t("{name} cancelled the visit", { name: c.patient })}</h1>
        <p className="muted">{tx(c.title)} · {tx(c.when)}</p>
        <div className="card stack-xs">
          <span className="tiny muted strong">{t("Reason given")}</span>
          <span>{t(c.reason)}</span>
        </div>
        {c.paid > 0 ? (
          <div className="card between">
            <span className="stack-xs">
              <span className="strong">{t("You get")}</span>
              <span className="small muted">{t("It was cancelled less than 2 hours before the visit, or after you set off.")}</span>
            </span>
            <span className="earn">{money(c.paid)}</span>
          </div>
        ) : (
          <div className="tint-box small">{t("It was cancelled more than 2 hours before the visit, so there is no charge. The time is free for other requests.")}</div>
        )}
        <p className="small muted">{t("You do not need to do anything. The visit is removed from your schedule.")}</p>
      </div>
      <BottomBar><button type="button" className="btn btn-primary" onClick={() => go("jobs")}>{t("Back to jobs")}</button></BottomBar>
    </div>
  );
}

/* ---------- Renew a nursing registration ---------- */

export function RenewScreen() {
  const { state, update, back } = useCg();
  const action = useAction(false);
  const q = state.qualification;
  const reg = regStatus(q, state.role);
  const [certificate, setCertificate] = useState<PhotoFile | null>(null);
  const [validUntil, setValidUntil] = useState("");
  const [tried, setTried] = useState(false);
  const thisMonth = monthKey(Date.now());

  const untilError = !/^\d{4}-\d{2}$/.test(validUntil)
    ? t("Enter the month and year, like 2031-03.")
    : validUntil <= (q?.validUntil ?? thisMonth) || validUntil <= thisMonth
      ? t("The new date must be later than the current one.")
      : "";

  const send = () => {
    setTried(true);
    if (!certificate || untilError) return;
    // TODO: send the renewed certificate to the verification team (admin panel).
    action.run(() => update((prev) => ({
      renewal: { certificate, validUntil, at: Date.now() },
      notices: [{ id: newId("n"), kind: "document", title: msg("Renewal sent"), body: msg("We are checking your renewed certificate. You can keep working meanwhile."), at: Date.now(), read: false, to: "renew" }, ...prev.notices],
    })));
  };
  const approve = () =>
    update((prev) => prev.renewal && prev.qualification ? {
      qualification: { ...prev.qualification, validUntil: prev.renewal.validUntil, certificate: prev.renewal.certificate },
      renewal: null,
      notices: [{ id: newId("n"), kind: "verified", title: msg("Registration renewed"), body: msg("Your registration is now valid until {month}.", { month: monthLabel(prev.renewal.validUntil) }), at: Date.now(), read: false, to: "profile" }, ...prev.notices],
    } : {});

  return (
    <div className="screen">
      <Header title={t("Renew registration")} onBack={() => back()} />
      <div className="scroll">
        {q?.validUntil && (
          <div className={reg.status === "expired" ? "danger-box stack-xs" : reg.status === "soon" ? "warn-box stack-xs" : "tint-box stack-xs"}>
            <span className="strong">{reg.status === "expired" ? t("Expired in {month}", { month: monthLabel(q.validUntil) }) : t("Valid until {month}", { month: monthLabel(q.validUntil) })}</span>
            <span className="small">{t(q.council)} · {q.regNo}</span>
          </div>
        )}
        {state.renewal ? (
          <>
            <div className="tint-box stack-sm" role="status">
              <div className="strong">{t("Your renewed certificate is being checked")}</div>
              <div className="small">{t("New date: {month}. We will tell you when it is approved.", { month: monthLabel(state.renewal.validUntil) })}</div>
            </div>
            <div className="dashed-box stack">
              <button type="button" className="btn btn-demo" onClick={approve}>{t("Prototype: approve the renewal")}</button>
            </div>
          </>
        ) : (
          <>
            <p className="muted">{t("Renew with your state nursing council, then add the new certificate here. Our team checks it before the new date is used.")}</p>
            <div className="stack" style={{ gap: 6 }}>
              <span className="label">{t("Renewed registration certificate")}</span>
              <PhotoPicker value={certificate} onChange={setCertificate} testId="cg-renew" tone="primary" genericPdfMessage label={t("Registration certificate")}
                tip={t("The whole certificate, with your name, number and the new date readable.")} />
              {tried && !certificate && <div role="alert" className="error">{t("Add a photo of the renewed certificate.")}</div>}
            </div>
            <div className="stack" style={{ gap: 6 }}>
              <label htmlFor="cg-renew-until">{t("New valid-until month")}</label>
              <input id="cg-renew-until" className={`text-input ${tried && untilError ? "invalid" : ""}`} type="month" min={thisMonth} value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
              {tried && untilError && <div role="alert" className="error">{untilError}</div>}
            </div>
          </>
        )}
      </div>
      {!state.renewal && (
        <BottomBar>
          {action.failed && <ActionError />}
          <button type="button" className="btn btn-primary" disabled={action.busy} onClick={send}>{action.busy ? t("Sending…") : t("Send for checking")}</button>
        </BottomBar>
      )}
    </div>
  );
}

/** Banner on Jobs and Profile when a nurse's registration is about to expire, or has expired. */
export function RegistrationBanner() {
  const { state, open } = useCg();
  const q = state.qualification;
  const reg = regStatus(q, state.role);
  if (state.kycStatus !== "approved" || !q?.validUntil) return null;
  if (state.renewal) {
    return <div className="tint-box small" role="status">{t("Renewal sent. We are checking your new certificate.")}</div>;
  }
  if (reg.status === "soon") {
    return (
      <div className="warn-box stack-sm" role="status">
        <span className="strong">{t("Your registration expires in {n} days", { n: reg.daysLeft })}</span>
        <span className="small">{t("It is valid until {month}. Renew it to keep taking injections, drips and medication.", { month: monthLabel(q.validUntil) })}</span>
        <button type="button" className="btn btn-warn" onClick={() => open("renew")}>{t("Renew now")}</button>
      </div>
    );
  }
  if (reg.status === "expired") {
    return (
      <div className="danger-box stack-sm" role="alert">
        <span className="strong">{t("Your nursing registration has expired")}</span>
        <span className="small">{t("Until you renew it, you only get dressing and vitals requests.")}</span>
        <button type="button" className="btn btn-danger-solid" style={{ minHeight: 48, fontSize: 16 }} onClick={() => open("renew")}>{t("Renew now")}</button>
      </div>
    );
  }
  return null;
}
