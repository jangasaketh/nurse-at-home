"use client";

import { useEffect, useState } from "react";
import { MapBox } from "./MapBox";
import { SosStatus } from "./SosStatus";
import { caregiverLocation, kmBetween, privateCall, type CallResult, type CaregiverWhere } from "@/lib/maps";
import { useServerAction } from "@/lib/fake-api";
import { awaitingPayment, lookAgain, payAfterVisit, rateVisit } from "@/lib/patient-bookings";
import { payBooking, PaymentCancelled } from "@/lib/payments";
import { liveLate, tx } from "@/lib/booking";
import { useNow } from "@/lib/caregiver/engine";
import { useApp } from "@/lib/store";
import { ARRIVAL_CODE, LATE_MINUTES, NO_SHOW_MINUTES, VISIT_FEE } from "@/lib/data";
import { canReschedule, describeBooking, money, msg, newId, patientWhoMsg, whenMsg, type Msg } from "@/lib/booking";
import { t } from "@/lib/i18n";
import { Icon, Star } from "./Icon";
import { BottomBar, Header, Rows } from "./ui";
import { PrescriptionCard } from "./PrescriptionPicker";
import { PushCard } from "./PushCard";

/* Live visit tracking */
export function TrackingScreen() {
  const { state, set, go, open, notify } = useApp();
  const [sos, setSos] = useState(false);
  const [contactNote, setContactNote] = useState(false);

  if (!state.booking) return <NoBooking />;
  if (state.booking.live) return <LiveTrackingScreen />;
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

        {booking.prescription && (
          <div className="stack-sm">
            <h2>{t("Prescription for this visit")}</h2>
            <PrescriptionCard p={booking.prescription} />
            <p className="small muted">{t("{name} checks it against the medicine before starting. Keep the paper prescription ready too.", { name: first })}</p>
          </div>
        )}

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
  if (state.booking.live) return <LiveDoneScreen />;
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

/* ---------- Live mode: a real booking followed on the server ---------- */

function LiveTrackingScreen() {
  const { state, go, open, refresh } = useApp();
  const now = useNow(1000);
  const [sos, setSos] = useState(false);
  const again = useServerAction();
  const booking = state.booking!;
  const live = booking.live!;
  const b = describeBooking(booking);
  const first = b.caregiver.first;
  const step = state.step;
  const late = liveLate(booking, now);
  const watcher = booking.notifyContact ? state.contact : null;

  // Paid online, but the payment has not gone through yet.
  if (live.status === "requested" && awaitingPayment(booking)) return <FinishPayingScreen />;

  // Waiting for a caregiver to accept.
  if (live.status === "requested") {
    const waitingMin = Math.max(0, Math.floor((now - live.searchingSince) / 60000));
    const nobody = live.openOffers === 0;
    return (
      <div className="screen">
        <Header title={t("Your visit")} onBack={() => go("home")} backLabel={t("Back to home")} />
        <div className="scroll" style={{ gap: 16 }}>
          <div className="stack-sm">
            {b.isCourse && <div className="pill">{b.visitLabel}</div>}
            <h1>{nobody ? (live.anyOffers ? t("No {who} has accepted yet", { who: b.who }) : t("No {who} is free near you right now", { who: b.who })) : t("Finding a {who} for you", { who: b.who })}</h1>
            <p className="muted">
              {nobody
                ? t("You can look again, choose another time, or cancel. Cancelling now is free.")
                : t("We sent your request to verified {whoPlural} near you. The first one to accept comes to you.", { whoPlural: t(b.service.nurseOnly ? "nurses" : "caregivers") })}
            </p>
          </div>
          {!nobody && (
            <div className="tint-box stack-xs" role="status">
              <span className="strong">{t("Waiting for an answer")}</span>
              <span className="small">{waitingMin < 1 ? t("Sent just now.") : t("Sent {n} min ago.", { n: waitingMin })} {t("This page updates by itself.")}</span>
            </div>
          )}
          {!nobody && <PushCard app="patient" userId={state.userId} lang={state.lang} live compact />}
          <Rows items={[
            { k: t("Service"), v: t(b.service.name) },
            { k: t("When"), v: b.when },
            { k: t("Patient"), v: b.patient.full },
            { k: t("Booking"), v: live.code },
          ]} />
          {nobody && (
            <div className="stack-sm">
              {again.failed && <div role="alert" className="error">{t("That did not go through. Check your internet connection and try again.")}</div>}
              <button type="button" className="btn btn-primary" disabled={again.busy} onClick={() => again.run(() => lookAgain(live.id), () => void refresh())}>
                {again.busy ? t("Looking…") : t("Look again")}
              </button>
              {booking.slot !== URGENT_SLOT_TEXT && <button type="button" className="btn btn-outline" onClick={() => open("reschedule")}>{t("Choose another time")}</button>}
            </div>
          )}
          <button type="button" className="btn btn-danger" style={{ minHeight: 48 }} onClick={() => open("cancel")}>{t("Cancel request")}</button>
          <p className="small muted">{t("Cancelling is free until a {who} accepts.", { who: b.who })}</p>
        </div>
      </div>
    );
  }

  const titles = [
    t("{name} accepted your booking", { name: first }),
    t("{name} is on the way", { name: first }),
    t("{name} is at your door", { name: first }),
    t("Care in progress"),
  ];
  const subs = [
    t("Visit set for {when}.", { when: b.when }),
    t("On the way to you. You will get an alert on arrival."),
    t("Share the arrival code to start the visit."),
    t("{service} for {patient}. About {time}.", { service: t(b.service.name), patient: b.patient.name, time: t(b.service.mins) }),
  ];
  const steps = [t("Booking accepted"), t("{name} is on the way", { name: first }), t("{name} has arrived", { name: first }), t("Care in progress")];
  const s = Math.max(0, step);

  return (
    <div className="screen">
      <Header title={t("Your visit")} onBack={() => go("home")} backLabel={t("Back to home")}
        right={<button type="button" className="sos" onClick={() => setSos(!sos)}>SOS</button>} />
      <div className="scroll" style={{ gap: 16 }}>
        {sos && (
          <div role="alert" className="danger-box stack-sm">
            <div className="strong">{t("Emergency help")}</div>
            <div style={{ fontSize: 15 }}>{t("Call 112 now. Then call our support team so we can help.")}</div>
            <SosStatus app="patient" bookingId={live.id} />
            <div className="actions">
              <a className="btn btn-danger-solid" style={{ minHeight: 48, fontSize: 16 }} href="tel:112">{t("Call 112")}</a>
              <button type="button" className="btn btn-outline" onClick={() => open("help")}>{t("Contact support")}</button>
            </div>
          </div>
        )}

        {late && s < 2 && (
          <div className="warn-box stack-sm">
            <div className="strong">{live.lateMinutes > 0 ? t("{name} is running about {n} minutes late", { name: first, n: live.lateMinutes }) : t("{name} is more than {n} minutes late", { name: first, n: LATE_MINUTES })}</div>
            <div className="sub">{t("We are sorry. You can wait, or cancel free of charge.")}</div>
          </div>
        )}
        {!late && live.lateMinutes > 0 && s < 2 && (
          <div className="tint-box small">{t("{name} is running about {n} minutes late", { name: first, n: live.lateMinutes })}</div>
        )}

        <div className="stack-sm">
          {b.isCourse && <div className="pill">{b.visitLabel}</div>}
          <h1>{titles[s]}</h1>
          <p className="muted">{subs[s]}</p>
        </div>

        <div className="card row-inline" style={{ gap: 12, padding: "14px 16px", flexWrap: "wrap" }}>
          <span className="avatar" style={{ width: 48, height: 48 }}>{b.caregiver.initials}</span>
          <span className="stack-xs" style={{ flex: 1, minWidth: 0, gap: 0 }}>
            <span className="strong">{b.caregiver.name}</span>
            <span className="small muted">{b.caregiver.qualification}</span>
            <span className="tiny muted">{b.caregiver.regLine}</span>
            <span className="tiny muted">{b.caregiver.rating && live.caregiver?.rating ? `★ ${b.caregiver.rating} · ` : ""}{t("{n} visits", { n: b.caregiver.visitCount })}</span>
          </span>
          <PrivateCallButton bookingId={live.id} who={b.who} name={first} />
        </div>

        {(s === 1 || s === 2) && <CaregiverOnMap bookingId={live.id} name={first} />}

        {watcher && <p className="small muted">{t("{name} is getting updates on this visit.", { name: watcher.name })}</p>}

        {s < 3 && (
          <div className="warn-box between" style={{ padding: "14px 16px" }}>
            <div className="stack-xs">
              <span className="strong">{t("Arrival code")}</span>
              <span className="sub">{t("Tell the nurse only at your door.")}</span>
            </div>
            <div className="arrival-code">{live.arrivalCode}</div>
          </div>
        )}

        {booking.prescription && (
          <div className="stack-sm">
            <h2>{t("Prescription for this visit")}</h2>
            <PrescriptionCard p={booking.prescription} />
            <p className="small muted">{t("{name} checks it against the medicine before starting. Keep the paper prescription ready too.", { name: first })}</p>
          </div>
        )}

        <div className="card stack" style={{ gap: 14 }}>
          {steps.map((label, i) => (
            <div key={label} className={`step ${i <= s ? "done" : ""} ${i === s ? "current" : ""}`}>
              <span className="dot"><Icon name="check" size={12} strokeWidth={4} /></span>
              <span>{label}</span>
            </div>
          ))}
        </div>

        {s < 3 && (
          <div className="stack">
            <h2>{t("Need to change this visit?")}</h2>
            <div className="actions">
              {canReschedule(booking, s) && <button type="button" className="btn btn-outline" onClick={() => open("reschedule")}>{t("Reschedule")}</button>}
              <button type="button" className="btn btn-danger" style={{ minHeight: 48 }} onClick={() => open("cancel")}>{t("Cancel visit")}</button>
            </div>
          </div>
        )}
        <p className="tiny muted">{t("Booking {code}. This page updates by itself.", { code: live.code })}</p>
      </div>
    </div>
  );
}

const URGENT_SLOT_TEXT = "within 60 minutes";

/** The booking is made, but the online payment did not finish (window closed, payment failed, no internet). */
function FinishPayingScreen() {
  const { state, go, open, refresh } = useApp();
  const pay = useServerAction();
  const cash = useServerAction();
  const booking = state.booking!;
  const live = booking.live!;
  const b = describeBooking(booking);
  const failedMsg = pay.failed && !(pay.error instanceof PaymentCancelled);
  return (
    <div className="screen">
      <Header title={t("Your visit")} onBack={() => go("home")} backLabel={t("Back to home")} />
      <div className="scroll" style={{ gap: 16 }}>
        <div className="stack-sm">
          <h1>{t("Finish paying to send your request")}</h1>
          <p className="muted">{t("Your request goes to {whoPlural} near you once the payment has gone through.", { whoPlural: t(b.service.nurseOnly ? "nurses" : "caregivers") })}</p>
        </div>
        <Rows items={[
          { k: t("Service"), v: t(b.service.name) },
          { k: t("When"), v: b.when },
          { k: t("Patient"), v: b.patient.full },
          { k: t("To pay"), v: money(live.payTotal) },
          { k: t("Booking"), v: live.code },
        ]} />
        {failedMsg && <div role="alert" className="error">{t("The payment did not go through. You have not been charged. Try again, or pay after the visit.")}</div>}
        {cash.failed && <div role="alert" className="error">{t("That did not go through. Check your internet connection and try again.")}</div>}
        <button type="button" className="btn btn-primary" disabled={pay.busy || cash.busy}
          onClick={() => pay.run(() => payBooking(live.id, booking.pay === "card" ? "card" : "upi", { name: b.patient.name, phone: state.phone }), () => void refresh())}>
          {pay.busy ? t("Opening the payment…") : t("Pay {amount}", { amount: money(live.payTotal) })}
        </button>
        <button type="button" className="btn btn-outline" disabled={pay.busy || cash.busy} onClick={() => cash.run(() => payAfterVisit(live.id), () => void refresh())}>
          {t("Pay after the visit instead")}
        </button>
        <button type="button" className="btn btn-danger" style={{ minHeight: 48 }} onClick={() => open("cancel")}>{t("Cancel request")}</button>
        <p className="small muted">{t("If money left your account but this screen did not change, wait a minute: we confirm it with the bank and the page updates by itself.")}</p>
      </div>
    </div>
  );
}

function LiveDoneScreen() {
  const { state, set } = useApp();
  const rate = useServerAction();
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [rated, setRated] = useState(false);
  const [error, setError] = useState(false);
  const booking = state.booking!;
  const b = describeBooking(booking);
  const r = state.doneRecord;
  const visits = r?.visits ?? booking.visits;
  const visitNo = r?.visitNo ?? booking.visitNo;
  const isCourse = visits > 1;
  const ended = !!booking.live && ["completed", "cancelled", "missed"].includes(booking.live.status);
  const name = r?.by ? r.by.split(/\s+/)[0] : b.caregiver.first;

  const finish = () => set({ booking: ended ? null : booking, doneRecord: null, step: ended ? 0 : state.step, screen: "home", trail: [] });
  const send = () => {
    if (rating < 1) { setError(true); return; }
    void rate.run(() => rateVisit(booking.live!.id, rating, text.trim()), () => setRated(true));
  };

  return (
    <div className="screen">
      <div className="scroll" style={{ paddingTop: 36 }}>
        <div className="stack">
          <div className="done-check"><Icon name="check" size={26} strokeWidth={3} /></div>
          <h1>{isCourse ? t("{visit} completed", { visit: t("Visit {n} of {total}", { n: visitNo, total: visits }) }) : t("Visit completed")}</h1>
          <p className="muted">{t("{service} for {patient}", { service: t(b.service.name), patient: b.patient.full })}</p>
        </div>

        {r && (
          <div className="card stack" style={{ gap: 12 }}>
            <h2>{t("Visit record from {name}", { name })}</h2>
            {r.note && <p style={{ fontSize: 15 }}>{r.note}</p>}
            {r.details.map((d) => (
              <div key={tx(d.label)} className="between small"><span className="muted">{tx(d.label)}</span><span className="strong">{tx(d.value)}</span></div>
            ))}
            {r.readings.length > 0 && (
              <div className="grid grid-2" style={{ gap: 10, fontVariantNumeric: "tabular-nums" }}>
                {r.readings.map((v) => (
                  <div key={tx(v.label)} className="vital"><span className="tiny muted">{tx(v.label)}</span><span className="strong">{v.value}</span></div>
                ))}
              </div>
            )}
            {r.warnings.map((w) => <div key={tx(w)} className="warn-box small">{tx(w)}</div>)}
            <p className="tiny muted">{t("Saved to Records. You can share it with your doctor.")}</p>
          </div>
        )}

        {!ended && b.hasNext && booking.visitNo > visitNo && (
          <div className="tint-box stack-xs">
            <div className="strong">{t("Next: visit {n} of {total}", { n: booking.visitNo, total: booking.visits })}</div>
            <div className="small" style={{ color: "var(--ink-soft)" }}>
              {b.when}.{" "}{booking.sameCaregiver ? t("{name} will come again.", { name }) : t("We will find a {who} for the next visit and tell you who is coming.", { who: b.who })}
            </div>
          </div>
        )}

        {rated ? (
          <div className="tint-box" style={{ fontWeight: 500 }}>{t("Rating sent. Thank you.")}</div>
        ) : (
          <div className="card stack">
            <h2>{t("How was {name}?", { name })}</h2>
            <div style={{ display: "flex", gap: 4 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button type="button" key={n} className="star-btn" aria-label={t("Rate {n} out of 5", { n })} onClick={() => { setRating(n); setError(false); }}>
                  <Star filled={n <= rating} size={32} />
                </button>
              ))}
            </div>
            <label htmlFor="rate-text" className="small">{t("Anything to add? (optional)")}</label>
            <textarea id="rate-text" className="text-input" maxLength={500} value={text} onChange={(e) => setText(e.target.value)} />
            {error && <div role="alert" className="error">{t("Tap a star first.")}</div>}
            {rate.failed && <div role="alert" className="error">{t("That did not go through. Check your internet connection and try again.")}</div>}
            <button type="button" className="btn btn-outline" disabled={rate.busy} onClick={send}>{rate.busy ? t("Sending…") : t("Send rating")}</button>
          </div>
        )}
      </div>
      <BottomBar>
        <button type="button" className="btn btn-primary" onClick={finish}>{t("Back to home")}</button>
      </BottomBar>
    </div>
  );
}


/** Call the caregiver through our number (Exotel), so neither sees the other's phone number. */
function PrivateCallButton({ bookingId, who, name }: { bookingId: string; who: string; name: string }) {
  const [result, setResult] = useState<CallResult | "busy" | null>(null);
  const call = async () => {
    setResult("busy");
    setResult(await privateCall("patient", bookingId).catch(() => "failed" as const));
  };
  const text = result === "busy" ? t("Connecting…")
    : result === "calling" ? t("We are calling you now. Pick up, and we connect you to {name}. Neither of you sees the other's number.", { name })
    : result === "not-set-up" ? t("Private calls through us are coming soon. If you need to reach the {who} now, call our support team.", { who })
    : result === "not-allowed" ? t("Calls are possible only for a visit that is accepted and not finished.")
    : result === "failed" ? t("The call could not be placed. Try again, or call our support team.") : null;
  return (
    <>
      <button type="button" className="round-btn" aria-label={t("Call caregiver")} disabled={result === "busy"} onClick={call}><Icon name="phone" size={20} /></button>
      {text && <p className="small muted call-note" role="status" style={{ flexBasis: "100%", margin: 0 }}>{text}</p>}
    </>
  );
}

/** Where the caregiver is, while on the way (their phone shares it about every 30 seconds). */
function CaregiverOnMap({ bookingId, name }: { bookingId: string; name: string }) {
  const [where, setWhere] = useState<CaregiverWhere | null>(null);
  useEffect(() => {
    let gone = false;
    const read = () => caregiverLocation(bookingId).then((w) => { if (!gone) setWhere(w); }).catch(() => {});
    read();
    const id = window.setInterval(read, 20000);
    return () => { gone = true; window.clearInterval(id); };
  }, [bookingId]);
  if (!where || (!where.at && !where.home)) return null;
  const centre = where.home ?? where.at!;
  return (
    <div className="stack-xs">
      <MapBox pin={where.home} other={where.at} centre={centre} label={t("Map: where {name} is", { name })} height={200} />
      <span className="small muted" role="status">
        {where.at && where.home ? t("{name} is about {km} km away.", { name, km: kmBetween(where.at, where.home).toFixed(1) })
          : where.at ? t("The blue dot is {name}.", { name }) : t("{name}'s location shows here once they share it.", { name })}
      </span>
    </div>
  );
}
