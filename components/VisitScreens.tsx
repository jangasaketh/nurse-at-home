"use client";

import { useState } from "react";
import { useApp } from "@/lib/store";
import { ARRIVAL_CODE, FAMILY_CONTACT } from "@/lib/data";
import { describeBooking } from "@/lib/booking";
import { Icon, Star } from "./Icon";
import { BottomBar, Header } from "./ui";

/* Live visit tracking */
export function TrackingScreen() {
  const { state, set, go } = useApp();
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
    if (step < 3) return set({ step: step + 1 });
    set({
      screen: "done",
      history: [
        {
          title: b.isCourse ? `${b.service.name}, visit ${booking.visitNo} of ${booking.visits}` : b.service.name,
          when: b.when,
          who: b.patient.chip === "Me" ? "You" : b.patient.chip,
          by: b.caregiver.name,
          note: b.service.note,
        },
        ...state.history,
      ],
    });
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
              Call 112 now. In the real app this button also alerts our support team and your emergency contact.
            </div>
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

        {state.notifyFamily && (
          <p className="small muted">{FAMILY_CONTACT} is getting updates on this visit.</p>
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

        <button type="button" className="btn btn-demo" onClick={advance}>{demoLabels[step]}</button>
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
    if (b.hasNext) set({ booking: { ...booking, visitNo: booking.visitNo + 1 }, step: 0, screen: "home" });
    else set({ booking: null, step: 0, screen: "home" });
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
