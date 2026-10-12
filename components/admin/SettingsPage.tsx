"use client";

// ADMIN: services (prices, on/off, who can do them, prescription, new services), charges and cancellation rules,
// pay split, time limits, cities and their areas.

import { useState } from "react";
import { useAdmin } from "@/lib/admin/store";
import { BUILT_IN_SERVICES, LOCKED_SERVICE_IDS, VITAL_CHECKS, VITALS_SERVICE_ID, type ServiceSetting } from "@/lib/data";
import { DEFAULT_SETTINGS, money, WEEKDAYS, type Settings } from "@/lib/admin/data";
import type { IconName } from "../Icon";
import { Icon } from "../Icon";
import { Badge, Field, PageHead, Select, Tabs, useToast } from "./ui";

type Tab = "prices" | "rules" | "pay" | "limits" | "cities";

const LIVE = <div className="anote ok adm-small"><b>Live in this demo.</b> The patient and caregiver apps use this list (prices, services switched off, who can do them, new services) when opened in this browser.</div>;
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

const ICONS: { id: IconName; label: string }[] = [
  { id: "syringe", label: "Syringe" }, { id: "drop", label: "Drop" }, { id: "bandage", label: "Bandage" },
  { id: "heart", label: "Heart" }, { id: "pill", label: "Pill" }, { id: "pulse", label: "Pulse" },
];
const DURATIONS = ["15 minutes", "20 minutes", "30 minutes", "40 minutes", "45 minutes", "60 minutes", "60 to 90 minutes"];
const EMPTY_NEW = { name: "", short: "", price: "", mins: "30 minutes", icon: "heart" as IconName, nurseOnly: false, needsPrescription: false, nurseBrings: "", youKeepReady: "", includes: "" };

export function SettingsPage() {
  const { state, update, log } = useAdmin();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("prices");
  const [draft, setDraft] = useState<Settings>(state.settings);
  const [newCity, setNewCity] = useState({ name: "", state: "", language: "" });
  const [cityTried, setCityTried] = useState(false);
  const [newArea, setNewArea] = useState<Record<string, string>>({});
  const [ns, setNs] = useState(EMPTY_NEW);
  const [nsTried, setNsTried] = useState(false);
  const [adding, setAdding] = useState(false);

  const changed = JSON.stringify(draft) !== JSON.stringify(state.settings);
  const priceError = (n: number) => (!Number.isFinite(n) || n < 1 || n > 10000 ? "From ₹1 to ₹10,000." : "");
  const numError = (f: (typeof NUM_FIELDS)[number]) => {
    const n = draft[f.key] as number;
    return !Number.isFinite(n) || n < f.min || n > f.max || Math.round(n) !== n ? `A whole number from ${f.min} to ${f.max}.` : "";
  };
  const noServices = !draft.services.some((s) => s.active);
  const closedWithoutAreas = draft.cities.filter((c) => c.open && c.areas.length === 0);
  const errors = [
    ...draft.services.filter((s) => s.id !== VITALS_SERVICE_ID).map((s) => priceError(s.price)),
    ...VITAL_CHECKS.map((c) => priceError(draft.checks[c.id])),
    ...NUM_FIELDS.map(numError),
    noServices ? "At least one service must be on." : "",
    closedWithoutAreas.length ? "A city needs at least one area before it can open." : "",
  ].filter(Boolean);

  const setService = (id: string, patch: Partial<ServiceSetting>) => setDraft((d) => ({ ...d, services: d.services.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));

  const save = () => {
    if (errors.length) { toast(noServices ? "At least one service must be on" : closedWithoutAreas.length ? "Add an area before opening a city" : "Fix the highlighted numbers first"); return; }
    const before = state.settings;
    const diffs: string[] = [];
    for (const s of draft.services) {
      const old = before.services.find((x) => x.id === s.id);
      if (!old) { diffs.push(`Added service ${s.name} (${money(s.price)})`); continue; }
      if (s.id !== VITALS_SERVICE_ID && old.price !== s.price) diffs.push(`${s.name} ${money(old.price)} → ${money(s.price)}`);
      if (old.active !== s.active) diffs.push(`${s.name} switched ${s.active ? "on" : "off"}`);
      if (old.nurseOnly !== s.nurseOnly) diffs.push(`${s.name}: ${s.nurseOnly ? "nurses only" : "nurses and compounders"}`);
      if (old.needsPrescription !== s.needsPrescription) diffs.push(`${s.name}: prescription ${s.needsPrescription ? "needed" : "not needed"}`);
    }
    for (const s of before.services) if (!draft.services.some((x) => x.id === s.id)) diffs.push(`Removed service ${s.name}`);
    for (const c of VITAL_CHECKS) if (draft.checks[c.id] !== before.checks[c.id]) diffs.push(`${c.name} ${money(before.checks[c.id])} → ${money(draft.checks[c.id])}`);
    for (const f of NUM_FIELDS) if (draft[f.key] !== before[f.key]) diffs.push(`${f.label}: ${before[f.key]} → ${draft[f.key]}`);
    if (draft.payoutDay !== before.payoutDay) diffs.push(`Payout day: ${WEEKDAYS[before.payoutDay]} → ${WEEKDAYS[draft.payoutDay]}`);
    for (const c of draft.cities) {
      const old = before.cities.find((x) => x.id === c.id);
      if (!old) { diffs.push(`Added city ${c.name}`); continue; }
      if (old.open !== c.open) diffs.push(`${c.name} ${c.open ? "opened" : "paused"}`);
      const added = c.areas.filter((a) => !old.areas.includes(a));
      const removed = old.areas.filter((a) => !c.areas.includes(a));
      if (added.length) diffs.push(`${c.name}: added ${added.join(", ")}`);
      if (removed.length) diffs.push(`${c.name}: removed ${removed.join(", ")}`);
    }
    update(() => ({ settings: draft }));
    log(`Changed settings: ${diffs.join("; ") || "no changes"}`, "settings");
    toast("Settings saved");
  };
  const setNum = (key: keyof Settings, v: string) => setDraft((d) => ({ ...d, [key]: v === "" ? NaN : Number(v) }));
  const numValue = (n: number) => (Number.isFinite(n) ? String(n) : "");

  // Pay split example: an injection, booked as urgent.
  const exPrice = draft.services.find((s) => s.id === "inj")?.price ?? 0;
  const exCg = Math.round((exPrice * draft.caregiverShare) / 100) + Math.round((draft.visitFee * draft.visitFeeShare) / 100) + Math.round((draft.urgentFee * draft.urgentShare) / 100);
  const exTotal = exPrice + draft.visitFee + draft.urgentFee;

  /* New service */
  const nsErrors = {
    name: ns.name.trim().length < 3 ? "Enter the service name." : draft.services.some((s) => s.name.toLowerCase() === ns.name.trim().toLowerCase()) ? "A service with this name already exists." : "",
    short: ns.short.trim().length < 10 ? "Describe it in a short sentence." : "",
    price: priceError(Number(ns.price)),
  };
  const addService = () => {
    setNsTried(true);
    if (nsErrors.name || nsErrors.short || nsErrors.price) return;
    const slug = ns.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "service";
    const id = `x-${slug}`;
    const row: ServiceSetting = {
      id, name: ns.name.trim(), short: ns.short.trim(), price: Math.round(Number(ns.price)), mins: ns.mins, nurseOnly: ns.nurseOnly, needsPrescription: ns.needsPrescription,
      active: true, custom: true, icon: ns.icon, nurseBrings: ns.nurseBrings.trim(), youKeepReady: ns.youKeepReady.trim(),
      includes: ns.includes.split("\n").map((x) => x.trim()).filter(Boolean),
    };
    setDraft((d) => ({ ...d, services: [...d.services, row] }));
    setNs(EMPTY_NEW);
    setNsTried(false);
    setAdding(false);
    toast(`${row.name} added. Save changes to publish it.`);
  };

  /* Cities and areas */
  const addCity = () => {
    setCityTried(true);
    const name = newCity.name.trim();
    if (name.length < 3 || newCity.state.trim().length < 3 || newCity.language.trim().length < 3) return;
    const id = name.toLowerCase().replace(/[^a-z]+/g, "").slice(0, 8) || `city${draft.cities.length}`;
    if (draft.cities.some((c) => c.id === id || c.name.toLowerCase() === name.toLowerCase())) { toast(`${name} is already in the list`); return; }
    setDraft((d) => ({ ...d, cities: [...d.cities, { id, name, state: newCity.state.trim(), language: newCity.language.trim(), open: false, areas: [] }] }));
    setNewCity({ name: "", state: "", language: "" });
    setCityTried(false);
  };
  const addArea = (cityId: string) => {
    const name = (newArea[cityId] ?? "").trim();
    if (name.length < 2) { toast("Type the area name first"); return; }
    const city = draft.cities.find((c) => c.id === cityId);
    if (city?.areas.some((a) => a.toLowerCase() === name.toLowerCase())) { toast(`${name} is already in ${city.name}`); return; }
    setDraft((d) => ({ ...d, cities: d.cities.map((c) => (c.id === cityId ? { ...c, areas: [...c.areas, name] } : c)) }));
    setNewArea((cur) => ({ ...cur, [cityId]: "" }));
  };
  const removeArea = (cityId: string, area: string) =>
    setDraft((d) => ({ ...d, cities: d.cities.map((c) => (c.id === cityId ? { ...c, areas: c.areas.filter((a) => a !== area) } : c)) }));

  const numField = (f: (typeof NUM_FIELDS)[number]) => (
    <Field key={f.key} id={`st-${f.key}`} label={`${f.label} (${f.unit})`} type="number" min={f.min} max={f.max} value={numValue(draft[f.key] as number)} onChange={(v) => setNum(f.key, v)} hint={f.hint} error={numError(f)} />
  );

  return (
    <>
      <PageHead title="Settings" sub="Services and prices, charges, the cancellation rule, the pay split, time limits, cities and areas. Every change is written to the activity log."
        actions={<>
          <button type="button" className="abtn" disabled={!changed} onClick={() => setDraft(state.settings)}>Discard changes</button>
          <button type="button" className="abtn abtn-primary" disabled={!changed} onClick={save}>Save changes</button>
        </>} />
      {changed && <div className="anote" role="status">You have unsaved changes.</div>}
      <Tabs label="Settings sections" value={tab} onChange={setTab} tabs={[
        { id: "prices", label: "Services and prices" }, { id: "rules", label: "Charges and cancellation" }, { id: "pay", label: "Pay split" }, { id: "limits", label: "Time limits" }, { id: "cities", label: "Cities and areas" },
      ]} />

      {tab === "prices" && (
        <section className="acard">
          {LIVE}
          {noServices && <div className="anote danger" role="alert">At least one service must be on.</div>}
          <div className="atable-wrap">
            <table className="atable">
              <thead><tr><th>Service</th><th>Who can do it</th><th>Prescription</th><th>Price per visit (₹)</th><th>Offered</th><th /></tr></thead>
              <tbody>
                {draft.services.map((s) => {
                  const locked = LOCKED_SERVICE_IDS.includes(s.id);
                  const builtIn = BUILT_IN_SERVICES.find((b) => b.id === s.id);
                  return (
                    <tr key={s.id} style={s.active ? undefined : { opacity: 0.75 }}>
                      <td>
                        <span className="adm-row" style={{ gap: 8, flexWrap: "nowrap" }}><Icon name={s.icon} size={18} /><span className="adm-strong">{s.name}</span></span>
                        <span className="sub">{s.mins}{s.custom ? " · added here" : builtIn ? ` · built-in price ${money(builtIn.price)}` : ""}</span>
                        {s.custom && <span className="sub"><Badge tone="info">New service</Badge></span>}
                      </td>
                      <td>
                        {locked ? <span className="adm-small">Registered nurses<span className="sub">Fixed by the rules</span></span> : (
                          <label className="afield" htmlFor={`svc-who-${s.id}`}>
                            <span className="ainput-label">Who can do {s.name}</span>
                            <select id={`svc-who-${s.id}`} value={s.nurseOnly ? "nurse" : "all"} onChange={(e) => setService(s.id, { nurseOnly: e.target.value === "nurse" })}>
                              <option value="all">Nurses and compounders</option>
                              <option value="nurse">Registered nurses only</option>
                            </select>
                          </label>
                        )}
                      </td>
                      <td>
                        {locked ? <Badge tone="warn">Required</Badge> : (
                          <label className="afield afield-inline" htmlFor={`svc-rx-${s.id}`}>
                            <input id={`svc-rx-${s.id}`} type="checkbox" style={{ width: 18, minHeight: 18 }} checked={s.needsPrescription} onChange={(e) => setService(s.id, { needsPrescription: e.target.checked })} />
                            <span>{s.needsPrescription ? "Required" : "Not needed"}</span>
                          </label>
                        )}
                      </td>
                      <td>
                        {s.id === VITALS_SERVICE_ID ? <span className="adm-small adm-muted">Total of the checks chosen (below)</span> : (
                          <Field className="ainput-num" id={`price-${s.id}`} label={`${s.name} price`} type="number" min={1} value={numValue(s.price)} onChange={(v) => setService(s.id, { price: v === "" ? NaN : Number(v) })} error={priceError(s.price)} />
                        )}
                      </td>
                      <td>
                        <label className="afield afield-inline" htmlFor={`svc-on-${s.id}`}>
                          <input id={`svc-on-${s.id}`} type="checkbox" style={{ width: 18, minHeight: 18 }} checked={s.active} onChange={(e) => setService(s.id, { active: e.target.checked })} />
                          <span>{s.active ? "On" : "Off"}</span>
                        </label>
                      </td>
                      <td>{s.custom && <button type="button" className="abtn abtn-sm" onClick={() => setDraft((d) => ({ ...d, services: d.services.filter((x) => x.id !== s.id) }))}>Remove</button>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="adm-small adm-muted">Injections, IV drips and medication always need a registered nurse and a prescription. A service switched off disappears from the patient app and is no longer offered to caregivers; bookings already made keep it.</p>
          <div className="adm-row">
            <button type="button" className="abtn" onClick={() => setAdding((v) => !v)}>{adding ? "Close the new service form" : "Add a service…"}</button>
            <button type="button" className="abtn abtn-sm" onClick={() => setDraft((d) => ({ ...d, services: DEFAULT_SETTINGS.services.map((x) => ({ ...x })), checks: { ...DEFAULT_SETTINGS.checks } }))}>Put back the built-in services and prices</button>
          </div>

          {adding && (
            <section className="acard" style={{ borderColor: "var(--a-primary)" }}>
              <h3>New service</h3>
              <div className="agrid agrid-2">
                <Field id="ns-name" label="Name" value={ns.name} onChange={(v) => setNs((x) => ({ ...x, name: v }))} placeholder="For example: Catheter care" error={nsTried ? nsErrors.name : ""} />
                <Field id="ns-price" label="Price per visit (₹)" type="number" min={1} value={ns.price} onChange={(v) => setNs((x) => ({ ...x, price: v }))} error={nsTried ? nsErrors.price : ""} />
              </div>
              <Field id="ns-short" label="Short description (shown to patients)" value={ns.short} onChange={(v) => setNs((x) => ({ ...x, short: v }))} placeholder="One sentence about what is done." error={nsTried ? nsErrors.short : ""} />
              <div className="agrid agrid-2">
                <Select id="ns-mins" label="Usual length" value={ns.mins} onChange={(v) => setNs((x) => ({ ...x, mins: v }))} options={DURATIONS.map((d) => ({ value: d, label: d }))} />
                <div className="afield"><span>Icon</span>
                  <div className="adm-row" role="radiogroup" aria-label="Icon">
                    {ICONS.map((ic) => (
                      <label key={ic.id} className="achoice" style={{ padding: "6px 10px", alignItems: "center" }} title={ic.label}>
                        <input type="radio" name="ns-icon" checked={ns.icon === ic.id} onChange={() => setNs((x) => ({ ...x, icon: ic.id }))} aria-label={ic.label} />
                        <Icon name={ic.id} size={18} />
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div className="adm-row">
                <label className="achoice"><input id="ns-nurse" type="checkbox" checked={ns.nurseOnly} onChange={(e) => setNs((x) => ({ ...x, nurseOnly: e.target.checked }))} /><span>Registered nurses only</span></label>
                <label className="achoice"><input id="ns-rx" type="checkbox" checked={ns.needsPrescription} onChange={(e) => setNs((x) => ({ ...x, needsPrescription: e.target.checked }))} /><span>Needs a prescription</span></label>
              </div>
              <div className="agrid agrid-2">
                <Field id="ns-brings" label="What the caregiver brings (optional)" value={ns.nurseBrings} onChange={(v) => setNs((x) => ({ ...x, nurseBrings: v }))} />
                <Field id="ns-ready" label="What the family keeps ready (optional)" value={ns.youKeepReady} onChange={(v) => setNs((x) => ({ ...x, youKeepReady: v }))} />
              </div>
              <Field id="ns-includes" label="What is included (optional, one per line)" multiline value={ns.includes} onChange={(v) => setNs((x) => ({ ...x, includes: v }))} />
              <div className="anote info adm-small">A new service shows in English in the Telugu and Kannada apps until its translations are added (<code>lib/i18n/</code>). Caregivers who offer it pick it in their work settings.</div>
              <div className="adm-row"><button type="button" className="abtn abtn-primary" onClick={addService}>Add to the list</button></div>
            </section>
          )}

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
        </section>
      )}

      {tab === "rules" && (
        <section className="acard">
          {LATER}
          <div className="agrid agrid-2">{NUM_FIELDS.filter((f) => f.tab === "rules").map(numField)}</div>
          <div className="anote info adm-small">In words: free to cancel within {numValue(draft.graceMinutes)} minutes of booking, and any time up to {numValue(draft.freeUntilHours)} hours before the visit. After that, or once the caregiver has set off, the {money(draft.visitFee || 0)} home visit charge is kept and paid to the caregiver. If the caregiver is more than {numValue(draft.lateMinutes)} minutes late, cancelling is free.</div>
        </section>
      )}

      {tab === "pay" && (
        <section className="acard">
          {LATER}
          <div className="agrid agrid-3">{NUM_FIELDS.filter((f) => f.tab === "pay").map(numField)}</div>
          <Select id="st-payday" label="Weekly payout day" value={String(draft.payoutDay)} onChange={(v) => setDraft((d) => ({ ...d, payoutDay: Number(v) }))} options={WEEKDAYS.map((w, i) => ({ value: String(i), label: w }))} />
          <div className="anote info">
            Example, an urgent injection: the patient pays {money(exTotal)} ({money(exPrice)} + {money(draft.visitFee || 0)} visit + {money(draft.urgentFee || 0)} urgent).
            The caregiver gets <b>{money(exCg)}</b> and we keep <b>{money(exTotal - exCg)}</b>.
          </div>
          <p className="adm-small adm-muted">The Bookings, Payouts and Reports pages here already use this split.</p>
        </section>
      )}

      {tab === "limits" && (
        <section className="acard">
          {LATER}
          <div className="agrid agrid-3">{NUM_FIELDS.filter((f) => f.tab === "limits").map(numField)}</div>
        </section>
      )}

      {tab === "cities" && (
        <section className="acard">
          {LATER}
          {closedWithoutAreas.length > 0 && <div className="anote danger" role="alert">{closedWithoutAreas.map((c) => c.name).join(", ")}: a city needs at least one area before it can open.</div>}
          <div className="adm-col-lg">
            {draft.cities.map((c) => (
              <div key={c.id} className="acard" style={{ gap: 10 }} data-city={c.id}>
                <div className="acard-head">
                  <div><h3>{c.name}</h3><span className="adm-small adm-muted">{c.state} · nursing council of {c.state} · main language {c.language}</span></div>
                  <label className="afield afield-inline" htmlFor={`city-${c.id}`}>
                    <input id={`city-${c.id}`} type="checkbox" checked={c.open} style={{ width: 18, minHeight: 18 }} onChange={(e) => setDraft((d) => ({ ...d, cities: d.cities.map((x) => (x.id === c.id ? { ...x, open: e.target.checked } : x)) }))} />
                    <span>{c.open ? "Open: taking bookings" : "Paused"}</span>
                  </label>
                </div>
                <div className="adm-row" style={{ gap: 6 }} aria-label={`Areas in ${c.name}`} role="list">
                  {c.areas.length === 0 && <span className="adm-small adm-muted">No areas yet.</span>}
                  {c.areas.map((a) => (
                    <span key={a} role="listitem" className="abadge" style={{ padding: "4px 6px 4px 10px", gap: 4 }}>
                      {a}
                      <button type="button" className="abtn-x" aria-label={`Remove ${a}`} onClick={() => removeArea(c.id, a)}>×</button>
                    </span>
                  ))}
                </div>
                <div className="adm-row">
                  <label className="afield" htmlFor={`area-new-${c.id}`} style={{ flex: 1, minWidth: 180 }}>
                    <span className="ainput-label">New area in {c.name}</span>
                    <input id={`area-new-${c.id}`} value={newArea[c.id] ?? ""} placeholder={`New area in ${c.name}`} onChange={(e) => setNewArea((cur) => ({ ...cur, [c.id]: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addArea(c.id); } }} />
                  </label>
                  <button type="button" className="abtn" onClick={() => addArea(c.id)}>Add area</button>
                </div>
              </div>
            ))}
          </div>
          <h3>Add a city</h3>
          <div className="agrid agrid-3">
            <Field id="nc-name" label="City" value={newCity.name} onChange={(v) => setNewCity((c) => ({ ...c, name: v }))} error={cityTried && newCity.name.trim().length < 3 ? "Enter the city." : ""} />
            <Field id="nc-state" label="State" value={newCity.state} onChange={(v) => setNewCity((c) => ({ ...c, state: v }))} error={cityTried && newCity.state.trim().length < 3 ? "Enter the state." : ""} />
            <Field id="nc-lang" label="Main language" value={newCity.language} onChange={(v) => setNewCity((c) => ({ ...c, language: v }))} error={cityTried && newCity.language.trim().length < 3 ? "Enter the language." : ""} />
          </div>
          <div className="adm-row"><button type="button" className="abtn" onClick={addCity}>Add city (paused)</button><span className="adm-small adm-muted">New cities start paused, with no areas. Add its areas, verify caregivers there and check the state nursing council’s register before opening it.</span></div>
        </section>
      )}
    </>
  );
}
