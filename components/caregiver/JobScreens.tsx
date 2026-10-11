"use client";

// CAREGIVER APP: going online, new requests, and the details of one request or accepted visit.

import { useState } from "react";
import { useCg } from "@/lib/caregiver/store";
import { checksOf, DECLINE_REASONS, earningFor, isUrgent, serviceOf, slotHour, visitPrice, type Job } from "@/lib/caregiver/data";
import { clock, courseText, courseWho, directionsUrl, offerWindowMs, patientLine, timeLeft, visibleRequests, whenText } from "@/lib/caregiver/rules";
import { patientCancelPatch, useNow } from "@/lib/caregiver/engine";
import { RegistrationBanner } from "./MoreScreens";
import { money } from "@/lib/booking";
import { useAction } from "@/lib/fake-api";
import { t } from "@/lib/i18n";
import { Icon } from "../Icon";
import { InstallCard } from "../InstallCard";
import { ActionError, BottomBar, EmptyState, Header, RadioCard, Rows } from "../ui";

const sortJobs = (jobs: Job[]) =>
  [...jobs].sort((a, b) => a.dateOffset - b.dateOffset || (isUrgent(b) ? 1 : 0) - (isUrgent(a) ? 1 : 0) || slotHour(a.slot) - slotHour(b.slot));

/* ---------- Jobs (home) ---------- */

export function JobsScreen() {
  const { state, set, update, open, jobs, jobById } = useCg();
  const first = (state.personal?.name ?? "").split(" ")[0];
  const requests = visibleRequests(state, jobs);
  const activeJob = state.active ? jobById(state.active.jobId) : null;
  const next = sortJobs(state.upcoming).find((j) => j.id !== state.active?.jobId) ?? null;

  const now = useNow();
  const unread = state.notices.filter((n) => !n.read).length;
  // Going offline hands unanswered requests back; they are offered again (with a fresh time limit) when back online.
  const toggle = () => update((prev) => ({ online: !prev.online, offers: prev.online ? {} : prev.offers, requestIds: prev.requestIds ?? jobs.map((j) => j.id) }));
  const startVisit = (job: Job) =>
    open("visit", { active: { jobId: job.id, step: 0, late: 0, waitStartedAt: null, waitSkipped: false, checks: {} }, openJobId: job.id });

  return (
    <div className="screen">
      <div className="scroll scroll-top" style={{ gap: 20 }}>
        <div className="between" style={{ alignItems: "flex-start" }}>
          <div className="stack-xs" style={{ minWidth: 0 }}>
            <div className="row-inline" style={{ flexWrap: "wrap", gap: "4px 8px" }}>
              <span className="muted" style={{ fontSize: 15 }}>{first ? t("Hello, {name}", { name: first }) : t("Hello")}</span>
              <span className="pill pill-role"><Icon name="shield" size={14} />{state.role === "nurse" ? t("Registered nurse") : t("Compounder")}</span>
            </div>
            <h1 style={{ fontSize: 26 }}>{state.online ? t("You are online") : t("You are offline")}</h1>
          </div>
          <div className="row-inline" style={{ gap: 10, flex: "none" }}>
            <button type="button" className="bell" aria-label={unread ? t("Notifications, {n} new", { n: unread }) : t("Notifications")} onClick={() => open("notifications")}>
              <Icon name="bell" size={22} />
              {unread > 0 && <span className="badge">{unread}</span>}
            </button>
          </div>
        </div>

        <button type="button" role="switch" aria-checked={state.online} className={`online-card ${state.online ? "on" : ""}`} onClick={toggle}>
          <span className="stack-xs" style={{ flex: 1, textAlign: "left" }}>
            <span className="strong">{state.online ? t("Getting requests") : t("Go online")}</span>
            <span className="small">{state.online ? t("Requests near {area} appear below.", { area: state.personal?.area ?? "" }) : t("Go online to get visit requests near you.")}</span>
          </span>
          <span className="switch" aria-hidden="true"><span /></span>
        </button>

        <RegistrationBanner />

        {activeJob && state.active && (
          <button type="button" className="upcoming" onClick={() => open("visit", { openJobId: activeJob.id })}>
            <span className="stack-xs" style={{ flex: 1, textAlign: "left" }}>
              <span className="tiny" style={{ opacity: 0.85 }}>{t("Visit in progress")}</span>
              <span className="strong">{t(serviceOf(activeJob).name)} · {activeJob.patient.first}</span>
            </span>
            <Icon name="next" size={22} />
          </button>
        )}

        {next && (
          <div className="card stack" style={{ gap: 10 }}>
            <div className="between">
              <span className="tiny muted strong">{t("Next visit")}</span>
              {isUrgent(next) && <span className="pill pill-urgent">{t("Urgent")}</span>}
            </div>
            <button type="button" className="stack-xs job-link" onClick={() => open("job", { openJobId: next.id })}>
              <span className="strong" style={{ fontSize: 17 }}>{t(serviceOf(next).name)} · {next.patient.first}</span>
              <span className="small muted">{whenText(next)} · {next.area}</span>
            </button>
            {!state.active && <button type="button" className="btn btn-outline" onClick={() => startVisit(next)}>{t("Start this visit")}</button>}
          </div>
        )}

        {state.online ? (
          <div className="stack">
            <h2>{requests.length ? t("New requests ({n})", { n: requests.length }) : t("New requests")}</h2>
            {requests.length === 0 ? (
              <EmptyState icon="bell" title={t("No new requests right now")}
                body={t("Stay online. New requests near you appear here. If you expected more, check your work settings.")}
                action={
                  <div className="stack-sm" style={{ width: "100%" }}>
                    <button type="button" className="btn btn-outline" onClick={() => open("availability")}>{t("Work settings")}</button>
                    <button type="button" className="link-btn small" style={{ alignSelf: "center" }} onClick={() => set({ requestIds: null, declined: [], expired: [], offers: {} })}>{t("Prototype: bring back the sample requests")}</button>
                  </div>
                } />
            ) : (
              requests.map((job) => <RequestCard key={job.id} job={job} left={timeLeft(job, state, now)} onOpen={() => open("job", { openJobId: job.id })} />)
            )}
          </div>
        ) : (
          <div className="tint-box stack-sm">
            <div className="strong">{t("When you are online")}</div>
            <ul className="install-steps small">
              <li>{t("Requests that match your skills, area and hours are sent to you.")}</li>
              <li>{t("You see what you will earn before you accept.")}</li>
              <li>{t("Go offline any time. Visits you accepted stay booked.")}</li>
            </ul>
          </div>
        )}

        {!state.installDismissed && <InstallCard onDismiss={() => set({ installDismissed: true })} />}
      </div>
    </div>
  );
}

function RequestCard({ job, left, onOpen }: { job: Job; left: number | null; onOpen: () => void }) {
  const service = serviceOf(job);
  const course = courseText(job);
  return (
    <button type="button" className="card job-card" onClick={onOpen}>
      <span className="between" style={{ alignItems: "flex-start" }}>
        <span className="row-inline" style={{ gap: 10, alignItems: "flex-start" }}>
          <span className="icon-bubble"><Icon name={service.icon} /></span>
          <span className="stack-xs">
            <span className="strong" style={{ fontSize: 17 }}>{t(service.name)}</span>
            <span className="small muted">{whenText(job)}</span>
          </span>
        </span>
        <span className="stack-xs" style={{ alignItems: "flex-end" }}>
          {isUrgent(job) && <span className="pill pill-urgent">{t("Urgent")}</span>}
          {left !== null && <span className={`timer-pill ${left < 60000 ? "hurry" : ""}`} role="timer">{t("{time} left", { time: clock(left) })}</span>}
        </span>
      </span>
      <span className="meta muted">
        <span className="row-inline" style={{ gap: 4 }}><Icon name="pin" size={16} />{job.area} · {t("{km} km away", { km: job.distanceKm })}</span>
        <span>{patientLine(job)}</span>
      </span>
      {course && <span className="small strong">{course}</span>}
      <span className="wrap" style={{ gap: 6 }}>
        {service.needsPrescription && <span className="tag">{t("Prescription")}</span>}
        {job.womenOnly && <span className="tag">{t("Woman caregiver requested")}</span>}
        <span className="tag">{job.pay === "cash" ? t("Cash or UPI at the visit") : t("Paid online")}</span>
      </span>
      <span className="between earn-line">
        <span className="small muted">{t("You earn")}</span>
        <span className="earn">{money(earningFor(job).total)}</span>
      </span>
    </button>
  );
}

/* ---------- One request, or an accepted visit ---------- */

export function JobScreen() {
  const { state, update, open, back, go, jobById } = useCg();
  const action = useAction(false);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [clash, setClash] = useState<string | null>(null);
  const [callNote, setCallNote] = useState(false);

  const now = useNow();
  const job = jobById(state.openJobId);
  const accepted0 = !!job && state.upcoming.some((j) => j.id === job.id);
  const left = job && !accepted0 ? timeLeft(job, state, now) : null;
  const ranOut = !!job && !accepted0 && (state.expired.includes(job.id) || (left !== null && left <= 0));
  if (job && ranOut) {
    return (
      <div className="screen">
        <Header title={t("Visit request")} onBack={() => back()} />
        <div className="scroll">
          <EmptyState icon="clock" title={t("This request ran out of time")} body={t("It went to another caregiver. Answer within the time shown to get a request.")}
            action={<button type="button" className="btn btn-outline" onClick={() => go("jobs")}>{t("Back to jobs")}</button>} />
        </div>
      </div>
    );
  }
  if (!job) {
    return (
      <div className="screen">
        <Header title={t("Visit request")} onBack={() => back()} />
        <div className="scroll"><EmptyState icon="bell" title={t("This request is no longer available")} body={t("Another caregiver may have taken it, or the patient cancelled.")} /></div>
      </div>
    );
  }
  const service = serviceOf(job);
  const accepted = state.upcoming.some((j) => j.id === job.id);
  const pay = earningFor(job);
  const price = visitPrice(job);
  const course = courseText(job);
  const checks = checksOf(job);
  const isActive = state.active?.jobId === job.id;

  const accept = () => {
    setClash(null);
    if (isUrgent(job) && state.active) return setClash(t("Finish your current visit before taking an urgent one."));
    if (!isUrgent(job) && state.upcoming.some((j) => j.dateOffset === job.dateOffset && j.slot === job.slot)) {
      return setClash(t("You already have a visit at this time."));
    }
    // TODO: accept through the API. It must check nobody else took the request first.
    action.run(() => update((prev) => ({ upcoming: sortJobs([...prev.upcoming, job]) })));
  };
  const decline = () => {
    setTried(true);
    if (!reason) return;
    update((prev) => ({ declined: [...prev.declined, job.id], screen: "jobs", trail: [] }));
  };
  const startVisit = () =>
    open("visit", { active: { jobId: job.id, step: 0, late: 0, waitStartedAt: null, waitSkipped: false, checks: {} }, openJobId: job.id });

  return (
    <div className="screen">
      <Header title={accepted ? t("Accepted visit") : t("Visit request")} onBack={() => back()} />
      <div className="scroll">
        <div className="stack" style={{ gap: 6 }}>
          <div className="row-inline" style={{ gap: 10 }}>
            <span className="icon-bubble"><Icon name={service.icon} /></span>
            <h1 style={{ fontSize: 24 }}>{t(service.name)}</h1>
          </div>
          <div className="row-inline" style={{ flexWrap: "wrap" }}>
            <span className="muted">{whenText(job)}</span>
            {isUrgent(job) && <span className="pill pill-urgent">{t("Urgent")}</span>}
          </div>
          {course && <div className="small strong">{course}. {courseWho(job)}</div>}
        </div>

        {left !== null && (
          <div className={left < 60000 ? "danger-box between" : "warn-box between"} role="timer">
            <span className="small strong">{t("Answer within")}</span>
            <span className="wait-timer" style={{ fontSize: 26 }}>{clock(left)}</span>
          </div>
        )}

        {accepted && (
          <div className="tint-box stack-sm">
            <div className="strong row-inline"><Icon name="check" size={18} strokeWidth={2.5} />{t("You accepted this visit. {name} has been told.", { name: job.patient.first })}</div>
          </div>
        )}

        <Rows items={[
          { k: t("Patient"), v: accepted ? `${job.patient.full}, ${job.patient.age}` : patientLine(job) },
          { k: accepted ? t("Address") : t("Area"), v: accepted ? job.address : `${job.area} · ${t("{km} km away", { km: job.distanceKm })}` },
          ...(accepted ? [{ k: t("Landmark"), v: t(job.landmark) }] : []),
          { k: t("Speaks"), v: t(job.language) },
          { k: t("Payment"), v: job.pay === "cash" ? t("Collect {amount} in cash or UPI", { amount: money(price.total) }) : t("Paid online") },
        ]} />

        {accepted ? (
          <div className="actions">
            <a className="btn btn-outline" href={directionsUrl(job)} target="_blank" rel="noopener noreferrer"><Icon name="pin" size={20} />{t("Directions")}</a>
            <button type="button" className="btn btn-outline" onClick={() => setCallNote(true)}><Icon name="phone" size={20} />{t("Call")}</button>
          </div>
        ) : (
          <p className="small muted">{t("The full address and phone number are shown after you accept.")}</p>
        )}
        {callNote && <p className="small muted">{t("Calls are switched off in the prototype. In the real app they go through us, so phone numbers stay private.")}</p>}

        <div className="card stack-sm">
          <span className="tiny muted strong">{t("From the patient")}</span>
          <span>{t(job.note)}</span>
        </div>

        {checks.length > 0 && (
          <div className="card stack-sm">
            <span className="tiny muted strong">{t("Checks booked")}</span>
            <span className="strong">{checks.map((c) => t(c.name)).join(", ")}</span>
          </div>
        )}

        {service.needsPrescription && (
          <div className="warn-box small">{t("Prescription needed. The patient has added one. You check it against the medicine before you start.")}</div>
        )}

        <div className="card stack-sm">
          <span className="tiny muted strong">{t("Bring")}</span>
          <span>{t(service.nurseBrings)}</span>
          <span className="tiny muted strong" style={{ marginTop: 6 }}>{t("The patient keeps ready")}</span>
          <span>{t(service.youKeepReady)}</span>
        </div>

        <div className="card stack price-lines" style={{ gap: 8 }}>
          <div className="line"><span className="muted">{t("Your share of the service")}</span><span>{money(pay.service)}</span></div>
          <div className="line"><span className="muted">{t("Home visit charge")}</span><span>{money(pay.visitFee)}</span></div>
          {pay.urgent > 0 && <div className="line"><span className="muted">{t("Urgent visit extra")}</span><span>{money(pay.urgent)}</span></div>}
          <div className="line total"><span>{job.visits > 1 ? t("You earn per visit") : t("You earn")}</span><span>{money(pay.total)}</span></div>
          {job.visits > 1 && <div className="small muted">{t("{n} visits · {amount} in total", { n: job.visits - job.visitNo + 1, amount: money(pay.total * (job.visits - job.visitNo + 1)) })}</div>}
        </div>

        {declining && !accepted && (
          <div className="stack">
            <h2>{t("Why are you declining?")}</h2>
            {DECLINE_REASONS.map((r) => <RadioCard key={r} selected={reason === r} onClick={() => setReason(r)} label={t(r)} />)}
            {tried && !reason && <div role="alert" className="error">{t("Choose a reason to continue.")}</div>}
            <p className="small muted">{t("Declining is fine. It does not lower your rating.")}</p>
          </div>
        )}
      </div>

      <BottomBar>
        {clash && <div role="alert" className="error" style={{ marginBottom: 10 }}>{clash}</div>}
        {action.failed && <ActionError />}
        {accepted ? (
          <div className="stack-sm">
            {isActive ? (
              <button type="button" className="btn btn-primary" onClick={() => open("visit")}>{t("Continue the visit")}</button>
            ) : !state.active ? (
              <button type="button" className="btn btn-primary" onClick={startVisit}>{t("Start this visit")}</button>
            ) : (
              <p className="small muted">{t("Finish your current visit before starting another.")}</p>
            )}
            {!isActive && <button type="button" className="btn btn-plain" onClick={() => open("cancel-visit", { openJobId: job.id })}>{t("I cannot do this visit")}</button>}
            {!isActive && <button type="button" className="btn btn-plain" onClick={() => go("jobs")}>{t("Back to jobs")}</button>}
            {/* Prototype: stands in for the patient cancelling in their app. Remove before launch. */}
            {!(isActive && (state.active?.step ?? 0) >= 3) && (
              <button type="button" className="link-btn small" style={{ alignSelf: "center" }} onClick={() => update((prev) => patientCancelPatch(prev, job))}>{t("Prototype: the patient cancels")}</button>
            )}
          </div>
        ) : declining ? (
          <div className="stack-sm">
            <button type="button" className="btn btn-danger" onClick={decline}>{t("Decline request")}</button>
            <button type="button" className="btn btn-plain" onClick={() => setDeclining(false)}>{t("Keep the request")}</button>
          </div>
        ) : (
          <div className="stack-sm">
            <button type="button" className="btn btn-primary" disabled={action.busy} onClick={accept}>
              {action.busy ? t("Accepting…") : t("Accept · earn {amount}", { amount: money(pay.total) })}
            </button>
            <button type="button" className="btn btn-plain" onClick={() => setDeclining(true)}>{t("Decline")}</button>
            <button type="button" className="link-btn small" style={{ alignSelf: "center" }}
              onClick={() => update((prev) => ({ offers: { ...prev.offers, [job.id]: Date.now() - offerWindowMs(job) - 1000 } }))}>
              {t("Prototype: let the time run out")}
            </button>
          </div>
        )}
      </BottomBar>
    </div>
  );
}
