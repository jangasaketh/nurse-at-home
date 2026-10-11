"use client";

// ADMIN: services and prices, charges and cancellation rules, pay split, time limits, cities.

import { useState } from "react";
import { useAdmin } from "@/lib/admin/store";
import { SERVICES, VITAL_CHECKS, VITALS_SERVICE_ID } from "@/lib/data";
import { DEFAULT_SETTINGS, money, WEEKDAYS, type Settings } from "@/lib/admin/data";
import { Badge, Field, PageHead, Select, Tabs, useToast } from "./ui";

type Tab = "prices" | "rules" | "pay" | "limits" | "cities";

const LIVE = <div className="anote ok adm-small"><b>Live in this demo.</b> The patient and caregiver apps use these prices when opened in this browser.</div>;
const LATER = <div className="anote info adm-small"><b>Saved here.</b> The apps use these once the server is connected; until then they keep the built-in numbers.</div>;

const NUM_FIELDS: { key: keyof Settings; label: string; unit: string; min: number; max: number; tab: Tab; hint: string }[] = [
  { key: "visitFee", label: "Home visit charge", unit: "₹", min: 0, max: 1000, tab: "rules", hint: "Added to every visit. Kept when the patient cancels late or nobody is home." },
  { key: "urgentFee", label: "Urgent charge", unit: "₹", min: 0, max: 2000, tab: "rules", hint: "Extra for “as soon as possible” (within 60 minutes)." },
  { key: "graceMinutes", label: "Free to cancel after booking", unit: "minutes", min: 0, max: 120, tab: "rules", hint: "Whatever the visit time." },
  { key: "freeUntilHours", label: "Free to cancel or move until", unit: "hours before", min: 0, max: 48, tab: "rules", hint: "After this, the home visit charge is kept and paid to the caregiver." },
  { key: "lateMinutes", label: "Caregiver late: free cancel after", unit: "minutes late", min: 5, max: 120, tab: "rules", hint: "If the caregiver is later than this, the patient can cancel free." },
  { key: "noShowMinutes", label: "Wait at the door before “missed”", unit: "minutes", min: 5, max: 60, tab: "rules", hint: "The caregiver keeps calling during this time." },
  { key: "caregiverShare", label: "Caregiver gets, of the service price", unit: "%", min: 0, max: 100, tab: "pay", hint: "We keep the rest." },
  { key: "visitFeeShare", label: "Caregiver gets, of the home visit charge", unit: "%", min: 0, max: 100, tab: "pay", hint: "Also what they get for a missed visit or a late cancellation." },
  { key: "urgentShare", label: "Caregiver gets, of the urgent charge", unit: "%", min: 0, max: 100, tab: "pay", hint: "" },
  { key: "offerMinutes", label: "Time to answer a request", unit: "minutes", min: 1, max: 60, tab: "limits", hint: "Then it goes to the next caregiver." },
  { key: "offerMinutesUrgent", label: "Time to answer an urgent request", unit: "minutes", min: 1, max: 15, tab: "limits", hint: "Short, so the patient is not kept waiting." },
  { key: "renewalWarnDays", label: "Start renewal reminders", unit: "days before", min: 7, max: 180, tab: "limits", hint: "Nurses see a banner and a notification from this many days before their registration lapses." },
];

export function SettingsPage() {
  const { state, update, log } = useAdmin();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("prices");
  const [draft, setDraft] = useState<Settings>(state.settings);
  const [newCity, setNewCity] = useState({ name: "", state: "", language: "" });
  const [cityTried, setCityTried] = useState(false);

  const changed = JSON.stringify(draft) !== JSON.stringify(state.settings);
  const priceError = (n: number) => (!Number.isFinite(n) || n < 1 || n > 10000 ? "From ₹1 to ₹10,000." : "");
  const numError = (f: (typeof NUM_FIELDS)[number]) => {
    const n = draft[f.key] as number;
    return !Number.isFinite(n) || n < f.min || n > f.max || Math.round(n) !== n ? `A whole number from ${f.min} to ${f.max}.` : "";
  };
  const errors = [
    ...SERVICES.filter((s) => s.id !== VITALS_SERVICE_ID).map((s) => priceError(draft.prices[s.id])),
    ...VITAL_CHECKS.map((c) => priceError(draft.checks[c.id])),
    ...NUM_FIELDS.map(numError),
  ].filter(Boolean);

  const save = () => {
    if (errors.length) { toast("Fix the highlighted numbers first"); return; }
    const before = state.settings;
    const diffs: string[] = [];
    for (const s of SERVICES) if (draft.prices[s.id] !== before.prices[s.id] && s.id !== VITALS_SERVICE_ID) diffs.push(`${s.name} ${money(before.prices[s.id])} → ${money(draft.prices[s.id])}`);
    for (const c of VITAL_CHECKS) if (draft.checks[c.id] !== before.checks[c.id]) diffs.push(`${c.name} ${money(before.checks[c.id])} → ${money(draft.checks[c.id])}`);
    for (const f of NUM_FIELDS) if (draft[f.key] !== before[f.key]) diffs.push(`${f.label}: ${before[f.key]} → ${draft[f.key]}`);
    if (draft.payoutDay !== before.payoutDay) diffs.push(`Payout day: ${WEEKDAYS[before.payoutDay]} → ${WEEKDAYS[draft.payoutDay]}`);
    for (const c of draft.cities) {
      const old = before.cities.find((x) => x.id === c.id);
      if (!old) diffs.push(`Added city ${c.name}`);
      else if (old.open !== c.open) diffs.push(`${c.name} ${c.open ? "opened" : "paused"}`);
    }
    update(() => ({ settings: draft }));
    log(`Changed settings: ${diffs.join("; ") || "no changes"}`, "settings");
    toast("Settings saved");
  };
  const setNum = (key: keyof Settings, v: string) => setDraft((d) => ({ ...d, [key]: v === "" ? NaN : Number(v) }));
  const numValue = (n: number) => (Number.isFinite(n) ? String(n) : "");

  // Pay split example: an injection, booked as urgent.
  const exPrice = draft.prices.inj ?? 0;
  const exCg = Math.round((exPrice * draft.caregiverShare) / 100) + Math.round((draft.visitFee * draft.visitFeeShare) / 100) + Math.round((draft.urgentFee * draft.urgentShare) / 100);
  const exTotal = exPrice + draft.visitFee + draft.urgentFee;

  const addCity = () => {
    setCityTried(true);
    const name = newCity.name.trim();
    if (name.length < 3 || newCity.state.trim().length < 3 || newCity.language.trim().length < 3) return;
    const id = name.toLowerCase().replace(/[^a-z]+/g, "").slice(0, 8) || `city${draft.cities.length}`;
    if (draft.cities.some((c) => c.id === id || c.name.toLowerCase() === name.toLowerCase())) { toast(`${name} is already in the list`); return; }
    setDraft((d) => ({ ...d, cities: [...d.cities, { id, name, state: newCity.state.trim(), language: newCity.language.trim(), open: false }] }));
    setNewCity({ name: "", state: "", language: "" });
    setCityTried(false);
  };

  const numField = (f: (typeof NUM_FIELDS)[number]) => (
    <Field key={f.key} id={`st-${f.key}`} label={`${f.label} (${f.unit})`} type="number" min={f.min} max={f.max} value={numValue(draft[f.key] as number)} onChange={(v) => setNum(f.key, v)} hint={f.hint} error={numError(f)} />
  );

  return (
    <>
      <PageHead title="Settings" sub="Services and prices, charges, the cancellation rule, the pay split, time limits and cities. Every change is written to the activity log."
        actions={<>
          <button type="button" className="abtn" disabled={!changed} onClick={() => setDraft(state.settings)}>Discard changes</button>
          <button type="button" className="abtn abtn-primary" disabled={!changed} onClick={save}>Save changes</button>
        </>} />
      {changed && <div className="anote" role="status">You have unsaved changes.</div>}
      <Tabs label="Settings sections" value={tab} onChange={setTab} tabs={[
        { id: "prices", label: "Services and prices" }, { id: "rules", label: "Charges and cancellation" }, { id: "pay", label: "Pay split" }, { id: "limits", label: "Time limits" }, { id: "cities", label: "Cities" },
      ]} />

      {tab === "prices" && (
        <section className="acard">
          <div>{LIVE}</div>
          <div className="atable-wrap">
            <table className="atable">
              <thead><tr><th>Service</th><th>Who can do it</th><th>Prescription</th><th>Price per visit (₹)</th><th className="num">Built-in</th></tr></thead>
              <tbody>
                {SERVICES.filter((s) => s.id !== VITALS_SERVICE_ID).map((s) => (
                  <tr key={s.id}>
                    <td className="adm-strong">{s.name}<span className="sub">{s.mins}</span></td>
                    <td>{s.nurseOnly ? "Registered nurses" : "Nurses and compounders"}</td>
                    <td>{s.needsPrescription ? <Badge tone="warn">Required</Badge> : "Not needed"}</td>
                    <td><Field className="ainput-num" id={`price-${s.id}`} label={`${s.name} price`} type="number" min={1} value={numValue(draft.prices[s.id])} onChange={(v) => setDraft((d) => ({ ...d, prices: { ...d.prices, [s.id]: v === "" ? NaN : Number(v) } }))} error={priceError(draft.prices[s.id])} /></td>
                    <td className="num adm-muted">{money(DEFAULT_SETTINGS.prices[s.id])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>Vitals checks</h3>
          <p className="adm-small adm-muted">A vitals visit costs the total of the checks the patient chooses. The cheapest check is shown as the “from” price.</p>
          <div className="atable-wrap">
            <table className="atable">
              <thead><tr><th>Check</th><th>Price (₹)</th><th className="num">Built-in</th></tr></thead>
              <tbody>
                {VITAL_CHECKS.map((c) => (
                  <tr key={c.id}>
                    <td className="adm-strong">{c.name}</td>
                    <td><Field className="ainput-num" id={`check-${c.id}`} label={`${c.name} price`} type="number" min={1} value={numValue(draft.checks[c.id])} onChange={(v) => setDraft((d) => ({ ...d, checks: { ...d.checks, [c.id]: v === "" ? NaN : Number(v) } }))} error={priceError(draft.checks[c.id])} /></td>
                    <td className="num adm-muted">{money(DEFAULT_SETTINGS.checks[c.id])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="adm-row"><button type="button" className="abtn abtn-sm" onClick={() => setDraft((d) => ({ ...d, prices: { ...DEFAULT_SETTINGS.prices }, checks: { ...DEFAULT_SETTINGS.checks } }))}>Put back the built-in prices</button></div>
        </section>
      )}

      {tab === "rules" && (
        <section className="acard">
          <div>{LATER}</div>
          <div className="agrid agrid-2">{NUM_FIELDS.filter((f) => f.tab === "rules").map(numField)}</div>
          <div className="anote info adm-small">In words: free to cancel within {numValue(draft.graceMinutes)} minutes of booking, and any time up to {numValue(draft.freeUntilHours)} hours before the visit. After that, or once the caregiver has set off, the {money(draft.visitFee || 0)} home visit charge is kept and paid to the caregiver. If the caregiver is more than {numValue(draft.lateMinutes)} minutes late, cancelling is free.</div>
        </section>
      )}

      {tab === "pay" && (
        <section className="acard">
          <div>{LATER}</div>
          <div className="agrid agrid-3">{NUM_FIELDS.filter((f) => f.tab === "pay").map(numField)}</div>
          <Select id="st-payday" label="Weekly payout day" value={String(draft.payoutDay)} onChange={(v) => setDraft((d) => ({ ...d, payoutDay: Number(v) }))} options={WEEKDAYS.map((w, i) => ({ value: String(i), label: w }))} />
          <div className="anote info">
            Example, an urgent injection: the patient pays {money(exTotal)} ({money(exPrice)} + {money(draft.visitFee || 0)} visit + {money(draft.urgentFee || 0)} urgent).
            The caregiver gets <b>{money(exCg)}</b> and we keep <b>{money(exTotal - exCg)}</b>.
          </div>
          <p className="adm-small adm-muted">The Bookings and Payouts pages here already use this split.</p>
        </section>
      )}

      {tab === "limits" && (
        <section className="acard">
          <div>{LATER}</div>
          <div className="agrid agrid-3">{NUM_FIELDS.filter((f) => f.tab === "limits").map(numField)}</div>
        </section>
      )}

      {tab === "cities" && (
        <section className="acard">
          <div>{LATER}</div>
          <div className="atable-wrap">
            <table className="atable">
              <thead><tr><th>City</th><th>State (nursing council)</th><th>Main language</th><th>Taking bookings</th></tr></thead>
              <tbody>
                {draft.cities.map((c) => (
                  <tr key={c.id}>
                    <td className="adm-strong">{c.name}</td>
                    <td>{c.state}</td>
                    <td>{c.language}</td>
                    <td>
                      <label className="afield afield-inline" htmlFor={`city-${c.id}`}>
                        <input id={`city-${c.id}`} type="checkbox" checked={c.open} style={{ width: 18, minHeight: 18 }} onChange={(e) => setDraft((d) => ({ ...d, cities: d.cities.map((x) => (x.id === c.id ? { ...x, open: e.target.checked } : x)) }))} />
                        <span>{c.open ? "Open" : "Paused"}</span>
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>Add a city</h3>
          <div className="agrid agrid-3">
            <Field id="nc-name" label="City" value={newCity.name} onChange={(v) => setNewCity((c) => ({ ...c, name: v }))} error={cityTried && newCity.name.trim().length < 3 ? "Enter the city." : ""} />
            <Field id="nc-state" label="State" value={newCity.state} onChange={(v) => setNewCity((c) => ({ ...c, state: v }))} error={cityTried && newCity.state.trim().length < 3 ? "Enter the state." : ""} />
            <Field id="nc-lang" label="Main language" value={newCity.language} onChange={(v) => setNewCity((c) => ({ ...c, language: v }))} error={cityTried && newCity.language.trim().length < 3 ? "Enter the language." : ""} />
          </div>
          <div className="adm-row"><button type="button" className="abtn" onClick={addCity}>Add city (paused)</button><span className="adm-small adm-muted">New cities start paused. Before opening one, add its areas, verify caregivers there, and check the state nursing council’s register.</span></div>
        </section>
      )}
    </>
  );
}
