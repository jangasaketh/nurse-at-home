"use client";

import { useState } from "react";
import { useApp } from "@/lib/store";
import { ARRIVAL_CODE, LATE_MINUTES, NO_SHOW_MINUTES, VISIT_FEE } from "@/lib/data";
import { canReschedule, describeBooking, money, msg, newId, patientWhoMsg, whenMsg, type Msg } from "@/lib/booking";
import { t } from "@/lib/i18n";
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
  const serviceName = t(b.service.name);
  // Saved to history as messages, so they follow the app language later.
  const who = patientWhoMsg(booking.patient);
  const when = whenMsg(b.visitDate, booking.slot);
  const service = msg(b.service.name);
  const recordTitle = b.isCourse ? msg("{service}, visit {n} of {total}", { service, n: booking.visitNo, total: booking.visits }) : service;

  const titles = [
    t("{name} accepted your booking", { name: first }),
    t("{name} is on the way", { name: first }),
    t("{name} is at your door", { name: first }),
    t("Care in progress"),
  ];
  const subs = [
    t("Visit set for {when}.", { when: b.when }),
    t("{distance} away. You will get an alert on arrival.", { distance: b.caregiver.distance }),
    t("Share the arrival code to start the visit."),
    t("{service} for {patient}. About {time}.", { service: serviceName, patient: b.patient.name, time: t(b.service.mins) }),
  ];
  const steps = [t("Booking accepted"), t("{name} is on the way", { name: first }), t("{name} has arrived", { name: first }), t("Care in progress")];
  const demoLabels = [t("Prototype: nurse sets off"), t("Prototype: nurse arrives"), t("Prototype: start the care"), t("Prototype: finish the visit")];

  // There is no live nurse yet, so this button stands in for real status updates.
  const advance = () => {
    if (step < 3) {
      set({ step: step + 1 });
      if (step === 0) notify(msg("{name} is on the way", { name: first }), msg("{service} for {patient}. {distance} away.", { service, patient: b.patient.name, distance: b.caregiver.distance }));
      if (step === 1) notify(msg("{name} has arrived", { name: first }), msg("Share your arrival code at the door to start the visit."));
      return;
    }
    set({
      screen: "done",
      trail: [],
      history: [
        {
          id: newId("v"),
          status: "completed",
          title: recordTitle,
          when,
          who,
          by: b.caregiver.name,
          note: msg(b.service.note),
          readings: b.readings.map((r) => ({ name: msg(r.name), value: r.sample })),
        },
        ...state.history,
      ],
    });
    notify(msg("Visit completed"), msg("The record of this visit ({service}) is saved under Records.", { service }));
  };

  const watcher = booking.notifyContact ? state.contact : null;

  // Ends this visit without care being given. A course moves on to its next visit.
  const endVisit = (status: "cancelled" | "missed", note: Msg, chargeKept: boolean) => {
    set({
      booking: b.hasNext ? { ...booking, visitNo: booking.visitNo + 1 } : null,
      step: 0,
      caregiverLate: false,
      // Cash bookings: nothing was collected, so the charge (and any earlier unpaid one) moves to the next booking.
      arrears: state.arrears + (booking.pay === "cash" ? (chargeKept ? VISIT_FEE : 0) + (b.hasNext ? 0 : booking.carried) : 0),
      history: [
        { id: newId("v"), status, title: recordTitle, when, who, by: b.caregiver.name, note, readings: [] },
        ...state.history,
      ],
      screen: "bookings",
      trail: [],
    });
  };
  const visitPrice = booking.unitPrice + VISIT_FEE + (booking.visits === 1 ? booking.urgentFee : 0);

  // RULE: the caregiver waits at the door, then the visit counts as missed and the home visit charge is kept.
  const nobodyHome = () => {
    endVisit("missed", msg("Nobody answered the door for {n} minutes. The home visit charge was kept and paid to {name}.", { n: NO_SHOW_MINUTES, name: first }), true);
    notify(msg("Visit missed"), booking.pay === "cash"
      ? msg("{name} waited {n} minutes at your door. The {fee} home visit charge will be added to your next booking.", { name: first, n: NO_SHOW_MINUTES, fee: money(VISIT_FEE) })
      : msg("{name} waited {n} minutes at your door. {refund} is refunded and the {fee} home visit charge is kept.", { name: first, n: NO_SHOW_MINUTES, refund: money(visitPrice - VISIT_FEE), fee: money(VISIT_FEE) }));
  };

  // RULE: if the caregiver cancels, the patient pays nothing.
  const caregiverCancels = () => {
    endVisit("cancelled", msg("Cancelled by {name}. You were not charged for this visit.", { name: first }), false);
    notify(msg("{name} had to cancel", { name: first }), booking.pay === "cash"
      ? msg("You have not been charged. You can book another nurse from Home.")
      : msg("{amount} is refunded in full. You can book another nurse from Home.", { amount: money(visitPrice) }));
  };

  return (
    <div className="screen">
      <Header
        title={t("Your visit")}
        onBack={() => go("home")}
        backLabel={t("Back to home")}
        right={<button type="button" className="sos" onClick={() => setSos(!sos)}>SOS</button>}
      />
      <div className="scroll" style={{ gap: 16 }}>
        {sos && (
          <div role="alert" className="danger-box stack-sm">
            <div className="strong">{t("Emergency help")}</div>
            <div style={{ fontSize: 15 }}>
              {state.contact
                ? t("Call 112 now. In the real app this button also alerts our support team and {name} (+91 {phone}).", { name: state.contact.name, phone: state.contact.phone })
                : t("Call 112 now. In the real app this button also alerts our support team and your emergency contact, once you add one in Profile.")}
            </div>
          </div>
        )}

        {state.caregiverLate && step < 2 && (
          <div className="warn-box stack-sm">
            <div className="strong">{t("{name} is more than {n} minutes late", { name: first, n: LATE_MINUTES })}</div>
            <div className="sub">{t("We are sorry. You can wait, or cancel free of charge.")}</div>
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
          <div className="label">{t("Live map goes here")}</div>
        </div>

        <div className="card row-inline" style={{ gap: 12, padding: "14px 16px" }}>
          <span className="avatar" style={{ width: 48, height: 48 }}>{b.caregiver.initials}</span>
          <span className="stack-xs" style={{ flex: 1, minWidth: 0, gap: 0 }}>
            <span className="strong">{b.caregiver.name}</span>
            <span className="small muted">{t(b.caregiver.qualification)}</span>
            <span className="tiny muted">{b.caregiver.regLine}</span>
          </span>
          <button type="button" className="round-btn" aria-label={t("Call caregiver")} onClick={() => setContactNote(true)}><Icon name="phone" size={20} /></button>
          <button type="button" className="round-btn" aria-label={t("Message caregiver")} onClick={() => setContactNote(true)}><Icon name="message" size={20} /></button>
        </div>
        {contactNote && (
          <p className="small muted">
            {t("Calls and chat are switched off in the prototype. In the real app they go through us, so phone numbers stay private.")}
          </p>
        )}

        {watcher && (
          <p className="small muted">{t("{name} is getting updates on this visit.", { name: watcher.name })}</p>
        )}

        <div className="warn-box between" style={{ padding: "14px 16px" }}>
          <div className="stack-xs">
            <span className="strong">{t("Arrival code")}</span>
            <span className="sub">{t("Tell the nurse only at your door.")}</span>
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
            <h2>{t("Need to change this visit?")}</h2>
            <div className="actions">
              {canReschedule(booking, step) && (
                <button type="button" className="btn btn-outline" onClick={() => open("reschedule")}>{t("Reschedule")}</button>
              )}
              <button type="button" className="btn btn-danger" style={{ minHeight: 48 }} onClick={() => open("cancel")}>{t("Cancel visit")}</button>
            </div>
          </div>
        )}

        {/* There is no live nurse yet, so these buttons stand in for real events. Remove them before launch. */}
        <div className="dashed-box stack">
          <button type="button" className="btn btn-demo" onClick={advance}>{demoLabels[step]}</button>
          {step < 2 && !state.caregiverLate && (
            <button type="button" className="link-btn" onClick={() => set({ caregiverLate: true })}>
              {t("Prototype: nurse is {n} minutes late", { n: LATE_MINUTES })}
            </button>
          )}
          {step === 2 && (
            <button type="button" className="link-btn" onClick={nobodyHome}>{t("Prototype: nobody answers the door")}</button>
          )}
          {step < 3 && (
            <button type="button" className="link-btn" onClick={caregiverCancels}>{t("Prototype: nurse cancels")}</button>
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
          <h1>{b.isCourse ? t("{visit} completed", { visit: b.visitLabel }) : t("Visit completed")}</h1>
          <p className="muted">{t("{service} for {patient}", { service: t(b.service.name), patient: b.patient.full })}</p>
        </div>

        <div className="card stack" style={{ gap: 12 }}>
          <h2>{t("Visit record from {name}", { name: b.caregiver.first })}</h2>
          <p style={{ fontSize: 15 }}>{t(b.service.note)}</p>
          <div className="grid grid-2" style={{ gap: 10, fontVariantNumeric: "tabular-nums" }}>
            {b.readings.map((v) => (
              <div key={v.id} className="vital">
                <span className="tiny muted">{t(v.name)}</span>
                <span className="strong">{v.sample}</span>
              </div>
            ))}
          </div>
          <p className="tiny muted">{t("Saved to Records. You can share it with your doctor.")}</p>
        </div>

        {b.hasNext && (
          <div className="tint-box stack-xs">
            <div className="strong">{t("Next: visit {n} of {total}", { n: booking.visitNo + 1, total: booking.visits })}</div>
            <div className="small" style={{ color: "var(--ink-soft)" }}>
              {b.nextWhen}.{" "}
              {booking.sameCaregiver ? t("{name} will come again.", { name: b.caregiver.first }) : t("You will see who is coming the evening before.")}
            </div>
          </div>
        )}

        {rated ? (
          <div className="tint-box" style={{ fontWeight: 500 }}>{t("Rating sent. Thank you.")}</div>
        ) : (
          <div className="card stack">
            <h2>{t("How was {name}?", { name: b.caregiver.first })}</h2>
            <div style={{ display: "flex", gap: 4 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button type="button" key={n} className="star-btn" aria-label={t("Rate {n} out of 5", { n })} onClick={() => { setRating(n); setError(false); }}>
                  <Star filled={n <= rating} size={32} />
                </button>
              ))}
            </div>
            {error && <div role="alert" className="error">{t("Tap a star first.")}</div>}
            {/* TODO: save the rating through the API. */}
            <button type="button" className="btn btn-outline" onClick={() => (rating > 0 ? setRated(true) : setError(true))}>
              {t("Send rating")}
            </button>
          </div>
        )}
      </div>
      <BottomBar>
        <button type="button" className="btn btn-primary" onClick={finish}>{t("Back to home")}</button>
      </BottomBar>
    </div>
  );
}

function NoBooking() {
  const { go } = useApp();
  return (
    <div className="screen">
      <div className="scroll scroll-top">
        <h1>{t("No visit in progress")}</h1>
        <button type="button" className="btn btn-primary" onClick={() => go("home")}>{t("Book a visit")}</button>
      </div>
    </div>
  );
}
