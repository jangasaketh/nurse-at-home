"use client";

// CAREGIVER APP: schedule of accepted visits, work settings, and earnings.

import { useState } from "react";
import { useCg, type Availability } from "@/lib/caregiver/store";
import { CAREGIVER_SHARE, DAYS, HOURS, isUrgent, RADIUS_KM, serviceOf, servicesForRole, slotHour, URGENT_SHARE, type Job } from "@/lib/caregiver/data";
import { maskAccount, nextPayoutText, weekStart, weekTotals } from "@/lib/caregiver/rules";
import { SERVICES, URGENT_FEE, VISIT_FEE } from "@/lib/data";
import { addDays, dayInfo, money, timeAgo, todayISO, tx } from "@/lib/booking";
import { useLoad } from "@/lib/fake-api";
import { t } from "@/lib/i18n";
import { Icon } from "../Icon";
import { BottomBar, CheckRow, Chip, EmptyState, Header, Skeleton } from "../ui";

/* ---------- Schedule ---------- */

export function ScheduleScreen() {
  const { state, open } = useCg();
  const a = state.availability;
  // Group accepted visits by day.
  const groups = new Map<number, Job[]>();
  for (const job of state.upcoming) groups.set(job.dateOffset, [...(groups.get(job.dateOffset) ?? []), job]);
  const days = [...groups.keys()].sort((x, y) => x - y);
  const dayList = a.days.length === 7 ? t("Every day") : a.days.map((d) => t(DAYS[d])).join(", ");

  return (
    <div className="screen">
      <div className="scroll scroll-top">
        <h1>{t("Schedule")}</h1>

        <button type="button" className="card settings-card" onClick={() => open("availability")}>
          <span className="stack-xs" style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
            <span className="tiny muted strong">{t("Work settings")}</span>
            <span className="strong">{dayList}</span>
            <span className="small muted">{a.start} – {a.end} · {t("Up to {km} km", { km: a.radiusKm }).replace(/ km/g, "\u00a0km")}{a.urgent ? ` · ${t("Urgent visits on")}` : ""}</span>
          </span>
          <span className="link-text">{t("Change")}</span>
        </button>

        <div className="stack">
          <h2>{t("Upcoming visits")}</h2>
          {days.length === 0 ? (
            <EmptyState icon="calendar" title={t("No visits booked")} body={t("Accept a request on the Jobs screen and it shows up here.")} />
          ) : (
            days.map((offset) => (
              <div key={offset} className="stack-sm">
                <span className="small strong muted">{dayInfo(addDays(todayISO(), offset)).full}</span>
                <div className="list">
                  {[...(groups.get(offset) ?? [])]
                    .sort((x, y) => (isUrgent(y) ? 1 : 0) - (isUrgent(x) ? 1 : 0) || slotHour(x.slot) - slotHour(y.slot))
                    .map((job) => (
                      <button type="button" key={job.id} className="list-row" onClick={() => open("job", { openJobId: job.id })}>
                        <span className="sched-time">{isUrgent(job) ? t("Urgent") : job.slot}</span>
                        <span className="stack-xs" style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                          <span className="strong">{t(serviceOf(job).name)} · {job.patient.first}</span>
                          <span className="small muted">
                            {job.area}{job.visits > 1 ? ` · ${t("Visit {n} of {total}", { n: job.visitNo, total: job.visits })}` : ""}
                            {state.active?.jobId === job.id ? ` · ${t("In progress")}` : ""}
                          </span>
                        </span>
                        <span className="end"><Icon name="next" size={18} /></span>
                      </button>
                    ))}
                </div>
              </div>
            ))
          )}
        </div>

        {state.records.length > 0 && (
          <div className="stack">
            <h2>{t("Recent visits")}</h2>
            <div className="list">
              {state.records.slice(0, 10).map((r) => (
                <div key={`${r.jobId}-${r.at}`} className="list-row">
                  <span className="stack-xs" style={{ flex: 1, minWidth: 0 }}>
                    <span className="strong">{tx(r.title)} · {r.patient}</span>
                    <span className="small muted">{timeAgo(r.at)}</span>
                  </span>
                  <span className={`pill ${r.kind === "completed" ? "pill-ok" : "pill-off"}`}>
                    {r.kind === "completed" ? t("Completed") : r.kind === "missed" ? t("Missed") : t("Stopped")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Work settings ---------- */

export function AvailabilityScreen() {
  const { state, back } = useCg();
  const role = state.role ?? "nurse";
  const allowed = servicesForRole(role).map((s) => s.id);
  const [a, setA] = useState<Availability>({ ...state.availability, services: state.availability.services.filter((id) => allowed.includes(id)) });
  const [tried, setTried] = useState(false);
  const errors = {
    days: a.days.length === 0 ? t("Choose at least one day.") : "",
    hours: slotHour(a.end) <= slotHour(a.start) ? t("The end time must be after the start time.") : "",
    services: a.services.length === 0 ? t("Choose at least one service.") : "",
  };
  const toggleDay = (d: number) => setA({ ...a, days: a.days.includes(d) ? a.days.filter((x) => x !== d) : [...a.days, d].sort() });
  const toggleService = (id: string) => setA({ ...a, services: a.services.includes(id) ? a.services.filter((x) => x !== id) : [...a.services, id] });
  const save = () => {
    setTried(true);
    if (Object.values(errors).some(Boolean)) return;
    back({ availability: a });
  };

  return (
    <div className="screen">
      <Header title={t("Work settings")} onBack={() => back()} />
      <div className="scroll">
        <p className="muted">{t("You only get requests that fit these settings.")}</p>
        <div className="stack" style={{ gap: 6 }}>
          <span className="label">{t("Days you work")}</span>
          <div className="grid grid-7" role="group" aria-label={t("Days you work")}>
            {DAYS.map((d, i) => <Chip key={d} className="chip-day-sm" selected={a.days.includes(i)} onClick={() => toggleDay(i)}>{t(d)}</Chip>)}
          </div>
          {tried && errors.days && <div role="alert" className="error">{errors.days}</div>}
        </div>
        <div className="grid grid-2">
          <div className="stack-xs">
            <label htmlFor="cg-start">{t("From")}</label>
            <select id="cg-start" className="text-input" value={a.start} onChange={(e) => setA({ ...a, start: e.target.value })}>
              {HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
          <div className="stack-xs">
            <label htmlFor="cg-end">{t("Until")}</label>
            <select id="cg-end" className="text-input" value={a.end} onChange={(e) => setA({ ...a, end: e.target.value })}>
              {HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
        </div>
        {tried && errors.hours && <div role="alert" className="error">{errors.hours}</div>}
        <div className="stack" style={{ gap: 6 }}>
          <span className="label">{t("How far you will travel")}</span>
          <div className="grid grid-4" role="group" aria-label={t("How far you will travel")}>
            {RADIUS_KM.map((km) => <Chip key={km} selected={a.radiusKm === km} onClick={() => setA({ ...a, radiusKm: km })}>{t("{km} km", { km })}</Chip>)}
          </div>
        </div>
        <div className="stack" style={{ gap: 8 }}>
          <span className="label">{t("Services you offer")}</span>
          {SERVICES.map((s) =>
            allowed.includes(s.id) ? (
              <CheckRow key={s.id} id={`svc-${s.id}`} checked={a.services.includes(s.id)} onChange={() => toggleService(s.id)}>{t(s.name)}</CheckRow>
            ) : (
              <div key={s.id} className="check-card disabled-card">
                <span className="stack-xs"><span>{t(s.name)}</span><span className="small muted">{t("Registered nurses only")}</span></span>
              </div>
            ),
          )}
          {tried && errors.services && <div role="alert" className="error">{errors.services}</div>}
        </div>
        <CheckRow id="cg-urgent" checked={a.urgent} onChange={(v) => setA({ ...a, urgent: v })}>
          <span className="stack-xs">
            <span className="strong">{t("Take urgent requests")}</span>
            <span className="small muted">{t("The patient needs someone within 60 minutes. You earn {amount} extra.", { amount: money(Math.round(URGENT_FEE * URGENT_SHARE)) })}</span>
          </span>
        </CheckRow>
      </div>
      <BottomBar><button type="button" className="btn btn-primary" onClick={save}>{t("Save")}</button></BottomBar>
    </div>
  );
}

/* ---------- Earnings ---------- */

const KIND_LABEL: Record<string, string> = {
  visit: "Visit",
  missed: "Missed visit",
  "late-cancel": "Late cancellation",
  stopped: "Stopped for safety",
};

export function EarningsScreen() {
  const { state } = useCg();
  const load = useLoad(false);
  const totals = weekTotals(state.earnings);
  const earlier = state.earnings.filter((e) => e.at < weekStart());
  const owes = totals.payout < 0;

  return (
    <div className="screen">
      <div className="scroll scroll-top">
        <h1>{t("Earnings")}</h1>
        {load.status === "loading" ? (
          <Skeleton rows={2} />
        ) : (
          <>
            <div className="earn-card stack">
              <span className="small" style={{ opacity: 0.9 }}>{owes ? t("You owe this week") : t("Your payout on {day}", { day: nextPayoutText() })}</span>
              <span className="earn-big">{money(Math.abs(totals.payout))}</span>
              <span className="small" style={{ opacity: 0.9 }}>
                {state.bank ? t("To your account {acc}", { acc: maskAccount(state.bank.account) }) : t("Add a bank account in Profile")}
              </span>
            </div>

            <div className="card stack price-lines" style={{ gap: 8 }}>
              <div className="line"><span className="muted">{t("Earned this week ({n} visits)", { n: totals.visits })}</span><span>{money(totals.earned)}</span></div>
              <div className="line"><span className="muted">{t("Cash you already collected")}</span><span>− {money(totals.cash)}</span></div>
              <div className="line total"><span>{owes ? t("Taken from your next payout") : t("To be paid")}</span><span>{money(Math.abs(totals.payout))}</span></div>
            </div>

            <div className="stack">
              <h2>{t("This week")}</h2>
              {totals.week.length === 0 ? (
                <EmptyState icon="wallet" title={t("No earnings yet this week")} body={t("Finished visits show up here with what you earned.")} />
              ) : (
                <EarningList items={totals.week} />
              )}
            </div>
            {earlier.length > 0 && (
              <div className="stack">
                <h2>{t("Earlier")}</h2>
                <EarningList items={earlier} />
              </div>
            )}

            <div className="tint-box stack-sm">
              <div className="strong">{t("How your pay works")}</div>
              <ul className="install-steps small">
                <li>{t("You keep {pct}% of the service price, the full {fee} home visit charge and half of any urgent charge.", { pct: Math.round(CAREGIVER_SHARE * 100), fee: money(VISIT_FEE) })}</li>
                <li>{t("If nobody is home, or the patient cancels late, you get the {fee} home visit charge.", { fee: money(VISIT_FEE) })}</li>
                <li>{t("Payouts go to your bank every Monday. Cash you collected is taken off the amount.")}</li>
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function EarningList({ items }: { items: ReturnType<typeof weekTotals>["week"] }) {
  return (
    <div className="list">
      {items.map((e) => (
        <div key={e.id} className="list-row" style={{ alignItems: "flex-start" }}>
          <span className="stack-xs" style={{ flex: 1, minWidth: 0 }}>
            <span className="strong">{tx(e.title)} · {e.patient}</span>
            <span className="small muted">
              {t(KIND_LABEL[e.kind])} · {timeAgo(e.at)}{e.cash > 0 ? ` · ${t("{amount} cash collected", { amount: money(e.cash) })}` : ""}
              {e.sample ? ` · ${t("Sample")}` : ""}
            </span>
          </span>
          <span className="strong" style={{ fontVariantNumeric: "tabular-nums" }}>+{money(e.amount)}</span>
        </div>
      ))}
    </div>
  );
}

