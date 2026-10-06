"use client";

import { useState } from "react";
import { useApp } from "@/lib/store";
import { ARRIVAL_CODE, LATE_MINUTES, NO_SHOW_MINUTES, VISIT_FEE } from "@/lib/data";
import { canReschedule, describeBooking, money, newId } from "@/lib/booking";
import { Icon, Star } from "./Icon";
import { BottomBar, Header } from "./ui";

/* Live visit tracking */
export function TrackingScreen() {
  const { state, set, go, open, notify } = useApp();
  const [sos, setSos] = useState(false);
  const [contactNote, setContactNote] = useState(false);

  if (!state.booking) return <NoBooking />;
  const booking = state.booking;
  const b = describeBooking(booking);
  const first = b.caregiver.first;
  const step = state.step;

  const titles = [`${first} accepted your booking`, `${first} is on the way`, `${first} is at your door`, "Care in progress"];
  const subs = [
    `Visit set for ${b.when}.`,
    `${b.caregiver.distance} away. You will get an alert on arrival.`,
    "Share the arrival code to start the visit.",
    `${b.service.name} for ${b.patient.name}. About ${b.service.mins}.`,
  ];
  const steps = ["Booking accepted", `${first} is on the way`, `${first} has arrived`, "Care in progress"];
  const demoLabels = ["Prototype: nurse sets off", "Prototype: nurse arrives", "Prototype: start the care", "Prototype: finish the visit"];

  // There is no live nurse yet, so this button stands in for real status updates.
  const advance = () => {
    if (step < 3) {
      set({ step: step + 1 });
      if (step === 0) notify(`${first} is on the way`, `${b.service.name} for ${b.patient.name}. ${b.caregiver.distance} away.`);
      if (step === 1) notify(`${first} has arrived`, "Share your arrival code at the door to start the visit.");
      return;
    }
    set({
      screen: "done",
      trail: [],
      history: [
        {
          id: newId("v"),
          status: "completed",
          title: b.isCourse ? `${b.service.name}, visit ${booking.visitNo} of ${booking.visits}` : b.service.name,
          when: b.when,
          who: b.patient.chip === "Me" ? "You" : b.patient.chip,
          by: b.caregiver.name,
          note: b.service.note,
          readings: b.readings.map((r) => ({ name: r.name, value: r.sample })),
        },
        ...state.history,
      ],
    });
    notify("Visit completed", `The record of your ${b.service.name.toLowerCase()} visit is saved under Records.`);
  };

  const watcher = booking.notifyContact ? state.contact : null;

  // Ends this visit without care being given. A course moves on to its next visit.
  const endVisit = (status: "cancelled" | "missed", note: string, chargeKept: boolean) => {
    set({
      booking: b.hasNext ? { ...booking, visitNo: booking.visitNo + 1 } : null,
      step: 0,
      caregiverLate: false,
      // Cash bookings: nothing was collected, so the charge (and any earlier unpaid one) moves to the next booking.
      arrears: state.arrears + (booking.pay === "cash" ? (chargeKept ? VISIT_FEE : 0) + (b.hasNext ? 0 : booking.carried) : 0),
      history: [
        {
          id: newId("v"),
          status,
          title: b.isCourse ? `${b.service.name}, visit ${booking.visitNo} of ${booking.visits}` : b.service.name,
          when: b.when,
          who: b.patient.chip === "Me" ? "You" : b.patient.chip,
          by: b.caregiver.name,
          note,
          readings: [],
        },
        ...state.history,
      ],
      screen: "bookings",
      trail: [],
    });
  };
  const visitPrice = booking.unitPrice + VISIT_FEE + (booking.visits === 1 ? booking.urgentFee : 0);

  // RULE: the caregiver waits at the door, then the visit counts as missed and the home visit charge is kept.
  const nobodyHome = () => {
    endVisit("missed", `Nobody answered the door for ${NO_SHOW_MINUTES} minutes. The home visit charge was kept and paid to ${first}.`, true);
    notify("Visit missed", booking.pay === "cash"
      ? `${first} waited ${NO_SHOW_MINUTES} minutes at your door. The ${money(VISIT_FEE)} home visit charge will be added to your next booking.`
      : `${first} waited ${NO_SHOW_MINUTES} minutes at your door. ${money(visitPrice - VISIT_FEE)} is refunded and the ${money(VISIT_FEE)} home visit charge is kept.`);
  };

  // RULE: if the caregiver cancels, the patient pays nothing.
  const caregiverCancels = () => {
    endVisit("cancelled", `Cancelled by ${first}. You were not charged for this visit.`, false);
    notify(`${first} had to cancel`, booking.pay === "cash"
      ? "You have not been charged. You can book another nurse from Home."
      : `${money(visitPrice)} is refunded in full. You can book another nurse from Home.`);
  };

  return (
    <div className="screen">
      <Header
        title="Your visit"
        onBack={() => go("home")}
        backLabel="Back to home"
        right={<button type="button" className="sos" onClick={() => setSos(!sos)}>SOS</button>}
      />
      <div className="scroll" style={{ gap: 16 }}>
        {sos && (
          <div role="alert" className="danger-box stack-sm">
            <div className="strong">Emergency help</div>
            <div style={{ fontSize: 15 }}>
              Call 112 now. In the real app this button also alerts our support team
              {state.contact ? ` and ${state.contact.name} (+91 ${state.contact.phone})` : " and your emergency contact, once you add one in Profile"}.
            </div>
          </div>
        )}

        {state.caregiverLate && step < 2 && (
          <div className="warn-box stack-sm">
            <div className="strong">{first} is more than {LATE_MINUTES} minutes late</div>
            <div className="sub">We are sorry. You can wait, or cancel free of charge.</div>
          </div>
        )}

        <div className="stack-sm">
          {b.isCourse && <div className="pill">{b.visitLabel}</div>}
          <h1>{titles[step]}</h1>
          <p className="muted">{subs[step]}</p>
        </div>

        {/* TODO: replace with a real map (Google Maps) and live location. */}
        <div className="map">
          <svg viewBox="0 0 350 132" preserveAspectRatio="none" fill="none" aria-hidden="true">
            <path d="M40 96 C 110 96, 110 40, 180 40 S 260 84, 310 44" stroke="currentColor" strokeWidth="3" strokeDasharray="2 9" strokeLinecap="round" />
            <circle cx="40" cy="96" r="8" fill="currentColor" />
            <circle cx="310" cy="44" r="10" fill="#FFFFFF" stroke="currentColor" strokeWidth="3" />
          </svg>
          <div className="label">Live map goes here</div>
        </div>

        <div className="card row-inline" style={{ gap: 12, padding: "14px 16px" }}>
          <span className="avatar" style={{ width: 48, height: 48 }}>{b.caregiver.initials}</span>
          <span className="stack-xs" style={{ flex: 1, minWidth: 0, gap: 0 }}>
            <span className="strong">{b.caregiver.name}</span>
            <span className="small muted">{b.caregiver.qualification}</span>
            <span className="tiny muted">{b.caregiver.regLine}</span>
          </span>
          <button type="button" className="round-btn" aria-label="Call caregiver" onClick={() => setContactNote(true)}><Icon name="phone" size={20} /></button>
          <button type="button" className="round-btn" aria-label="Message caregiver" onClick={() => setContactNote(true)}><Icon name="message" size={20} /></button>
        </div>
        {contactNote && (
          <p className="small muted">
            Calls and chat are switched off in the prototype. In the real app they go through us, so phone numbers stay private.
          </p>
        )}

        {watcher && (
          <p className="small muted">{watcher.name} is getting updates on this visit.</p>
        )}

        <div className="warn-box between" style={{ padding: "14px 16px" }}>
          <div className="stack-xs">
            <span className="strong">Arrival code</span>
            <span className="sub">Tell the nurse only at your door.</span>
          </div>
          <div className="arrival-code">{ARRIVAL_CODE}</div>
        </div>

        <div className="card stack" style={{ gap: 14 }}>
          {steps.map((label, i) => (
            <div key={label} className={`step ${i <= step ? "done" : ""} ${i === step ? "current" : ""}`}>
              <span className="dot"><Icon name="check" size={12} strokeWidth={4} /></span>
              <span>{label}</span>
            </div>
          ))}
        </div>

        {step < 3 && (
          <div className="stack">
            <h2>Need to change this visit?</h2>
            <div className="actions">
              {canReschedule(booking, step) && (
                <button type="button" className="btn btn-outline" onClick={() => open("reschedule")}>Reschedule</button>
              )}
              <button type="button" className="btn btn-danger" style={{ minHeight: 48 }} onClick={() => open("cancel")}>Cancel visit</button>
            </div>
          </div>
        )}

        {/* There is no live nurse yet, so these buttons stand in for real events. Remove them before launch. */}
        <div className="dashed-box stack">
          <button type="button" className="btn btn-demo" onClick={advance}>{demoLabels[step]}</button>
          {step < 2 && !state.caregiverLate && (
            <button type="button" className="link-btn" onClick={() => set({ caregiverLate: true })}>
              Prototype: nurse is {LATE_MINUTES} minutes late
            </button>
          )}
          {step === 2 && (
            <button type="button" className="link-btn" onClick={nobodyHome}>Prototype: nobody answers the door</button>
          )}
          {step < 3 && (
            <button type="button" className="link-btn" onClick={caregiverCancels}>Prototype: nurse cancels</button>
          )}
        </div>
      </div>
    </div>
  );
}

/* Visit completed: record, next visit, rating */
export function DoneScreen() {
  const { state, set } = useApp();
  const [rating, setRating] = useState(0);
  const [rated, setRated] = useState(false);
  const [error, setError] = useState(false);

  if (!state.booking) return <NoBooking />;
  const booking = state.booking;
  const b = describeBooking(booking);

  const finish = () => {
    // A course moves on to its next visit. A single visit, or the last one, closes the booking.
    // The visit happened, so anything carried over from an earlier booking has now been collected.
    if (b.hasNext) set({ booking: { ...booking, visitNo: booking.visitNo + 1, carried: 0 }, step: 0, screen: "home", trail: [] });
    else set({ booking: null, step: 0, screen: "home", trail: [] });
  };

  return (
    <div className="screen">
      <div className="scroll" style={{ paddingTop: 36 }}>
        <div className="stack">
          <div className="done-check"><Icon name="check" size={26} strokeWidth={3} /></div>
          <h1>{b.isCourse ? `${b.visitLabel} completed` : "Visit completed"}</h1>
          <p className="muted">{b.service.name} for {b.patient.full}</p>
        </div>

        <div className="card stack" style={{ gap: 12 }}>
          <h2>Visit record from {b.caregiver.first}</h2>
          <p style={{ fontSize: 15 }}>{b.service.note}</p>
          <div className="grid grid-2" style={{ gap: 10, fontVariantNumeric: "tabular-nums" }}>
            {b.readings.map((v) => (
              <div key={v.id} className="vital">
                <span className="tiny muted">{v.name}</span>
                <span className="strong">{v.sample}</span>
              </div>
            ))}
          </div>
          <p className="tiny muted">Saved to Records. You can share it with your doctor.</p>
        </div>

        {b.hasNext && (
          <div className="tint-box stack-xs">
            <div className="strong">Next: visit {booking.visitNo + 1} of {booking.visits}</div>
            <div className="small" style={{ color: "var(--ink-soft)" }}>
              {b.nextWhen}.{" "}
              {booking.sameCaregiver ? `${b.caregiver.first} will come again.` : "You will see who is coming the evening before."}
            </div>
          </div>
        )}

        {rated ? (
          <div className="tint-box" style={{ fontWeight: 500 }}>Rating sent. Thank you.</div>
        ) : (
          <div className="card stack">
            <h2>How was {b.caregiver.first}?</h2>
            <div style={{ display: "flex", gap: 4 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button type="button" key={n} className="star-btn" aria-label={`Rate ${n} out of 5`} onClick={() => { setRating(n); setError(false); }}>
                  <Star filled={n <= rating} size={32} />
                </button>
              ))}
            </div>
            {error && <div role="alert" className="error">Tap a star first.</div>}
            {/* TODO: save the rating through the API. */}
            <button type="button" className="btn btn-outline" onClick={() => (rating > 0 ? setRated(true) : setError(true))}>
              Send rating
            </button>
          </div>
        )}
      </div>
      <BottomBar>
        <button type="button" className="btn btn-primary" onClick={finish}>Back to home</button>
      </BottomBar>
    </div>
  );
}

function NoBooking() {
  const { go } = useApp();
  return (
    <div className="screen">
      <div className="scroll scroll-top">
        <h1>No visit in progress</h1>
        <button type="button" className="btn btn-primary" onClick={() => go("home")}>Book a visit</button>
      </div>
    </div>
  );
}
