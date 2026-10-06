"use client";

// Cancel a visit, or move it to another day or time.

import { useState } from "react";
import { useApp } from "@/lib/store";
import { CANCEL_REASONS, SLOTS } from "@/lib/data";
import {
  addDays, canReschedule, cancelTerms, dayAt, dayInfo, describeBooking, isFreeAt, money, newId, todayISO,
  type VisitRecord,
} from "@/lib/booking";
import { useAction } from "@/lib/fake-api";
import { ActionError, BottomBar, Chip, Header, RadioCard, Rows } from "./ui";

function NotPossible({ title, body }: { title: string; body: string }) {
  const { back, open } = useApp();
  return (
    <div className="screen">
      <Header title="Your visit" onBack={() => back()} />
      <div className="scroll">
        <h1>{title}</h1>
        <p className="muted">{body}</p>
        <button type="button" className="btn btn-outline" onClick={() => open("help")}>Contact support</button>
      </div>
    </div>
  );
}

export function CancelScreen() {
  const { state, set, back, notify } = useApp();
  const action = useAction(state.simulateFailure);
  const [scope, setScope] = useState<"one" | "all">("one");
  const [reason, setReason] = useState<string | null>(null);
  const [tried, setTried] = useState(false);

  const booking = state.booking;
  if (!booking) return <NotPossible title="No visit to cancel" body="You have no upcoming visit." />;
  const b = describeBooking(booking);
  const terms = cancelTerms(booking, state.step, b.isCourse ? scope : "one");
  if (!terms.allowed) {
    return <NotPossible title="This visit cannot be cancelled now" body="Care has already started. If something is wrong, press SOS on the visit screen or contact support." />;
  }

  const wholeCourse = b.isCourse && scope === "all" && b.remaining > 1;
  const moneyLine = terms.paidOnline
    ? `${money(terms.refund)} goes back to your ${booking.pay === "upi" ? "UPI account" : "card"}.`
    : terms.due > 0
      ? `The ${money(terms.due)} home visit charge is still to be paid.`
      : "You have not been charged anything.";
  const keptLine = terms.kept > 0 && terms.paidOnline
    ? `The ${money(terms.kept)} home visit charge is kept, because the ${b.who} has already set off.`
    : terms.kept > 0
      ? `This is because the ${b.who} has already set off.`
      : `Cancelling is free until the ${b.who} sets off.`;

  const confirm = () => {
    setTried(true);
    if (!reason) return;
    // TODO: cancel through the API, which also starts the refund.
    action.run(() => {
      const title = wholeCourse
        ? `${b.service.name}, visits ${booking.visitNo} to ${booking.visits}`
        : b.isCourse
          ? `${b.service.name}, visit ${booking.visitNo} of ${booking.visits}`
          : b.service.name;
      const record: VisitRecord = {
        id: newId("v"),
        status: "cancelled",
        title,
        when: b.when,
        who: b.patient.chip === "Me" ? "You" : b.patient.chip,
        by: b.caregiver.name,
        note: `Cancelled. Reason: ${reason}.`,
        readings: [],
      };
      // Cancelling one visit of a course moves on to the next one. Anything else closes the booking.
      const next = b.isCourse && scope === "one" && b.hasNext ? { ...booking, visitNo: booking.visitNo + 1 } : null;
      set({ booking: next, step: 0, history: [record, ...state.history], screen: "bookings", trail: [] });
      notify(wholeCourse ? "Visits cancelled" : "Visit cancelled", `${title}. ${moneyLine}`);
    });
  };

  return (
    <div className="screen">
      <Header title="Cancel visit" onBack={() => back()} />
      <div className="scroll">
        <h1>Cancel this visit?</h1>
        <Rows
          items={[
            { k: "Service", v: b.service.name },
            { k: "When", v: b.when },
            { k: "Patient", v: b.patient.full },
            { k: "Caregiver", v: b.caregiver.name },
          ]}
        />

        {b.isCourse && b.remaining > 1 && (
          <div className="stack">
            <h2>What do you want to cancel?</h2>
            <RadioCard selected={scope === "one"} onClick={() => setScope("one")} label={`Only ${b.visitLabel.toLowerCase()}`} sub="The rest of the course carries on." />
            <RadioCard selected={scope === "all"} onClick={() => setScope("all")} label={`All ${b.remaining} remaining visits`} sub="The course ends here." />
          </div>
        )}

        <div className="stack">
          <h2>Why are you cancelling?</h2>
          {CANCEL_REASONS.map((r) => (
            <RadioCard key={r} selected={reason === r} onClick={() => setReason(r)} label={r} />
          ))}
          {tried && !reason && <div role="alert" className="error">Choose a reason to continue.</div>}
        </div>

        <div className={terms.kept > 0 ? "warn-box stack-sm" : "tint-box stack-sm"}>
          <div className="strong">{moneyLine}</div>
          <div className="small">{keptLine}</div>
        </div>
      </div>
      <BottomBar>
        {action.failed && <ActionError>The visit was not cancelled. Check your internet connection and try again.</ActionError>}
        <button type="button" className="btn btn-danger-solid" disabled={action.busy} onClick={confirm}>
          {action.busy ? "Cancelling…" : wholeCourse ? `Cancel ${b.remaining} visits` : "Cancel visit"}
        </button>
        <button type="button" className="btn btn-plain" onClick={() => back()}>Keep my booking</button>
      </BottomBar>
    </div>
  );
}

export function RescheduleScreen() {
  const { state, set, back, notify } = useApp();
  const action = useAction(state.simulateFailure);
  const booking = state.booking;
  const current = booking ? dayInfo(describeBooking(booking).visitDate).offset : 0;
  const [dayIdx, setDayIdx] = useState(Math.min(4, Math.max(0, current)));
  const [slot, setSlot] = useState<string | null>(null);
  const [tried, setTried] = useState(false);

  if (!booking) return <NotPossible title="No visit to move" body="You have no upcoming visit." />;
  if (!canReschedule(booking, state.step)) {
    return <NotPossible title="This visit cannot be moved now" body="The nurse has already set off, or this is an urgent visit. You can still cancel it, or contact support." />;
  }
  const b = describeBooking(booking);
  const isCurrent = (s: string) => dayIdx === current && s === booking.slot;

  const save = () => {
    setTried(true);
    if (!slot) return;
    // TODO: move the visit through the API, which re-checks the caregiver's calendar.
    action.run(() => {
      const newDate = addDays(todayISO(), dayIdx);
      // A course keeps its rhythm: the remaining visits move with this one.
      const startDate = addDays(newDate, -(booking.visitNo - 1) * booking.everyDays);
      set({ booking: { ...booking, startDate, slot }, screen: "bookings", trail: [] });
      notify("Visit moved", `${b.service.name} is now on ${dayInfo(newDate).full}, ${slot}, with ${b.caregiver.name}.`);
    });
  };

  return (
    <div className="screen">
      <Header title="Reschedule" onBack={() => back()} />
      <div className="scroll gap-lg">
        <div className="stack" style={{ gap: 6 }}>
          <h1>Pick a new day and time</h1>
          <p className="muted">Now: {b.when}, with {b.caregiver.name}.</p>
        </div>

        <div className="stack">
          <h2>Day</h2>
          <div className="grid grid-5">
            {[0, 1, 2, 3, 4].map((i) => {
              const day = dayAt(i);
              return (
                <Chip key={i} className="chip-day" selected={i === dayIdx} onClick={() => { setDayIdx(i); setSlot(null); }}>
                  <span className="tiny">{day.weekday}</span>
                  <span className="num">{day.date}</span>
                </Chip>
              );
            })}
          </div>
        </div>

        <div className="stack">
          <h2>Arrival time</h2>
          <div className="grid grid-3">
            {SLOTS.map((s) => {
              const busy = !isFreeAt(b.caregiver, s);
              const unavailable = busy || isCurrent(s);
              return (
                <button
                  type="button"
                  key={s}
                  className="chip"
                  aria-pressed={slot === s}
                  aria-disabled={unavailable}
                  onClick={() => { if (!unavailable) setSlot(s); }}
                >
                  {s}
                  {busy ? <span className="sub">{b.caregiver.first} is busy</span> : isCurrent(s) ? <span className="sub">Current time</span> : null}
                </button>
              );
            })}
          </div>
          {tried && !slot && <div role="alert" className="error">Pick a new arrival time.</div>}
          <p className="small muted">
            Free of charge until the {b.who} sets off.
            {b.isCourse && b.remaining > 1 ? ` The other ${b.remaining - 1} visits in this course move with it.` : ""}
          </p>
        </div>
      </div>
      <BottomBar>
        {action.failed && <ActionError>The visit was not moved. Check your internet connection and try again.</ActionError>}
        <button type="button" className="btn btn-primary" disabled={action.busy} onClick={save}>
          {action.busy ? "Saving…" : "Save new time"}
        </button>
      </BottomBar>
    </div>
  );
}
