"use client";

import { useState } from "react";
import { useApp } from "@/lib/store";
import { SAMPLE_REVIEWS, SLOTS, URGENT_FEE, URGENT_SLOT, VISIT_COUNTS, VITAL_CHECKS } from "@/lib/data";
import {
  allowedText, dayAt, describeDraft, isVitals, money, msg, addressMsg, policyLine, prescriptionMissing, proofText, relationWord, slotText, whenMsg, yearsText,
} from "@/lib/booking";
import { useAction, useLoad } from "@/lib/fake-api";
import { t } from "@/lib/i18n";
import { Icon, Star } from "./Icon";
import { ActionError, BottomBar, CheckRow, Chip, ErrorState, Header, RadioCard, Rows, Skeleton } from "./ui";

/* 1. Service details, with the prescription gate */
export function ServiceScreen() {
  const { state, set, go, open } = useApp();
  const { service, patient, address, addressText, unitPrice, who } = describeDraft(state);
  const [error, setError] = useState(false);
  const [openInfo, setOpenInfo] = useState<string | null>(null);
  const pickChecks = isVitals(service);
  const noChecks = pickChecks && state.vitalIds.length === 0;

  const next = () => {
    if (prescriptionMissing(service, state.hasPrescription) || noChecks || !address) setError(true);
    else go("schedule");
  };

  const toggleCheck = (id: string) => {
    const on = state.vitalIds.includes(id);
    set({ vitalIds: on ? state.vitalIds.filter((v) => v !== id) : [...state.vitalIds, id] });
    setError(false);
  };

  return (
    <div className="screen">
      <Header title={t("Service details")} onBack={() => go("home")} />
      <div className="scroll">
        <div className="stack" style={{ gap: 6 }}>
          <h1>{t(service.name)}</h1>
          <p className="muted">{t(service.short)}</p>
          <div className="row-inline strong" style={{ gap: 16, marginTop: 6 }}>
            <span>{money(unitPrice)}</span>
            <span className="muted" style={{ fontWeight: 500 }}>{t("About {time}", { time: t(service.mins) })}</span>
          </div>
        </div>

        {pickChecks && (
          <div className="stack">
            <div className="stack-xs">
              <h2>{t("Choose your checks")}</h2>
              <p className="small muted">{t("Tick the checks you want. Tap a name to see what it is and how to prepare.")}</p>
            </div>
            {VITAL_CHECKS.map((v) => {
              const on = state.vitalIds.includes(v.id);
              const isOpen = openInfo === v.id;
              return (
                <div key={v.id} className={`check-item ${on ? "on" : ""}`}>
                  <div className="check-row">
                    <input
                      id={`check-${v.id}`}
                      type="checkbox"
                      checked={on}
                      onChange={() => toggleCheck(v.id)}
                      aria-label={t("Add {name}", { name: t(v.name) })}
                    />
                    <button type="button" className="check-name" aria-expanded={isOpen} onClick={() => setOpenInfo(isOpen ? null : v.id)}>
                      <span className="stack-xs">
                        <span className="strong">{t(v.name)}</span>
                        <span className="small primary-text">{isOpen ? t("Hide details") : t("What is this?")}</span>
                      </span>
                      <span className="strong">{money(v.price)}</span>
                    </button>
                  </div>
                  {isOpen && (
                    <div className="check-info">
                      <div className="kv"><span className="k">{t("What it tells you")}</span><span>{t(v.what)}</span></div>
                      <div className="kv"><span className="k">{t("How it is done")}</span><span>{t(v.how)}</span></div>
                      <div className="kv"><span className="k">{t("How to prepare")}</span><span>{t(v.prepare)}</span></div>
                      <p className="tiny muted">{t("The nurse explains your reading. Your doctor decides what it means for you.")}</p>
                    </div>
                  )}
                </div>
              );
            })}
            {error && noChecks && <div role="alert" className="error">{t("Choose at least one check to continue.")}</div>}
          </div>
        )}

        <div className="card stack">
          <h2>{t("What the visit includes")}</h2>
          {service.includes.map((line) => (
            <div key={line} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span className="primary-text" style={{ paddingTop: 2 }}><Icon name="check" size={18} strokeWidth={2.5} /></span>
              <span style={{ fontSize: 15 }}>{t(line)}</span>
            </div>
          ))}
        </div>

        <div className="card stack" style={{ gap: 12 }}>
          <h2>{t("Who brings what")}</h2>
          <div className="kv"><span className="k">{t("The {who} brings", { who })}</span><span>{t(service.nurseBrings)}</span></div>
          <div className="kv"><span className="k">{t("You keep ready")}</span><span>{t(service.youKeepReady)}</span></div>
        </div>

        {address ? (
          <Rows items={[{ k: t("Patient"), v: patient.full }, { k: t("Address"), v: addressText }]} />
        ) : (
          <div className="warn-box stack" style={{ gap: 12 }}>
            <div className="stack-xs">
              <h2>{t("Where should the {who} come?", { who })}</h2>
              <div className="sub">{t("Add an address to continue with this booking.")}</div>
            </div>
            <button type="button" className="btn btn-warn" onClick={() => open("address", { editingId: null })}>
              <Icon name="plus" size={20} />
              {t("Add address")}
            </button>
            {error && <div role="alert" className="error">{t("Add an address to continue.")}</div>}
          </div>
        )}

        {service.needsPrescription && (
          <div className="warn-box stack" style={{ gap: 12 }}>
            <div className="stack-xs">
              <h2>{t("Doctor's prescription needed")}</h2>
              <div className="sub">
                {t("This service cannot be booked without one. We do not arrange doctor consultations, so please get it from your own doctor. The nurse checks it against the medicine before starting.")}
              </div>
            </div>
            {state.hasPrescription ? (
              <div className="between" style={{ background: "var(--surface)", borderRadius: 12, padding: "6px 12px" }}>
                <span className="row-inline strong" style={{ color: "var(--ok)" }}>
                  <Icon name="check" size={20} strokeWidth={2.5} />
                  {t("Prescription added")}
                </span>
                <button type="button" className="link-btn small" style={{ color: "var(--warn-ink)" }} onClick={() => set({ hasPrescription: false })}>
                  {t("Remove")}
                </button>
              </div>
            ) : (
              // TODO: open the camera or file picker and upload to storage.
              <button type="button" className="btn btn-warn" onClick={() => { set({ hasPrescription: true }); setError(false); }}>
                <Icon name="upload" size={20} />
                {t("Add photo of prescription")}
              </button>
            )}
            {error && <div role="alert" className="error">{t("Add the prescription to continue.")}</div>}
          </div>
        )}
      </div>
      <BottomBar>
        <button type="button" className="btn btn-primary" onClick={next}>{t("Choose date and time")}</button>
      </BottomBar>
    </div>
  );
}

/* 2. Date and time, one visit or a course of repeat visits */
export function ScheduleScreen() {
  const { state, set, go } = useApp();
  const d = describeDraft(state);
  const [error, setError] = useState(false);

  const next = () => {
    if (state.slot) go("caregivers");
    else setError(true);
  };

  // "Within 60 minutes" only makes sense for a single visit today.
  const canBeUrgent = !state.repeat && state.dateIdx === 0;
  const clearUrgent = state.slot === URGENT_SLOT ? { slot: null } : {};

  return (
    <div className="screen">
      <Header title={t(d.service.name)} onBack={() => go("service")} />
      <div className="scroll gap-lg">
        <h1>{t("When should the {who} come?", { who: d.who })}</h1>

        <div className="grid grid-2">
          <Chip className="strong" selected={!state.repeat} onClick={() => set({ repeat: false })}>{t("One visit")}</Chip>
          <Chip className="strong" selected={state.repeat} onClick={() => set({ repeat: true, ...clearUrgent })}>{t("Repeat visits")}</Chip>
        </div>

        <div className="stack">
          <h2>{state.repeat ? t("First visit") : t("Day")}</h2>
          <div className="grid grid-5">
            {[0, 1, 2, 3, 4].map((i) => {
              const day = dayAt(i);
              return (
                <Chip key={i} className="chip-day" selected={i === state.dateIdx} onClick={() => set({ dateIdx: i, ...(i === 0 ? {} : clearUrgent) })}>
                  <span className="tiny">{day.weekday}</span>
                  <span className="num">{day.date}</span>
                </Chip>
              );
            })}
          </div>
        </div>

        <div className="stack">
          <h2>{t("Arrival time")}</h2>
          {canBeUrgent && (
            <RadioCard
              selected={state.slot === URGENT_SLOT}
              onClick={() => { set({ slot: URGENT_SLOT }); setError(false); }}
              label={t("As soon as possible · {fee} extra", { fee: money(URGENT_FEE) })}
              sub={t("The nearest free {who} reaches you within 60 minutes.", { who: d.who })}
            />
          )}
          <div className="grid grid-3">
            {SLOTS.map((slot) => (
              <Chip key={slot} selected={slot === state.slot} onClick={() => { set({ slot }); setError(false); }}>
                {slot}
              </Chip>
            ))}
          </div>
          {error && <div role="alert" className="error">{t("Pick an arrival time to continue.")}</div>}
          <p className="small muted">{t("The {who} arrives within 30 minutes of the time you pick.", { who: d.who })}</p>
        </div>

        {state.repeat && (
          <>
            <div className="stack">
              <h2>{t("How many visits?")}</h2>
              <div className="grid grid-5">
                {VISIT_COUNTS.map((n) => (
                  <Chip key={n} className="chip-num" selected={n === state.count} onClick={() => set({ count: n })}>{n}</Chip>
                ))}
              </div>
            </div>

            <div className="stack">
              <h2>{t("How often?")}</h2>
              <div className="grid grid-2">
                <Chip selected={state.every === 1} onClick={() => set({ every: 1 })}>{t("Every day")}</Chip>
                <Chip selected={state.every === 2} onClick={() => set({ every: 2 })}>{t("Every 2 days")}</Chip>
              </div>
            </div>

            <div className="stack">
              <h2>{t("Who should come?")}</h2>
              <RadioCard
                selected={state.sameNurse}
                onClick={() => set({ sameNurse: true })}
                label={t("Same {who} every visit", { who: d.who })}
                sub={t("One person follows the healing from start to finish.")}
              />
              <RadioCard
                selected={!state.sameNurse}
                onClick={() => set({ sameNurse: false })}
                label={t("Any available {who}", { who: d.who })}
                sub={t("Easier to get your time. You see who is coming the evening before.")}
              />
            </div>

            <div className="tint-box stack-sm">
              <div className="strong">
                {t("{n} visits, {every}, {from} to {to}, {time}", { n: d.visits, every: d.everyText, from: d.firstDay, to: d.lastDay, time: slotText(d.slot) })}
              </div>
              {d.service.needsPrescription && (
                <div className="small" style={{ color: "var(--ink-soft)" }}>
                  {t("The prescription must cover every visit. The nurse checks it each time.")}
                </div>
              )}
            </div>
          </>
        )}
      </div>
      <BottomBar>
        <button type="button" className="btn btn-primary" onClick={next}>{t("See who is available")}</button>
      </BottomBar>
    </div>
  );
}

/* 3. Caregivers allowed to do this service */
export function CaregiverListScreen() {
  const { state, set, go } = useApp();
  const d = describeDraft(state);
  const load = useLoad(state.simulateFailure);

  const title = d.isCourse
    ? state.sameNurse
      ? t("Choose one {who} for all {n} visits", { who: d.who, n: d.visits })
      : t("Choose the {who} for visit 1", { who: d.who })
    : d.service.nurseOnly
      ? t("Nurses free at this time")
      : t("Caregivers free at this time");

  return (
    <div className="screen">
      <Header title={d.whenText} onBack={() => go("schedule")} />
      <div className="scroll" style={{ gap: 16 }}>
        <div className="stack" style={{ gap: 6 }}>
          <h1>{title}</h1>
          <p className="muted" style={{ fontSize: 15 }}>
            {d.service.nurseOnly
              ? t("Only registered nurses are shown, because this service needs a nursing licence.")
              : t("Registered nurses and trained compounders can do this service.")}
          </p>
          {d.isCourse && (
            <p style={{ fontSize: 15, fontWeight: 500 }}>
              {state.sameNurse
                ? t("Everyone shown is free at {time} on all {n} days.", { time: slotText(d.slot), n: d.visits })
                : t("Later visits go to any verified {who} who is free at {time}.", { who: d.who, time: slotText(d.slot) })}
            </p>
          )}
        </div>

        <div className="stack" style={{ gap: 8 }}>
          <h2>{t("Your preferences")}</h2>
          <div className="wrap">
            <Chip className="chip-toggle" selected={state.womenOnly} onClick={() => set({ womenOnly: !state.womenOnly })}>{t("Women only")}</Chip>
            {d.languages.map((lang) => (
              <Chip key={lang} className="chip-toggle" selected={state.language === lang} onClick={() => set({ language: state.language === lang ? null : lang })}>
                {t("Speaks {language}", { language: t(lang) })}
              </Chip>
            ))}
          </div>
        </div>

        {load.status === "loading" && <Skeleton rows={3} />}
        {load.status === "error" && (
          <ErrorState title={t("We could not find {whoPlural} near you", { whoPlural: d.whoPlural })} onRetry={load.retry} />
        )}

        {load.status === "ready" && d.noWomenFree && (
          <div className="warn-box stack" style={{ gap: 12 }}>
            <div className="stack-xs">
              <h2>{t("No woman {who} is free near you at this time", { who: d.who })}</h2>
              <div className="sub">
                {t("{n} male {who} free nearby. You can see them, or pick another time for a woman {who}.", { n: d.othersFree, who: d.who })}
              </div>
            </div>
            <button type="button" className="btn btn-warn" onClick={() => set({ womenOnly: false })}>
              {t("Show male {whoPlural}", { whoPlural: d.whoPlural })}
            </button>
            <button type="button" className="btn btn-warn" onClick={() => go("schedule")}>
              {t("Pick another time")}
            </button>
          </div>
        )}

        {load.status === "ready" && d.caregivers.length === 0 && !d.noWomenFree && (
          <div className="dashed-box stack">
            <div className="muted">{t("No {who} matches these preferences at this time.", { who: d.who })}</div>
            <button type="button" className="link-btn" onClick={() => set({ womenOnly: false, language: null })}>{t("Clear preferences")}</button>
            <button type="button" className="link-btn" onClick={() => go("schedule")}>{t("Pick another time")}</button>
          </div>
        )}

        {load.status === "ready" && d.caregivers.map((c) => (
          <button type="button" key={c.id} className="card card-btn" onClick={() => set({ caregiverId: c.id, screen: "caregiver" })}>
            <span className="row-inline" style={{ gap: 12, width: "100%" }}>
              <span className="avatar" style={{ width: 52, height: 52, fontSize: 18 }}>{c.initials}</span>
              <span className="stack-xs" style={{ flex: 1, minWidth: 0, gap: 1 }}>
                <span className="strong" style={{ fontSize: 17 }}>{c.name}</span>
                <span className="small muted">{t(c.qualification)}</span>
              </span>
              <Icon name="next" size={20} />
            </span>
            <span className="meta">
              <span className="row-inline strong" style={{ gap: 4 }}><Star filled />{c.rating}</span>
              <span className="muted">{t("{n} visits", { n: c.visitCount })}</span>
              <span className="muted">{t("{distance} away", { distance: c.distance })}</span>
              <span className="muted">{t("{years} experience", { years: yearsText(c.experienceYears) })}</span>
            </span>
            <span className="small muted">
              {c.gender === "F" ? t("Woman") : t("Man")} · {t("Speaks {language}", { language: c.speaks.map((l) => t(l)).join(", ") })}
            </span>
            <span className="row-inline small primary-text" style={{ gap: 6, fontWeight: 500 }}>
              <Icon name="shield" size={16} />
              {proofText(c)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* 4. One caregiver's profile */
export function CaregiverProfileScreen() {
  const { state, go } = useApp();
  const d = describeDraft(state);
  const c = d.caregiver;

  const bookLabel = d.isCourse
    ? state.sameNurse
      ? t("Book {name} for {n} visits", { name: c.first, n: d.visits })
      : t("Book {name} for visit 1", { name: c.first })
    : t("Book {name}", { name: c.first });

  return (
    <div className="screen">
      <Header title={t("Caregiver profile")} onBack={() => go("caregivers")} />
      <div className="scroll">
        <div className="row-inline" style={{ gap: 14 }}>
          <span className="avatar display" style={{ width: 72, height: 72, fontSize: 26 }}>{c.initials}</span>
          <div className="stack-xs" style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 26 }}>{c.name}</h1>
            <div className="muted">{t(c.qualification)}</div>
          </div>
        </div>

        <div className="grid grid-3">
          <div className="stat"><span className="n">{c.rating}</span><span className="tiny muted">{t("Rating")}</span></div>
          <div className="stat"><span className="n">{c.visitCount}</span><span className="tiny muted">{t("Home visits")}</span></div>
          <div className="stat"><span className="n">{yearsText(c.experienceYears)}</span><span className="tiny muted">{t("Experience")}</span></div>
        </div>

        <div className="tint-box stack">
          <h2>{t("Verified by us")}</h2>
          {[t("Government ID checked"), c.regLine, t("Address and references checked")].map((line) => (
            <div key={line} className="row-inline" style={{ gap: 10 }}>
              <span className="primary-text" style={{ display: "flex" }}><Icon name="check" size={18} strokeWidth={2.5} /></span>
              <span style={{ fontSize: 15 }}>{line}</span>
            </div>
          ))}
        </div>

        <Rows
          items={[
            { k: t("Speaks"), v: c.speaks.map((l) => t(l)).join(", ") },
            { k: t("Distance"), v: t("{distance} from you", { distance: c.distance }) },
            { k: t("Allowed to do"), v: allowedText(c) },
          ]}
        />

        <div className="stack">
          <h2>{t("What families say")}</h2>
          {SAMPLE_REVIEWS.map((r) => (
            <div key={r.who} className="card stack-sm" style={{ padding: "14px 16px" }}>
              <div style={{ fontSize: 15 }}>{t(r.text)}</div>
              <div className="tiny muted">{t(r.who)}</div>
            </div>
          ))}
        </div>
      </div>
      <BottomBar>
        <button type="button" className="btn btn-primary" onClick={() => go("review")}>{bookLabel}</button>
      </BottomBar>
    </div>
  );
}

/* 5. Review, price and payment */
const PAY_OPTIONS = [
  { id: "upi", label: "UPI", sub: "Any UPI app" },
  { id: "card", label: "Card", sub: "Debit or credit card" },
  { id: "cash", label: "Pay after the visit", sub: "Cash or UPI to the caregiver" },
] as const;

export function ReviewScreen() {
  const { state, set, go, open, notify } = useApp();
  const d = describeDraft(state);
  const action = useAction(state.simulateFailure);
  const contact = state.contact;
  const payNow = d.total + state.arrears; // includes any unpaid charge from an earlier cash booking
  const times = d.isCourse ? ` × ${d.visits}` : "";
  const serviceName = t(d.service.name);

  const caregiverLine = d.isCourse
    ? state.sameNurse
      ? t("{name}, every visit", { name: d.caregiver.name })
      : t("{name} first, then any available {who}", { name: d.caregiver.name, who: d.who })
    : d.caregiver.name;

  const summary = [
    { k: t("Service"), v: serviceName },
    ...(d.checks.length ? [{ k: t("Checks"), v: d.checks.map((c) => t(c.name)).join(", ") }] : []),
    { k: t("Patient"), v: d.patient.full },
    { k: d.isCourse ? t("First visit") : t("When"), v: d.whenText },
    ...(d.isCourse ? [{ k: t("Course"), v: t("{n} visits, {every}, until {to}", { n: d.visits, every: d.everyText, to: d.lastDay }) }] : []),
    { k: t("Where"), v: d.addressText },
    { k: t("Caregiver"), v: caregiverLine },
    { k: t("Prescription"), v: d.service.needsPrescription ? (state.hasPrescription ? t("Added") : t("Not added yet")) : t("Not needed") },
  ];

  // TODO: take payment (Razorpay) and create the booking through the API.
  const confirm = () =>
    action.run(() => {
      set({
        booking: {
          serviceId: d.service.id,
          patient: { id: d.patient.id, name: d.patient.name, relation: d.patient.relation, age: d.patient.age, gender: d.patient.gender },
          addressText: d.address ? addressMsg(d.address) : "",
          cityId: d.city.id,
          bookedAt: Date.now(),
          startDate: d.startDate,
          slot: d.slot,
          visits: d.visits,
          everyDays: state.every,
          sameCaregiver: state.sameNurse,
          caregiverId: d.caregiver.id,
          visitNo: 1,
          rotateFrom: 1,
          womenOnly: state.womenOnly,
          language: state.language,
          vitalIds: state.vitalIds,
          unitPrice: d.unitPrice,
          urgentFee: d.urgentFee,
          pay: state.pay,
          notifyContact: state.notifyFamily && contact !== null,
          carried: state.arrears,
        },
        step: 0,
        arrears: 0,
        caregiverLate: false,
        screen: "tracking",
        trail: [],
      });
      notify(msg("Booking confirmed"), msg("{service} for {patient}, {when}, with {caregiver}.", { service: msg(d.service.name), patient: d.patient.name, when: whenMsg(d.startDate, d.slot), caregiver: d.caregiver.name }));
    });

  return (
    <div className="screen">
      <Header title={t("Review and pay")} onBack={() => go("caregiver")} />
      <div className="scroll">
        <h1>{t("Check the details")}</h1>
        <Rows items={summary} />

        <div className="card stack price-lines" style={{ gap: 8 }}>
          <div className="line"><span className="muted">{serviceName}{times}</span><span>{money(d.serviceTotal)}</span></div>
          <div className="line"><span className="muted">{t("Home visit charge")}{times}</span><span>{money(d.feeTotal)}</span></div>
          {d.urgent && (
            <div className="line"><span className="muted">{t("Urgent visit charge (within 60 minutes)")}</span><span>{money(d.urgentFee)}</span></div>
          )}
          {state.arrears > 0 && (
            <div className="line"><span className="muted">{t("Unpaid charge from an earlier booking")}</span><span>{money(state.arrears)}</span></div>
          )}
          <div className="line total"><span>{t("Total")}</span><span>{money(payNow)}</span></div>
        </div>

        <div className="stack">
          <h2>{t("Pay with")}</h2>
          {PAY_OPTIONS.map((p) => (
            <RadioCard key={p.id} selected={state.pay === p.id} onClick={() => set({ pay: p.id })} label={t(p.label)} sub={t(p.sub)} />
          ))}
        </div>

        {contact ? (
          <CheckRow id="notify-family" checked={state.notifyFamily} onChange={(v) => set({ notifyFamily: v })}>
            <span className="stack-xs">
              <span className="strong">{t("Send visit updates to {name} ({relation})", { name: contact.name, relation: relationWord(contact.relation) })}</span>
              <span className="small muted">{t("A message when the {who} arrives and when the visit ends.", { who: d.who })}</span>
            </span>
          </CheckRow>
        ) : (
          <button type="button" className="link-btn" onClick={() => open("contact")}>
            {t("Add a family contact to send them visit updates")}
          </button>
        )}

        <p className="small muted">{policyLine(d.urgent, d.who)}</p>
      </div>
      <BottomBar>
        {action.failed && <ActionError>{t("The booking did not go through, and you have not been charged. Check your internet connection and try again.")}</ActionError>}
        <button type="button" className="btn btn-primary" disabled={action.busy} onClick={confirm}>
          {action.busy
            ? t("Confirming…")
            : d.isCourse
              ? t("Confirm {n} visits · {total}", { n: d.visits, total: money(payNow) })
              : t("Confirm booking · {total}", { total: money(payNow) })}
        </button>
      </BottomBar>
    </div>
  );
}
