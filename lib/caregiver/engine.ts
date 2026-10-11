"use client";

// CAREGIVER APP: things that happen on their own while the app is open (prototype stand-ins for the server).
//   - New requests are "offered" with a time limit, and run out if not answered.
//   - Nurses are reminded before their registration expires.
// TODO (backend): the server sends offers, expiries and reminders as push notifications instead.

import { useEffect, useState } from "react";
import { addDays, msg, newId, todayISO } from "@/lib/booking";
import { NO_SHOW_PAY, PATIENT_CANCEL_REASONS, serviceOf, type Job } from "./data";
import { isLateCancel, monthLabel, regStatus, timeLeft, visibleRequests, whenMsg } from "./rules";
import { useCg, type CgNotice, type CgState, type Earning } from "./store";

/** Re-draws every second (for countdowns). */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

const notice = (n: Omit<CgNotice, "id" | "at" | "read">): CgNotice => ({ ...n, id: newId("n"), at: Date.now(), read: false });

export function useCaregiverEngine() {
  const { state, update, jobs } = useCg();
  const approved = state.kycStatus === "approved" && !state.suspended; // a paused account gets no requests

  // Offers and expiry: checked every second while online.
  useEffect(() => {
    if (!approved || !state.online) return;
    const step = () =>
      update((prev) => {
        const nowMs = Date.now();
        // Requests that ran out of time.
        const runOut = jobs.filter((j) => {
          const left = timeLeft(j, prev, nowMs);
          return left !== null && left <= 0 && !prev.expired.includes(j.id) && !prev.declined.includes(j.id) && !prev.upcoming.some((u) => u.id === j.id);
        });
        const withExpired: CgState = runOut.length ? { ...prev, expired: [...prev.expired, ...runOut.map((j) => j.id)] } : prev;
        // Newly visible requests get their offer time now.
        const fresh = visibleRequests(withExpired, jobs).filter((j) => withExpired.offers[j.id] === undefined);
        if (!runOut.length && !fresh.length) return {};
        const offers = { ...withExpired.offers };
        for (const j of fresh) offers[j.id] = nowMs;
        const notices: CgNotice[] = [
          ...fresh.map((j) => notice({ kind: "request", title: msg("New request"), body: msg("{service} in {area}. Answer in time to get it.", { service: msg(serviceOf(j).name), area: j.area }), to: "jobs" })),
          ...runOut.map((j) => notice({ kind: "expired", title: msg("A request ran out of time"), body: msg("{service} in {area} went to another caregiver.", { service: msg(serviceOf(j).name), area: j.area }), to: "jobs" })),
        ];
        return { expired: withExpired.expired, offers, notices: [...notices, ...prev.notices].slice(0, 60) };
      });
    step();
    const id = setInterval(step, 1000);
    return () => clearInterval(id);
    // jobs only changes with the caregiver's city
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approved, state.online, state.personal?.cityId]);

  // Registration renewal reminder (nurses).
  const reg = regStatus(state.qualification, state.role);
  const until = state.qualification?.validUntil ?? "";
  useEffect(() => {
    if (!approved || (reg.status !== "soon" && reg.status !== "expired")) return;
    const key = `reg-${until}-${reg.status}`;
    update((prev) => {
      if (prev.notices.some((n) => n.key === key)) return {};
      const n = reg.status === "expired"
        ? notice({ kind: "document", key, title: msg("Your nursing registration has expired"), body: msg("Upload your renewed certificate to take injections, drips and medication again."), to: "renew" })
        : notice({ kind: "document", key, title: msg("Your registration expires soon"), body: msg("It is valid until {month}. Renew it before then to keep getting every kind of request.", { month: monthLabel(until) }), to: "renew" });
      return { notices: [n, ...prev.notices] };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approved, reg.status, until]);
}

/** Prototype: the patient cancels an accepted visit. Returns the state change. */
export function patientCancelPatch(prev: CgState, job: Job): Partial<CgState> {
  const setOff = prev.active?.jobId === job.id && prev.active.step >= 1;
  const late = isLateCancel(job, setOff);
  const paid = late ? NO_SHOW_PAY : 0;
  const service = msg(serviceOf(job).name);
  const reason = PATIENT_CANCEL_REASONS[job.patient.age % PATIENT_CANCEL_REASONS.length];
  const shortName = `${job.patient.first} ${job.patient.full.split(" ").slice(-1)[0].charAt(0)}.`;
  const earning: Earning | null = paid
    ? { id: newId("e"), at: Date.now(), kind: "late-cancel", title: msg("Late cancellation by the patient"), patient: shortName, amount: paid, cash: 0 }
    : null;
  return {
    upcoming: prev.upcoming.filter((j) => j.id !== job.id),
    active: prev.active?.jobId === job.id ? null : prev.active,
    earnings: earning ? [earning, ...prev.earnings] : prev.earnings,
    lastCancel: { title: service, patient: job.patient.first, when: whenMsg(job), reason, paid, late },
    notices: [
      notice({
        kind: "cancelled",
        title: msg("{name} cancelled the visit", { name: job.patient.first }),
        body: paid ? msg("{service}. You get the {fee} home visit charge.", { service, fee: `₹${paid}` }) : msg("{service}. Cancelled early, so there is no charge.", { service }),
        to: "earnings",
      }),
      ...prev.notices,
    ],
    screen: "patient-cancelled",
    trail: [],
  };
}

/** A "valid until" month about six weeks from now, so the renewal reminder shows in the prototype. */
export function sampleValidUntil() {
  const d = new Date(`${addDays(todayISO(), 40)}T00:00:00`);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
