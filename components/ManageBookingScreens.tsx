"use client";

// Cancel a visit, or move it to another day or time.
// The rule itself (when it is free, when a charge is kept) lives in lib/booking.ts and lib/data.ts.

import { useState } from "react";
import { useApp } from "@/lib/store";
import { CANCEL_REASONS, FREE_UNTIL_HOURS, SLOTS, VISIT_FEE } from "@/lib/data";
import {
  addDays, canReschedule, cancelTerms, changeFee, dayAt, dayInfo, describeBooking, feeReasonText, isFreeAt, money,
  newId, todayISO, type VisitRecord,
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

/** Shown whenever a charge is kept: the one case where support can waive it. */
function WaiveNote() {
  const { open } = useApp();
  return (
    <p className="small muted">
      If the patient was hospitalised or got worse,{" "}
      <button type="button" className="text-link" onClick={() => open("help")}>tell support</button>
      {" "}and we will waive this charge.
    </p>
  );
}

export function CancelScreen() {
  const { state, set, back, notify } = useApp();
  const action = useAction(state.simulateFailure);
  const [scope, setScope] = useState<"one" | "all">("one");
  const [reason, setReason] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [now] = useState(() => Date.now()); // the charge is worked out for the moment the screen opened

  const booking = state.booking;
  if (!booking) return <NotPossible title="No visit to cancel" body="You have no upcoming visit." />;
  const b = describeBooking(booking);
  const terms = cancelTerms(booking, state.step, b.isCourse ? scope : "one", now, state.caregiverLate);
  if (!terms.allowed) {
    return <NotPossible title="This visit cannot be cancelled now" body="Care has already started. If something is wrong, press SOS on the visit screen or contact support." />;
  }

  const wholeCourse = b.isCourse && scope === "all" && b.remaining > 1;
  const moneyLine = terms.paidOnline
    ? `${money(terms.refund)} goes back to your ${booking.pay === "upi" ? "UPI account" : "card"}.`
    : terms.due > 0
      ? `The ${money(terms.due)} home visit charge will be added to your next booking.`
      : "You have not been charged anything.";

  const confirm = () => {
    setTried(true);
    if (!reason) return;
    // TODO: cancel through the API, which also starts the refund and pays the caregiver any kept charge.
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
      set({
        booking: next,
        step: 0,
        caregiverLate: false,
        // Cash bookings: a charge kept now, plus any earlier unpaid charge this booking was going to collect.
        arrears: state.arrears + terms.due + (next === null && !terms.paidOnline ? booking.carried : 0),
        history: [record, ...state.history],
        screen: "bookings",
        trail: [],
      });
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
          <div className="small">{feeReasonText(terms.why, b.who)}</div>
        </div>
        {terms.kept > 0 && <WaiveNote />}
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
  const [now] = useState(() => Date.now());

  if (!booking) return <NotPossible title="No visit to move" body="You have no upcoming visit." />;
  if (!canReschedule(booking, state.step)) {
    return <NotPossible title="This visit cannot be moved now" body="The nurse has already set off, or this is an urgent visit. You can still cancel it, or contact support." />;
  }
  const b = describeBooking(booking);
  const isCurrent = (s: string) => dayIdx === current && s === booking.slot;
  // Moving a visit at the last moment costs the same as cancelling it late: the caregiver held the slot.
  const { fee, why } = changeFee(booking, state.step, now, state.caregiverLate);
  const cash = booking.pay === "cash";

  const save = () => {
    setTried(true);
    if (!slot) return;
    // TODO: move the visit through the API, which re-checks the caregiver's calendar and takes any charge.
    action.run(() => {
      const newDate = addDays(todayISO(), dayIdx);
      // A course keeps its rhythm: the remaining visits move with this one.
      const startDate = addDays(newDate, -(booking.visitNo - 1) * booking.everyDays);
      set({
        booking: { ...booking, startDate, slot },
        caregiverLate: false,
        arrears: state.arrears + (cash ? fee : 0),
        screen: "bookings",
        trail: [],
      });
      const charge = fee === 0 ? "" : cash
        ? ` The ${money(fee)} late-change charge will be added to your next booking.`
        : ` A ${money(fee)} late-change charge was taken from your ${booking.pay === "upi" ? "UPI account" : "card"}.`;
      notify("Visit moved", `${b.service.name} is now on ${dayInfo(newDate).full}, ${slot}, with ${b.caregiver.name}.${charge}`);
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
        </div>

        <div className={fee > 0 ? "warn-box stack-sm" : "tint-box stack-sm"}>
          <div className="strong">
            {fee > 0 ? `Moving this visit now costs ${money(VISIT_FEE)}.` : "Moving this visit is free."}
          </div>
          <div className="small">
            {fee > 0
              ? `The visit is less than ${FREE_UNTIL_HOURS} hours away, so the ${b.who} is paid the home visit charge for the slot they held.`
              : feeReasonText(why, b.who)}
            {b.isCourse && b.remaining > 1 ? ` The other ${b.remaining - 1} visits in this course move with it.` : ""}
          </div>
        </div>
        {fee > 0 && <WaiveNote />}
      </div>
      <BottomBar>
        {action.failed && <ActionError>The visit was not moved. Check your internet connection and try again.</ActionError>}
        <button type="button" className="btn btn-primary" disabled={action.busy} onClick={save}>
          {action.busy ? "Saving…" : fee > 0 ? `Save new time · ${money(fee)}` : "Save new time"}
        </button>
      </BottomBar>
    </div>
  );
}
