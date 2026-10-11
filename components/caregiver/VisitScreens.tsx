"use client";

// CAREGIVER APP: carrying out a visit, step by step, then the visit record.

import { useEffect, useState } from "react";
import { useCg, type ActiveVisit, type Earning, type VisitRecord } from "@/lib/caregiver/store";
import {
  CAREGIVER_CANCEL_REASONS, checksOf, earningFor, INJECTION_SITES, isUrgent, NEXT_DRESSING, NO_SHOW_PAY, READING_FIELDS, readingFlag,
  SAMPLE_RX, serviceOf, SIDE_EFFECTS, visitPrice, WOUND_STATES, type Job,
} from "@/lib/caregiver/data";
import { directionsUrl, whenText } from "@/lib/caregiver/rules";
import { ARRIVAL_CODE, LATE_MINUTES, NO_SHOW_MINUTES } from "@/lib/data";
import { addDays, money, msg, newId, todayISO, tx, type Msg } from "@/lib/booking";
import { useAction } from "@/lib/fake-api";
import { t } from "@/lib/i18n";
import type { PhotoFile } from "@/lib/prescription";
import { Icon } from "../Icon";
import { PhotoPicker } from "../PhotoPicker";
import { ActionError, BottomBar, CheckRow, Chip, EmptyState, Header, RadioCard, Rows } from "../ui";

const STEP_LABELS = ["Accepted", "On the way", "At the door", "Safety check", "Care in progress"];

/** Ends this visit of a booking: a same-caregiver course moves to its next visit; anything else leaves the list. */
function afterVisit(upcoming: Job[], job: Job, wholeBooking: boolean) {
  const rest = upcoming.filter((j) => j.id !== job.id);
  if (!wholeBooking && job.sameCaregiver && job.visitNo < job.visits) {
    return { upcoming: [...rest, { ...job, visitNo: job.visitNo + 1, dateOffset: job.dateOffset + job.everyDays }], next: job };
  }
  return { upcoming: rest, next: null };
}

const nextVisitMsg = (job: Job): Msg => ({ date: addDays(todayISO(), job.dateOffset + job.everyDays), slot: job.slot });

/* ---------- The visit ---------- */

export function VisitScreen() {
  const { state, update, set, open, go, jobById } = useCg();
  const [sos, setSos] = useState(false);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState(false);
  const [checkError, setCheckError] = useState(false);
  const [mismatch, setMismatch] = useState(false);
  const [callNote, setCallNote] = useState(false);
  const [, tick] = useState(0);

  const active = state.active;
  const job = active ? jobById(active.jobId) : null;

  // Re-draw every second while the "nobody is answering" timer runs.
  useEffect(() => {
    if (!active?.waitStartedAt) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [active?.waitStartedAt]);

  if (!active || !job) {
    return (
      <div className="screen">
        <Header title={t("Visit")} onBack={() => go("jobs")} />
        <div className="scroll"><EmptyState icon="calendar" title={t("No visit in progress")} body={t("Start a visit from the Jobs or Schedule screen.")} /></div>
      </div>
    );
  }

  const service = serviceOf(job);
  const step = active.step;
  const setActive = (patch: Partial<ActiveVisit>) => update((prev) => ({ active: prev.active ? { ...prev.active, ...patch } : null }));
  const name = job.patient.first;

  // Safety checks before care. Prescription services check the prescription and the medicine.
  const checkItems: { id: string; label: string }[] = [
    ...(service.needsPrescription
      ? [
          { id: "rx-name", label: t("The prescription is for {name}, {age}.", { name: job.patient.full, age: job.patient.age }) },
          { id: "rx-match", label: t("The medicine, dose and route match the prescription.") },
          { id: "rx-expiry", label: t("The medicine is sealed and not past its expiry date.") },
        ]
      : []),
    ...(job.serviceId === "vitals" ? [{ id: "kit", label: t("Equipment ready for: {checks}", { checks: checksOf(job).map((c) => t(c.name)).join(", ") }) }] : []),
    { id: "consent", label: t("{name} or the family agreed to the care.", { name }) },
    { id: "hands", label: t("Hands cleaned and fresh gloves on.") },
  ];
  const allChecked = checkItems.every((c) => active.checks[c.id]);

  const waitLeft = active.waitStartedAt ? Math.max(0, NO_SHOW_MINUTES * 60 - Math.floor((Date.now() - active.waitStartedAt) / 1000)) : null;
  const canMarkMissed = active.waitSkipped || waitLeft === 0;

  const endWithoutCare = (kind: "missed" | "stopped") => {
    const earning: Earning = { id: newId("e"), at: Date.now(), kind, title: msg(service.name), patient: `${job.patient.first} ${job.patient.full.split(" ").slice(-1)[0].charAt(0)}.`, amount: NO_SHOW_PAY, cash: 0 };
    const record: VisitRecord = {
      kind, jobId: job.id, title: msg(service.name), patient: job.patient.full, at: Date.now(), note: "", details: [], readings: [], warnings: [],
      earned: NO_SHOW_PAY, cash: 0, nextVisit: null,
    };
    update((prev) => {
      const { upcoming, next } = afterVisit(prev.upcoming, job, kind === "stopped");
      return {
        upcoming, active: null, earnings: [earning, ...prev.earnings], lastRecord: { ...record, nextVisit: next ? nextVisitMsg(next) : null },
        records: [record, ...prev.records], screen: "visit-done", trail: [],
      };
    });
  };

  const verifyCode = () => {
    if (code === ARRIVAL_CODE) {
      setCodeError(false);
      setActive({ step: 3, waitStartedAt: null });
    } else setCodeError(true);
  };

  return (
    <div className="screen">
      <Header title={t("Visit")} onBack={() => go("jobs")} backLabel={t("Back to jobs")}
        right={<button type="button" className="sos" onClick={() => setSos(!sos)}>SOS</button>} />
      <div className="scroll" style={{ gap: 16 }}>
        {sos && (
          <div role="alert" className="danger-box stack-sm">
            <div className="strong">{t("If you feel unsafe, leave and call 112.")}</div>
            <div className="small">{t("Prototype: in the real app this alerts our support team with your location.")}</div>
            <div className="actions">
              <a className="btn btn-danger-solid" style={{ minHeight: 48, fontSize: 16 }} href="tel:112">{t("Call 112")}</a>
              <button type="button" className="btn btn-outline" onClick={() => setSos(false)}>{t("I am safe")}</button>
            </div>
          </div>
        )}

        <div className="stack-xs">
          <span className="small muted">{whenText(job)}{job.visits > 1 ? ` · ${t("Visit {n} of {total}", { n: job.visitNo, total: job.visits })}` : ""}</span>
          <h1 style={{ fontSize: 24 }}>{t(service.name)}</h1>
          <span className="muted">{job.patient.full}, {job.patient.age}</span>
        </div>

        <div className="stepper" aria-label={t("Visit progress")}>
          {STEP_LABELS.map((label, i) => (
            <span key={label} className={`stepper-dot ${i < step ? "done" : ""} ${i === step ? "current" : ""}`} title={t(label)} />
          ))}
        </div>
        <div className="small strong primary-text">{t("Step {n} of {total}: {label}", { n: step + 1, total: STEP_LABELS.length, label: t(STEP_LABELS[step]) })}</div>

        {/* Step 0 and 1: getting there */}
        {step <= 1 && (
          <>
            {step === 1 && (
              <div className="map">
                <svg viewBox="0 0 350 132" preserveAspectRatio="none" fill="none" aria-hidden="true">
                  <path d="M40 96 C 110 96, 110 40, 180 40 S 260 84, 310 44" stroke="currentColor" strokeWidth="3" strokeDasharray="2 9" strokeLinecap="round" />
                  <circle cx="40" cy="96" r="8" fill="currentColor" />
                  <circle cx="310" cy="44" r="10" fill="#FFFFFF" stroke="currentColor" strokeWidth="3" />
                </svg>
                <div className="label">{t("Live map goes here")}</div>
              </div>
            )}
            <Rows items={[{ k: t("Address"), v: job.address }, { k: t("Landmark"), v: t(job.landmark) }]} />
            <div className="actions">
              <a className="btn btn-outline" href={directionsUrl(job)} target="_blank" rel="noopener noreferrer"><Icon name="pin" size={20} />{t("Directions")}</a>
              <button type="button" className="btn btn-outline" onClick={() => setCallNote(true)}><Icon name="phone" size={20} />{t("Call")}</button>
            </div>
            {callNote && <p className="small muted">{t("Calls are switched off in the prototype. In the real app they go through us, so phone numbers stay private.")}</p>}
            <div className="card stack-sm">
              <span className="tiny muted strong">{t("From the patient")}</span>
              <span>{t(job.note)}</span>
              <span className="tiny muted strong" style={{ marginTop: 6 }}>{t("Bring")}</span>
              <span>{t(service.nurseBrings)}</span>
            </div>
            {step === 1 && (
              <div className="stack">
                <h2>{t("Running late?")}</h2>
                <div className="grid grid-3" role="group" aria-label={t("Running late?")}>
                  {[10, 20, 30].map((m) => (
                    <Chip key={m} selected={active.late === m} onClick={() => setActive({ late: m })}>{m === 30 ? t("30+ min") : t("{n} min", { n: m })}</Chip>
                  ))}
                </div>
                {active.late > 0 && (
                  <div className={active.late >= LATE_MINUTES ? "warn-box small" : "tint-box small"} role="status">
                    {t("We told {name} you are about {n} minutes late.", { name, n: active.late })}
                    {active.late >= LATE_MINUTES && ` ${t("The patient can now cancel for free.")}`}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Step 2: at the door */}
        {step === 2 && (
          <div className="stack">
            <h2>{t("Ask for the arrival code")}</h2>
            <p className="small muted">{t("{name} sees a 4-digit code in their app. Checking it proves you are at the right home.", { name })}</p>
            <label htmlFor="cg-code">{t("Arrival code")}</label>
            <input id="cg-code" className="otp-input" type="tel" inputMode="numeric" value={code}
              onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 4)); setCodeError(false); }} />
            {codeError && <div role="alert" className="error">{t("That code does not match. Ask {name} to check the code in their app.", { name })}</div>}
            <p className="small muted">{t("Prototype: the code is {code}.", { code: ARRIVAL_CODE })}</p>
            <button type="button" className="btn btn-primary" onClick={verifyCode}>{t("Check the code")}</button>

            <div className="card stack-sm" style={{ marginTop: 8 }}>
              {!active.waitStartedAt ? (
                <>
                  <span className="strong">{t("Nobody is answering?")}</span>
                  <span className="small muted">{t("Wait {n} minutes and keep trying to call. After that you can mark the visit as missed and you get the home visit charge.", { n: NO_SHOW_MINUTES })}</span>
                  <button type="button" className="btn btn-outline" onClick={() => setActive({ waitStartedAt: Date.now() })}>{t("Start the {n}-minute wait", { n: NO_SHOW_MINUTES })}</button>
                </>
              ) : (
                <>
                  <span className="strong">{canMarkMissed ? t("You waited {n} minutes", { n: NO_SHOW_MINUTES }) : t("Waiting at the door")}</span>
                  {!canMarkMissed && waitLeft !== null && (
                    <span className="wait-timer" role="timer" aria-live="off">{`${Math.floor(waitLeft / 60)}:${String(waitLeft % 60).padStart(2, "0")}`}</span>
                  )}
                  <span className="small muted">{t("We are also trying to reach {name}.", { name })}</span>
                  {canMarkMissed ? (
                    <button type="button" className="btn btn-danger" onClick={() => endWithoutCare("missed")}>{t("Mark as missed · get {amount}", { amount: money(NO_SHOW_PAY) })}</button>
                  ) : (
                    <button type="button" className="link-btn small" onClick={() => setActive({ waitSkipped: true })}>{t("Prototype: skip the wait")}</button>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Step 3: safety check */}
        {step === 3 && (
          <div className="stack">
            <h2>{t("Before you start")}</h2>
            {service.needsPrescription && SAMPLE_RX[service.id] && (
              <div className="rx-paper" aria-label={t("Prescription")}>
                <span className="rx-sample">{t("Sample")}</span>
                <div className="strong">{SAMPLE_RX[service.id].doctor}</div>
                <div className="tiny muted">{t("Patient")}: {job.patient.full}, {job.patient.age}</div>
                <div className="rx-lines">
                  <span className="rx-symbol">℞</span>
                  {SAMPLE_RX[service.id].lines.map((l) => <div key={l}>{l}</div>)}
                </div>
                <div className="tiny muted">{t("In the real app this is the photo the patient added.")}</div>
              </div>
            )}
            {checkItems.map((c) => (
              <CheckRow key={c.id} id={`chk-${c.id}`} checked={!!active.checks[c.id]} onChange={(v) => { setActive({ checks: { ...active.checks, [c.id]: v } }); setCheckError(false); }}>
                {c.label}
              </CheckRow>
            ))}
            {checkError && <div role="alert" className="error">{t("Tick every check before you start.")}</div>}
            {!mismatch ? (
              <button type="button" className="link-btn" onClick={() => setMismatch(true)}>{t("Something does not match")}</button>
            ) : (
              <div className="danger-box stack-sm" role="alert">
                <div className="strong">{t("Do not give any medicine or start care.")}</div>
                <div className="small">{t("Explain kindly to the family and call support. You still get the home visit charge.")}</div>
                <button type="button" className="btn btn-danger-solid" style={{ minHeight: 48, fontSize: 16 }} onClick={() => endWithoutCare("stopped")}>{t("Stop the visit")}</button>
                <button type="button" className="btn btn-plain" onClick={() => setMismatch(false)}>{t("Everything is fine")}</button>
              </div>
            )}
          </div>
        )}

        {/* Step 4: care */}
        {step === 4 && (
          <div className="stack">
            <h2>{t("During the visit")}</h2>
            <div className="card stack-sm">
              {service.includes.map((line) => (
                <div key={line} className="row-inline" style={{ alignItems: "flex-start" }}>
                  <span className="primary-text" style={{ paddingTop: 2 }}><Icon name="check" size={18} strokeWidth={2.5} /></span>
                  <span>{t(line)}</span>
                </div>
              ))}
            </div>
            {job.pay === "cash" && (
              <div className="warn-box small">{t("Collect {amount} in cash or UPI before you leave.", { amount: money(visitPrice(job).total) })}</div>
            )}
          </div>
        )}
      </div>

      <BottomBar>
        {step === 0 && (
          <div className="stack-sm">
            <button type="button" className="btn btn-primary" onClick={() => setActive({ step: 1 })}>{t("Start the trip")}</button>
            <button type="button" className="btn btn-plain" onClick={() => open("cancel-visit", { openJobId: job.id })}>{t("I cannot do this visit")}</button>
          </div>
        )}
        {step === 1 && (
          <div className="stack-sm">
            <button type="button" className="btn btn-primary" onClick={() => setActive({ step: 2 })}>{t("I have arrived")}</button>
            <button type="button" className="btn btn-plain" onClick={() => open("cancel-visit", { openJobId: job.id })}>{t("I cannot do this visit")}</button>
          </div>
        )}
        {step === 2 && (
          <button type="button" className="btn btn-plain" onClick={() => open("cancel-visit", { openJobId: job.id })}>{t("I cannot do this visit")}</button>
        )}
        {step === 3 && (
          <button type="button" className="btn btn-primary" onClick={() => (allChecked ? setActive({ step: 4 }) : setCheckError(true))}>{t("Start care")}</button>
        )}
        {step === 4 && (
          <button type="button" className="btn btn-primary" onClick={() => set({ screen: "record", trail: ["visit"] })}>{t("Finish and write the record")}</button>
        )}
      </BottomBar>
    </div>
  );
}

/* ---------- Visit record ---------- */

export function RecordScreen() {
  const { state, update, back, jobById } = useCg();
  const action = useAction(false);
  const job = state.active ? jobById(state.active.jobId) : null;
  const [note, setNote] = useState("");
  const [site, setSite] = useState<string | null>(null);
  const [reaction, setReaction] = useState<string | null>(null);
  const [volume, setVolume] = useState<string | null>(null);
  const [cannulaOut, setCannulaOut] = useState(false);
  const [wound, setWound] = useState<string | null>(null);
  const [nextDressing, setNextDressing] = useState<string | null>(null);
  const [woundPhoto, setWoundPhoto] = useState<PhotoFile | null>(null);
  const [dosesOnTime, setDosesOnTime] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [cashTaken, setCashTaken] = useState(false);
  const [tried, setTried] = useState(false);

  if (!job) return null;
  const service = serviceOf(job);
  const id = service.id;
  const checks = checksOf(job);
  const price = visitPrice(job);
  const pay = earningFor(job);

  const fields = checks.flatMap((c) => READING_FIELDS[c.id] ?? []);
  const fieldError = (f: { id: string; min: number; max: number }) => {
    const v = values[f.id];
    if (!v) return t("Enter the reading.");
    const n = Number(v);
    return Number.isNaN(n) || n < f.min || n > f.max ? t("Check this reading. It should be between {min} and {max}.", { min: f.min, max: f.max }) : "";
  };
  const flags = checks.map((c) => readingFlag(c.id, values)).filter((x): x is string => !!x);
  const serious = [reaction, wound].some((x) => x === "Serious. Needs a doctor" || x === "Looks infected. Needs a doctor");
  const warnings = [...flags, ...(serious ? ["Tell the family to contact their doctor today."] : [])];

  const errors: Record<string, string> = {
    note: note.trim().length < 10 ? t("Write a short note about what you did.") : "",
    site: id === "inj" && !site ? t("Choose where you gave the injection.") : "",
    reaction: (id === "inj" || id === "med") && !reaction ? t("Choose one.") : "",
    volume: id === "iv" && !volume ? t("Choose how much was given.") : "",
    cannula: id === "iv" && !cannulaOut ? t("Confirm the cannula is out and the site is dressed.") : "",
    wound: (id === "dress" || id === "elder") && !wound ? t("Choose how the wound looks.") : "",
    next: (id === "dress" || id === "elder") && !nextDressing ? t("Choose when the next dressing is due.") : "",
    readings: fields.some((f) => fieldError(f)) ? "x" : "",
    cash: job.pay === "cash" && !cashTaken ? t("Confirm you collected the payment.") : "",
  };

  const save = () => {
    setTried(true);
    if (Object.values(errors).some(Boolean)) return;
    const details: { label: Msg; value: Msg }[] = [];
    if (site) details.push({ label: msg("Injection site"), value: msg(site) });
    if (reaction) details.push({ label: msg(id === "inj" ? "Reaction" : "Side effects"), value: msg(reaction) });
    if (volume) details.push({ label: msg("Amount given"), value: volume });
    if (id === "med") details.push({ label: msg("Doses"), value: msg(dosesOnTime ? "All given on time" : "Not all on time. See the note") });
    if (wound) details.push({ label: msg("Wound"), value: msg(wound) });
    if (nextDressing) details.push({ label: msg("Next dressing"), value: msg(nextDressing) });
    if (woundPhoto) details.push({ label: msg("Wound photo"), value: msg("Added") });
    const readings = checks.map((c) => ({
      label: msg(c.name),
      value: c.id === "bp" ? `${values.bp_sys}/${values.bp_dia} mmHg` : (READING_FIELDS[c.id] ?? []).map((f) => `${values[f.id]} ${f.unit}`).join(" "),
    }));
    const cash = job.pay === "cash" ? price.total : 0;
    // TODO: save the record through the API. The patient sees it under Records, and the family contact gets a message.
    action.run(() =>
      update((prev) => {
        const { upcoming, next } = afterVisit(prev.upcoming, job, false);
        const record: VisitRecord = {
          kind: "completed", jobId: job.id, title: msg(service.name), patient: job.patient.full, at: Date.now(), note: note.trim(), details, readings,
          warnings: warnings.map((w) => msg(w)), earned: pay.total, cash, nextVisit: next ? nextVisitMsg(next) : null,
        };
        const earning: Earning = { id: newId("e"), at: Date.now(), kind: "visit", title: msg(service.name), patient: `${job.patient.first} ${job.patient.full.split(" ").slice(-1)[0].charAt(0)}.`, amount: pay.total, cash };
        return { upcoming, active: null, lastRecord: record, records: [record, ...prev.records], earnings: [earning, ...prev.earnings], screen: "visit-done", trail: [] };
      }),
    );
  };

  const chips = (options: string[], value: string | null, onPick: (v: string) => void, label: string, error: string) => (
    <div className="stack" style={{ gap: 6 }}>
      <span className="label">{label}</span>
      <div className="wrap" role="group" aria-label={label}>
        {options.map((o) => <Chip key={o} className="chip-pill chip-toggle" selected={value === o} onClick={() => onPick(o)}>{t(o)}</Chip>)}
      </div>
      {tried && error && <div role="alert" className="error">{error}</div>}
    </div>
  );

  return (
    <div className="screen">
      <Header title={t("Visit record")} onBack={() => back()} />
      <div className="scroll">
        <div className="stack-xs">
          <h1 style={{ fontSize: 24 }}>{t(service.name)}</h1>
          <span className="muted">{job.patient.full} · {t("The patient and their family see this record.")}</span>
        </div>

        {id === "inj" && (
          <>
            {chips(INJECTION_SITES, site, setSite, t("Where you gave it"), errors.site)}
            {chips(SIDE_EFFECTS, reaction, setReaction, t("Any reaction in the 15 minutes after?"), errors.reaction)}
          </>
        )}
        {id === "iv" && (
          <>
            {chips(["250 ml", "500 ml", "1000 ml"], volume, setVolume, t("Amount given"), errors.volume)}
            <CheckRow id="cg-cannula" checked={cannulaOut} onChange={setCannulaOut}>{t("Cannula removed and the site dressed.")}</CheckRow>
            {tried && errors.cannula && <div role="alert" className="error">{errors.cannula}</div>}
          </>
        )}
        {(id === "dress" || id === "elder") && (
          <>
            {chips(WOUND_STATES, wound, setWound, t("How the wound looks"), errors.wound)}
            {chips(NEXT_DRESSING, nextDressing, setNextDressing, t("Next dressing"), errors.next)}
            <div className="stack" style={{ gap: 6 }}>
              <span className="label">{t("Photo of the wound (optional)")}</span>
              <PhotoPicker value={woundPhoto} onChange={setWoundPhoto} testId="cg-wound" allowPdf={false} tone="primary" label={t("Wound photo")}
                tip={t("Only with the patient's permission. It is saved to their record so their doctor can see how it heals.")} />
            </div>
          </>
        )}
        {id === "med" && (
          <>
            <CheckRow id="cg-doses" checked={dosesOnTime} onChange={setDosesOnTime}>{t("All doses given at the prescribed time.")}</CheckRow>
            {chips(SIDE_EFFECTS, reaction, setReaction, t("Side effects"), errors.reaction)}
          </>
        )}
        {fields.length > 0 && (
          <div className="stack">
            <h2>{t("Readings")}</h2>
            {checks.map((c) => (
              <div key={c.id} className="card stack-sm">
                <span className="strong">{t(c.name)}</span>
                <div className={(READING_FIELDS[c.id] ?? []).length > 1 ? "grid grid-2 grid-bottom" : "stack-sm"}>
                  {(READING_FIELDS[c.id] ?? []).map((f, _i, all) => (
                    <div key={f.id} className="stack-xs">
                      {/* One field: the card title already names it, so the label only gives the unit. */}
                      <label htmlFor={`rd-${f.id}`} className="small">{all.length > 1 ? t(f.label) : t("Reading")} ({f.unit})</label>
                      <input id={`rd-${f.id}`} className={`text-input ${tried && fieldError(f) ? "invalid" : ""}`} type="number" inputMode="decimal" step={f.step ?? "1"}
                        value={values[f.id] ?? ""} onChange={(e) => setValues({ ...values, [f.id]: e.target.value })} />
                      {tried && fieldError(f) && <div role="alert" className="error small">{fieldError(f)}</div>}
                    </div>
                  ))}
                </div>
                {readingFlag(c.id, values) && <div className="warn-box small" role="status">{t(readingFlag(c.id, values) as string)}</div>}
              </div>
            ))}
          </div>
        )}

        <div className="stack" style={{ gap: 6 }}>
          <label htmlFor="cg-note">{t("What you did")}</label>
          <textarea id="cg-note" className="text-input" value={note} placeholder={t(service.note)} onChange={(e) => setNote(e.target.value)} />
          {tried && errors.note && <div role="alert" className="error">{errors.note}</div>}
          <button type="button" className="link-btn small" onClick={() => setNote(t(service.note))}>{t("Prototype: use the sample note")}</button>
        </div>

        {warnings.length > 0 && (
          <div className="danger-box stack-sm" role="alert">
            <div className="strong">{t("Tell the family before you leave")}</div>
            {warnings.map((w) => <div key={w} className="small">{t(w)}</div>)}
            <div className="small">{t("If it is an emergency, help them call 112.")}</div>
          </div>
        )}

        {job.pay === "cash" && (
          <>
            <CheckRow id="cg-cash" checked={cashTaken} onChange={setCashTaken}>{t("I collected {amount} in cash or UPI.", { amount: money(price.total) })}</CheckRow>
            {tried && errors.cash && <div role="alert" className="error">{errors.cash}</div>}
          </>
        )}
        {tried && Object.values(errors).some(Boolean) && <div role="alert" className="error">{t("Some details are missing. Check the messages above.")}</div>}
      </div>
      <BottomBar>
        {action.failed && <ActionError />}
        <button type="button" className="btn btn-primary" disabled={action.busy} onClick={save}>{action.busy ? t("Saving…") : t("Save and finish the visit")}</button>
      </BottomBar>
    </div>
  );
}

/* ---------- After a visit ---------- */

export function VisitDoneScreen() {
  const { state, go } = useCg();
  const r = state.lastRecord;
  if (!r) return null;
  const completed = r.kind === "completed";
  return (
    <div className="screen">
      <div className="scroll" style={{ paddingTop: 36 }}>
        <div className={completed ? "done-check" : "state-icon"}><Icon name={completed ? "check" : "clock"} size={26} strokeWidth={3} /></div>
        <h1>{completed ? t("Visit completed") : r.kind === "missed" ? t("Visit marked as missed") : t("Visit stopped")}</h1>
        <p className="muted">{tx(r.title)} · {r.patient}</p>
        <div className="card between">
          <span className="strong">{t("You earned")}</span>
          <span className="earn">{money(r.earned)}</span>
        </div>
        {!completed && (
          <p className="small muted">
            {r.kind === "missed" ? t("Nobody answered the door, so the home visit charge is paid to you.") : t("You stopped for the patient's safety, so the home visit charge is paid to you. Our support team will follow up.")}
          </p>
        )}
        {completed && r.cash > 0 && (
          <div className="tint-box small">{t("You collected {cash} in cash. Your earning is {earned}, so {due} is taken from your next payout.", { cash: money(r.cash), earned: money(r.earned), due: money(r.cash - r.earned) })}</div>
        )}
        {completed && (
          <div className="card stack-sm">
            <span className="tiny muted strong">{t("Saved to the patient's record")}</span>
            {r.details.map((d) => <div key={tx(d.label)} className="between small"><span className="muted">{tx(d.label)}</span><span className="strong">{tx(d.value)}</span></div>)}
            {r.readings.map((d) => <div key={tx(d.label)} className="between small"><span className="muted">{tx(d.label)}</span><span className="strong">{d.value}</span></div>)}
            <p className="small">{r.note}</p>
            {r.warnings.map((w) => <div key={tx(w)} className="warn-box small">{tx(w)}</div>)}
          </div>
        )}
        {r.nextVisit && (
          <div className="tint-box stack-xs">
            <div className="strong">{t("Next visit with this patient")}</div>
            <div className="small">{tx(r.nextVisit)}</div>
          </div>
        )}
      </div>
      <BottomBar><button type="button" className="btn btn-primary" onClick={() => go("jobs")}>{t("Back to jobs")}</button></BottomBar>
    </div>
  );
}

/* ---------- Caregiver cannot do the visit ---------- */

export function CancelVisitScreen() {
  const { state, update, back, jobById } = useCg();
  const action = useAction(false);
  const [reason, setReason] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const job = jobById(state.openJobId);
  if (!job) return null;
  const tooLate = state.active?.jobId === job.id && state.active.step >= 3;

  const confirm = () => {
    setTried(true);
    if (!reason) return;
    // TODO: cancel through the API: the patient is refunded in full and the request goes to other caregivers.
    action.run(() =>
      update((prev) => ({
        upcoming: prev.upcoming.filter((j) => j.id !== job.id),
        active: prev.active?.jobId === job.id ? null : prev.active,
        declined: [...prev.declined, job.id],
        screen: "jobs",
        trail: [],
      })),
    );
  };

  if (tooLate) {
    return (
      <div className="screen">
        <Header title={t("Cancel visit")} onBack={() => back()} />
        <div className="scroll">
          <h1>{t("Care has already started")}</h1>
          <p className="muted">{t("Finish the visit, or use “Something does not match” if it is not safe to continue. In an emergency, call 112.")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <Header title={t("Cancel visit")} onBack={() => back()} />
      <div className="scroll">
        <h1>{t("Cannot do this visit?")}</h1>
        <p className="muted">{t("{service} for {name}, {when}.", { service: t(serviceOf(job).name), name: job.patient.first, when: whenText(job) })}</p>
        <div className="stack">
          <h2>{t("What happened?")}</h2>
          {CAREGIVER_CANCEL_REASONS.map((r) => <RadioCard key={r} selected={reason === r} onClick={() => setReason(r)} label={t(r)} />)}
          {tried && !reason && <div role="alert" className="error">{t("Choose a reason to continue.")}</div>}
        </div>
        <div className="tint-box small">{t("We tell {name} straight away, refund them in full and look for another caregiver.", { name: job.patient.first })}</div>
        <div className="warn-box small">
          {isUrgent(job) || job.dateOffset === 0
            ? t("This visit is today. Cancelling late lets the patient down. Our team looks at frequent late cancellations.")
            : t("Cancelling early gives the patient time to find someone else.")}
        </div>
        {job.visits > 1 && <p className="small muted">{t("This cancels your remaining visits with this patient.")}</p>}
      </div>
      <BottomBar>
        {action.failed && <ActionError />}
        <div className="stack-sm">
          <button type="button" className="btn btn-danger" disabled={action.busy} onClick={confirm}>{action.busy ? t("Cancelling…") : t("Cancel the visit")}</button>
          <button type="button" className="btn btn-plain" onClick={() => back()}>{t("Keep the visit")}</button>
        </div>
      </BottomBar>
    </div>
  );
}
