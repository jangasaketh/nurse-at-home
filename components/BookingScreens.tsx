"use client";

import { useState } from "react";
import { useApp } from "@/lib/store";
import { FAMILY_CONTACT, SAMPLE_REVIEWS, SLOTS, URGENT_FEE, URGENT_SLOT, VISIT_COUNTS, VITAL_CHECKS } from "@/lib/data";
import { allowedText, dayAt, describeDraft, isVitals, money, prescriptionMissing, proofText } from "@/lib/booking";
import { Icon, Star } from "./Icon";
import { BottomBar, Chip, Header, RadioCard, Rows } from "./ui";

/* 1. Service details, with the prescription gate */
export function ServiceScreen() {
  const { state, set, go } = useApp();
  const { service, patient, address, unitPrice } = describeDraft(state);
  const [error, setError] = useState(false);
  const [openInfo, setOpenInfo] = useState<string | null>(null);
  const pickChecks = isVitals(service);
  const noChecks = pickChecks && state.vitalIds.length === 0;

  const next = () => {
    if (prescriptionMissing(service, state.hasPrescription) || noChecks) setError(true);
    else go("schedule");
  };

  const toggleCheck = (id: string) => {
    const on = state.vitalIds.includes(id);
    set({ vitalIds: on ? state.vitalIds.filter((v) => v !== id) : [...state.vitalIds, id] });
    setError(false);
  };

  return (
    <div className="screen">
      <Header title="Service details" onBack={() => go("home")} />
      <div className="scroll">
        <div className="stack" style={{ gap: 6 }}>
          <h1>{service.name}</h1>
          <p className="muted">{service.short}</p>
          <div className="row-inline strong" style={{ gap: 16, marginTop: 6 }}>
            <span>{money(unitPrice)}</span>
            <span className="muted" style={{ fontWeight: 500 }}>About {service.mins}</span>
          </div>
        </div>

        {pickChecks && (
          <div className="stack">
            <div className="stack-xs">
              <h2>Choose your checks</h2>
              <p className="small muted">Tick the checks you want. Tap a name to see what it is and how to prepare.</p>
            </div>
            {VITAL_CHECKS.map((v) => {
              const on = state.vitalIds.includes(v.id);
              const open = openInfo === v.id;
              return (
                <div key={v.id} className={`check-item ${on ? "on" : ""}`}>
                  <div className="check-row">
                    <input
                      id={`check-${v.id}`}
                      type="checkbox"
                      checked={on}
                      onChange={() => toggleCheck(v.id)}
                      aria-label={`Add ${v.name}`}
                    />
                    <button type="button" className="check-name" aria-expanded={open} onClick={() => setOpenInfo(open ? null : v.id)}>
                      <span className="stack-xs">
                        <span className="strong">{v.name}</span>
                        <span className="small primary-text">{open ? "Hide details" : "What is this?"}</span>
                      </span>
                      <span className="strong">{money(v.price)}</span>
                    </button>
                  </div>
                  {open && (
                    <div className="check-info">
                      <div className="kv"><span className="k">What it tells you</span><span>{v.what}</span></div>
                      <div className="kv"><span className="k">How it is done</span><span>{v.how}</span></div>
                      <div className="kv"><span className="k">How to prepare</span><span>{v.prepare}</span></div>
                      <p className="tiny muted">The nurse explains your reading. Your doctor decides what it means for you.</p>
                    </div>
                  )}
                </div>
              );
            })}
            {error && noChecks && <div role="alert" className="error">Choose at least one check to continue.</div>}
          </div>
        )}

        <div className="card stack">
          <h2>What the visit includes</h2>
          {service.includes.map((line) => (
            <div key={line} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span className="primary-text" style={{ paddingTop: 2 }}><Icon name="check" size={18} strokeWidth={2.5} /></span>
              <span style={{ fontSize: 15 }}>{line}</span>
            </div>
          ))}
        </div>

        <div className="card stack" style={{ gap: 12 }}>
          <h2>Who brings what</h2>
          <div className="kv"><span className="k">The {service.nurseOnly ? "nurse" : "caregiver"} brings</span><span>{service.nurseBrings}</span></div>
          <div className="kv"><span className="k">You keep ready</span><span>{service.youKeepReady}</span></div>
        </div>

        <Rows items={[{ k: "Patient", v: patient.full }, { k: "Address", v: address }]} />

        {service.needsPrescription && (
          <div className="warn-box stack" style={{ gap: 12 }}>
            <div className="stack-xs">
              <h2>Doctor&apos;s prescription needed</h2>
              <div className="sub">
                This service cannot be booked without one. We do not arrange doctor consultations, so please get it
                from your own doctor. The nurse checks it against the medicine before starting.
              </div>
            </div>
            {state.hasPrescription ? (
              <div className="between" style={{ background: "var(--surface)", borderRadius: 12, padding: "6px 12px" }}>
                <span className="row-inline strong" style={{ color: "var(--ok)" }}>
                  <Icon name="check" size={20} strokeWidth={2.5} />
                  Prescription added
                </span>
                <button type="button" className="link-btn small" style={{ color: "var(--warn-ink)" }} onClick={() => set({ hasPrescription: false })}>
                  Remove
                </button>
              </div>
            ) : (
              // TODO: open the camera or file picker and upload to storage.
              <button type="button" className="btn btn-warn" onClick={() => { set({ hasPrescription: true }); setError(false); }}>
                <Icon name="upload" size={20} />
                Add photo of prescription
              </button>
            )}
            {error && <div role="alert" className="error">Add the prescription to continue.</div>}
          </div>
        )}
      </div>
      <BottomBar>
        <button type="button" className="btn btn-primary" onClick={next}>Choose date and time</button>
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
      <Header title={d.service.name} onBack={() => go("service")} />
      <div className="scroll gap-lg">
        <h1>When should the nurse come?</h1>

        <div className="grid grid-2">
          <Chip className="strong" selected={!state.repeat} onClick={() => set({ repeat: false })}>One visit</Chip>
          <Chip className="strong" selected={state.repeat} onClick={() => set({ repeat: true, ...clearUrgent })}>Repeat visits</Chip>
        </div>

        <div className="stack">
          <h2>{state.repeat ? "First visit" : "Day"}</h2>
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
          <h2>Arrival time</h2>
          {canBeUrgent && (
            <RadioCard
              selected={state.slot === URGENT_SLOT}
              onClick={() => { set({ slot: URGENT_SLOT }); setError(false); }}
              label={`As soon as possible · ${money(URGENT_FEE)} extra`}
              sub={`The nearest free ${d.who} reaches you within 60 minutes.`}
            />
          )}
          <div className="grid grid-3">
            {SLOTS.map((slot) => (
              <Chip key={slot} selected={slot === state.slot} onClick={() => { set({ slot }); setError(false); }}>
                {slot}
              </Chip>
            ))}
          </div>
          {error && <div role="alert" className="error">Pick an arrival time to continue.</div>}
          <p className="small muted">The nurse arrives within 30 minutes of the time you pick.</p>
        </div>

        {state.repeat && (
          <>
            <div className="stack">
              <h2>How many visits?</h2>
              <div className="grid grid-5">
                {VISIT_COUNTS.map((n) => (
                  <Chip key={n} className="chip-num" selected={n === state.count} onClick={() => set({ count: n })}>{n}</Chip>
                ))}
              </div>
            </div>

            <div className="stack">
              <h2>How often?</h2>
              <div className="grid grid-2">
                <Chip selected={state.every === 1} onClick={() => set({ every: 1 })}>Every day</Chip>
                <Chip selected={state.every === 2} onClick={() => set({ every: 2 })}>Every 2 days</Chip>
              </div>
            </div>

            <div className="stack">
              <h2>Who should come?</h2>
              <RadioCard
                selected={state.sameNurse}
                onClick={() => set({ sameNurse: true })}
                label={`Same ${d.who} every visit`}
                sub="One person follows the healing from start to finish."
              />
              <RadioCard
                selected={!state.sameNurse}
                onClick={() => set({ sameNurse: false })}
                label={`Any available ${d.who}`}
                sub="Easier to get your time. You see who is coming the evening before."
              />
            </div>

            <div className="tint-box stack-sm">
              <div className="strong">
                {d.visits} visits, {d.everyText}, {d.firstDay} to {d.lastDay}, {d.slot}
              </div>
              {d.service.needsPrescription && (
                <div className="small" style={{ color: "var(--ink-soft)" }}>
                  The prescription must cover every visit. The nurse checks it each time.
                </div>
              )}
            </div>
          </>
        )}
      </div>
      <BottomBar>
        <button type="button" className="btn btn-primary" onClick={next}>See who is available</button>
      </BottomBar>
    </div>
  );
}

/* 3. Caregivers allowed to do this service */
export function CaregiverListScreen() {
  const { state, set, go } = useApp();
  const d = describeDraft(state);

  const title = d.isCourse
    ? state.sameNurse
      ? `Choose one ${d.who} for all ${d.visits} visits`
      : `Choose the ${d.who} for visit 1`
    : d.service.nurseOnly
      ? "Nurses free at this time"
      : "Caregivers free at this time";

  return (
    <div className="screen">
      <Header title={d.whenText} onBack={() => go("schedule")} />
      <div className="scroll" style={{ gap: 16 }}>
        <div className="stack" style={{ gap: 6 }}>
          <h1>{title}</h1>
          <p className="muted" style={{ fontSize: 15 }}>
            {d.service.nurseOnly
              ? "Only registered nurses are shown, because this service needs a nursing licence."
              : "Registered nurses and trained compounders can do this service."}
          </p>
          {d.isCourse && (
            <p style={{ fontSize: 15, fontWeight: 500 }}>
              {state.sameNurse
                ? `Everyone shown is free at ${d.slot} on all ${d.visits} days.`
                : `Later visits go to any verified ${d.who} who is free at ${d.slot}.`}
            </p>
          )}
        </div>

        <div className="stack" style={{ gap: 8 }}>
          <h2>Your preferences</h2>
          <div className="wrap">
            <Chip className="chip-toggle" selected={state.womenOnly} onClick={() => set({ womenOnly: !state.womenOnly })}>Women only</Chip>
            {d.languages.map((lang) => (
              <Chip key={lang} className="chip-toggle" selected={state.language === lang} onClick={() => set({ language: state.language === lang ? null : lang })}>
                Speaks {lang}
              </Chip>
            ))}
          </div>
        </div>

        {d.noWomenFree && (
          <div className="warn-box stack" style={{ gap: 12 }}>
            <div className="stack-xs">
              <h2>No woman {d.who} is free near you at this time</h2>
              <div className="sub">
                {d.othersFree === 1 ? `1 male ${d.who} is` : `${d.othersFree} male ${d.who}s are`} free nearby. You can
                see them, or pick another time for a woman {d.who}.
              </div>
            </div>
            <button type="button" className="btn btn-warn" onClick={() => set({ womenOnly: false })}>
              Show male {d.who}s
            </button>
            <button type="button" className="btn btn-warn" onClick={() => go("schedule")}>
              Pick another time
            </button>
          </div>
        )}

        {d.caregivers.length === 0 && !d.noWomenFree && (
          <div className="dashed-box stack">
            <div className="muted">No {d.who} matches these preferences at this time.</div>
            <button type="button" className="link-btn" onClick={() => set({ womenOnly: false, language: null })}>Clear preferences</button>
            <button type="button" className="link-btn" onClick={() => go("schedule")}>Pick another time</button>
          </div>
        )}

        {d.caregivers.map((c) => (
          <button type="button" key={c.id} className="card card-btn" onClick={() => set({ caregiverId: c.id, screen: "caregiver" })}>
            <span className="row-inline" style={{ gap: 12, width: "100%" }}>
              <span className="avatar" style={{ width: 52, height: 52, fontSize: 18 }}>{c.initials}</span>
              <span className="stack-xs" style={{ flex: 1, minWidth: 0, gap: 1 }}>
                <span className="strong" style={{ fontSize: 17 }}>{c.name}</span>
                <span className="small muted">{c.qualification}</span>
              </span>
              <Icon name="next" size={20} />
            </span>
            <span className="meta">
              <span className="row-inline strong" style={{ gap: 4 }}><Star filled />{c.rating}</span>
              <span className="muted">{c.visitCount} visits</span>
              <span className="muted">{c.distance} away</span>
              <span className="muted">{c.experience} experience</span>
            </span>
            <span className="small muted">{c.gender === "F" ? "Woman" : "Man"} · Speaks {c.speaks.join(", ")}</span>
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
      ? `Book ${c.first} for ${d.visits} visits`
      : `Book ${c.first} for visit 1`
    : `Book ${c.first}`;

  return (
    <div className="screen">
      <Header title="Caregiver profile" onBack={() => go("caregivers")} />
      <div className="scroll">
        <div className="row-inline" style={{ gap: 14 }}>
          <span className="avatar display" style={{ width: 72, height: 72, fontSize: 26 }}>{c.initials}</span>
          <div className="stack-xs" style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 26 }}>{c.name}</h1>
            <div className="muted">{c.qualification}</div>
          </div>
        </div>

        <div className="grid grid-3">
          <div className="stat"><span className="n">{c.rating}</span><span className="tiny muted">Rating</span></div>
          <div className="stat"><span className="n">{c.visitCount}</span><span className="tiny muted">Home visits</span></div>
          <div className="stat"><span className="n">{c.experience}</span><span className="tiny muted">Experience</span></div>
        </div>

        <div className="tint-box stack">
          <h2>Verified by us</h2>
          {["Government ID checked", c.regLine, "Address and references checked"].map((line) => (
            <div key={line} className="row-inline" style={{ gap: 10 }}>
              <span className="primary-text" style={{ display: "flex" }}><Icon name="check" size={18} strokeWidth={2.5} /></span>
              <span style={{ fontSize: 15 }}>{line}</span>
            </div>
          ))}
        </div>

        <Rows
          items={[
            { k: "Speaks", v: c.speaks.join(", ") },
            { k: "Distance", v: `${c.distance} from you` },
            { k: "Allowed to do", v: allowedText(c) },
          ]}
        />

        <div className="stack">
          <h2>What families say</h2>
          {SAMPLE_REVIEWS.map((r) => (
            <div key={r.who} className="card stack-sm" style={{ padding: "14px 16px" }}>
              <div style={{ fontSize: 15 }}>{r.text}</div>
              <div className="tiny muted">{r.who}</div>
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
  const { state, set, go } = useApp();
  const d = describeDraft(state);
  const times = d.isCourse ? ` × ${d.visits}` : "";

  const caregiverLine = d.isCourse
    ? state.sameNurse
      ? `${d.caregiver.name}, every visit`
      : `${d.caregiver.name} first, then any available ${d.who}`
    : d.caregiver.name;

  const summary = [
    { k: "Service", v: d.service.name },
    ...(d.checks.length ? [{ k: "Checks", v: d.checks.map((c) => c.name).join(", ") }] : []),
    { k: "Patient", v: d.patient.full },
    { k: d.isCourse ? "First visit" : "When", v: d.whenText },
    ...(d.isCourse ? [{ k: "Course", v: `${d.visits} visits, ${d.everyText}, until ${d.lastDay}` }] : []),
    { k: "Where", v: d.address },
    { k: "Caregiver", v: caregiverLine },
    { k: "Prescription", v: d.service.needsPrescription ? (state.hasPrescription ? "Added" : "Not added yet") : "Not needed" },
  ];

  // TODO: take payment (Razorpay) and create the booking through the API.
  const confirm = () =>
    set({
      booking: {
        serviceId: d.service.id,
        patientId: d.patient.id,
        startOffset: state.dateIdx,
        slot: d.slot,
        visits: d.visits,
        everyDays: state.every,
        sameCaregiver: state.sameNurse,
        caregiverId: d.caregiver.id,
        visitNo: 1,
        rotateFrom: 1,
        womenOnly: state.womenOnly,
        language: state.language,
        cityId: state.cityId,
        vitalIds: state.vitalIds,
      },
      step: 0,
      screen: "tracking",
    });

  return (
    <div className="screen">
      <Header title="Review and pay" onBack={() => go("caregiver")} />
      <div className="scroll">
        <h1>Check the details</h1>
        <Rows items={summary} />

        <div className="card stack price-lines" style={{ gap: 8 }}>
          <div className="line"><span className="muted">{d.service.name}{times}</span><span>{money(d.serviceTotal)}</span></div>
          <div className="line"><span className="muted">Home visit charge{times}</span><span>{money(d.feeTotal)}</span></div>
          {d.urgent && (
            <div className="line"><span className="muted">Urgent visit charge (within 60 minutes)</span><span>{money(d.urgentFee)}</span></div>
          )}
          <div className="line total"><span>Total</span><span>{money(d.total)}</span></div>
        </div>

        <div className="stack">
          <h2>Pay with</h2>
          {PAY_OPTIONS.map((p) => (
            <RadioCard key={p.id} selected={state.pay === p.id} onClick={() => set({ pay: p.id })} label={p.label} sub={p.sub} />
          ))}
        </div>

        <label className="check-card" htmlFor="notify-family">
          <input id="notify-family" type="checkbox" checked={state.notifyFamily} onChange={(e) => set({ notifyFamily: e.target.checked })} />
          <span className="stack-xs">
            <span className="strong">Send visit updates to {FAMILY_CONTACT}</span>
            <span className="small muted">A message when the {d.who} arrives and when the visit ends.</span>
          </span>
        </label>

        <p className="small muted">
          {d.isCourse
            ? `Cancel any remaining visit for free until the ${d.who} sets off.`
            : `Free to cancel until the ${d.who} sets off.`}
        </p>
      </div>
      <BottomBar>
        <button type="button" className="btn btn-primary" onClick={confirm}>
          {d.isCourse ? `Confirm ${d.visits} visits · ${money(d.total)}` : `Confirm booking · ${money(d.total)}`}
        </button>
      </BottomBar>
    </div>
  );
}
