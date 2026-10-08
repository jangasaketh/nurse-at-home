"use client";

import { useState } from "react";
import { useApp, type Screen } from "@/lib/store";
import { SELF, canReschedule, describeBooking, formatAddress, patientMeta, tx } from "@/lib/booking";
import { useLoad } from "@/lib/fake-api";
import { t } from "@/lib/i18n";
import { LanguagePicker } from "./AuthScreens";
import { Icon, type IconName } from "./Icon";
import { CheckRow, EmptyState, ErrorState, Skeleton } from "./ui";

const TABS: { id: Screen; label: string; icon: IconName }[] = [
  { id: "home", label: "Home", icon: "home" },
  { id: "bookings", label: "Bookings", icon: "calendar" },
  { id: "records", label: "Records", icon: "file" },
  { id: "profile", label: "Profile", icon: "user" },
];

export function TabBar() {
  const { state, go } = useApp();
  return (
    <nav className="tabbar" aria-label={t("Main")}>
      {TABS.map((tab) => (
        <button type="button" key={tab.id} className="tab" aria-current={state.screen === tab.id ? "page" : undefined} onClick={() => go(tab.id)}>
          <Icon name={tab.icon} size={24} />
          <span>{t(tab.label)}</span>
        </button>
      ))}
    </nav>
  );
}

export function BookingsScreen() {
  const { state, set, go, open } = useApp();
  const load = useLoad(state.simulateFailure);
  const booking = state.booking;
  const b = booking ? describeBooking(booking) : null;

  // Switch between "same person every visit" and "any available" for the rest of a course.
  const switchNurse = () => {
    if (!booking || !b) return;
    set({ booking: { ...booking, sameCaregiver: !booking.sameCaregiver, caregiverId: b.caregiver.id, rotateFrom: booking.visitNo } });
  };

  const statusPill = (status: string) =>
    status === "completed"
      ? <span className="pill pill-ok">{t("Completed")}</span>
      : <span className="pill pill-off">{status === "missed" ? t("Missed") : t("Cancelled")}</span>;

  return (
    <div className="screen">
      <div className="scroll scroll-top">
        <h1>{t("Bookings")}</h1>

        {load.status === "loading" && <Skeleton rows={2} />}
        {load.status === "error" && <ErrorState title={t("We could not load your bookings")} onRetry={load.retry} />}

        {load.status === "ready" && (
          <>
            <div className="stack">
              <h2>{t("Upcoming")}</h2>
              {booking && b ? (
                <>
                  <button type="button" className="card card-btn card-active" onClick={() => go("tracking")}>
                    <span className="strong" style={{ fontSize: 17 }}>{t(b.service.name)}</span>
                    <span className="small muted">{b.when} · {b.patient.chip}</span>
                    <span className="small muted">{t("With {name}", { name: b.caregiver.name })}</span>
                    <span className="small muted">{tx(booking.addressText)}</span>
                    <span className="small strong primary-text">{t("Track visit")}</span>
                  </button>
                  {state.step < 3 && (
                    <div className="actions">
                      {canReschedule(booking, state.step) && (
                        <button type="button" className="btn btn-outline" onClick={() => open("reschedule")}>{t("Reschedule")}</button>
                      )}
                      <button type="button" className="btn btn-danger" style={{ minHeight: 48 }} onClick={() => open("cancel")}>{t("Cancel visit")}</button>
                    </div>
                  )}
                  {b.isCourse && (
                    <div className="tint-box stack" style={{ gap: 6 }}>
                      <div className="strong">{b.visitLabel}, {b.planText}</div>
                      <div className="small" style={{ color: "var(--ink-soft)" }}>
                        {booking.sameCaregiver
                          ? t("{name} comes for every visit.", { name: b.caregiver.name })
                          : t("A different {who} may come each time. You see who is coming the evening before.", { who: b.who })}
                      </div>
                      <button type="button" className="link-btn" onClick={switchNurse}>
                        {booking.sameCaregiver
                          ? t("Switch to any available {who}", { who: b.who })
                          : t("Keep {name} for the remaining visits", { name: b.caregiver.first })}
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <EmptyState
                  icon="calendar"
                  title={t("No upcoming visit")}
                  body={t("When you book a nurse, the visit appears here and you can track, move or cancel it.")}
                  action={<button type="button" className="btn btn-outline" onClick={() => go("home")}>{t("Book a visit")}</button>}
                />
              )}
            </div>

            {state.history.length > 0 && (
              <div className="stack">
                <h2>{t("Past")}</h2>
                {state.history.map((v) => (
                  <div key={v.id} className="card stack-sm">
                    <div className="between" style={{ alignItems: "flex-start" }}>
                      <span className="strong" style={{ fontSize: 17 }}>{tx(v.title)}</span>
                      {statusPill(v.status)}
                    </div>
                    <div className="small muted">{tx(v.when)} · {tx(v.who)}</div>
                    <div className="small muted">{t("With {name}", { name: v.by })}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function RecordsScreen() {
  const { state, go } = useApp();
  const load = useLoad(state.simulateFailure);
  const records = state.history.filter((v) => v.status === "completed");

  return (
    <div className="screen">
      <div className="scroll scroll-top">
        <div className="stack" style={{ gap: 6 }}>
          <h1>{t("Health records")}</h1>
          <p className="muted">{t("Notes and readings from every home visit.")}</p>
        </div>

        {load.status === "loading" && <Skeleton rows={2} />}
        {load.status === "error" && <ErrorState title={t("We could not load your records")} onRetry={load.retry} />}
        {load.status === "ready" && records.length === 0 && (
          <EmptyState
            icon="file"
            title={t("No records yet")}
            body={t("After each visit the nurse's notes and readings are saved here, ready to show your doctor.")}
            action={<button type="button" className="btn btn-outline" onClick={() => go("home")}>{t("Book a visit")}</button>}
          />
        )}
        {load.status === "ready" && records.map((r) => (
          <div key={r.id} className="card stack" style={{ gap: 10 }}>
            <div className="stack-xs">
              <span className="tiny muted">{tx(r.when)} · {tx(r.who)}</span>
              <span className="strong" style={{ fontSize: 17 }}>{tx(r.title)}</span>
            </div>
            <p style={{ fontSize: 15 }}>{tx(r.note)}</p>
            {r.readings.length > 0 && (
              <div className="grid grid-2" style={{ gap: 10, fontVariantNumeric: "tabular-nums" }}>
                {r.readings.map((reading) => (
                  <div key={tx(reading.name)} className="vital">
                    <span className="tiny muted">{tx(reading.name)}</span>
                    <span className="strong">{reading.value}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="small muted">{t("Recorded by {name}", { name: r.by })}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProfileScreen() {
  const { state, set, go, open, reset } = useApp();
  const [askReset, setAskReset] = useState(false);
  const me = state.patients.find((p) => p.relation === SELF);
  const unread = state.notifications.filter((n) => !n.read).length;

  return (
    <div className="screen">
      <div className="scroll scroll-top">
        <div className="row-inline" style={{ gap: 14 }}>
          <span className="avatar avatar-solid display" style={{ width: 60, height: 60, fontSize: 22 }}>
            {(me?.name ?? "?").charAt(0).toUpperCase()}
          </span>
          <div className="stack-xs" style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 24 }}>{me?.name ?? t("Your profile")}</h1>
            <div className="muted">+91 {state.phone}</div>
          </div>
        </div>

        <div className="stack">
          <h2>{t("Language")}</h2>
          <LanguagePicker />
        </div>

        <div className="stack">
          <h2>{t("Family members")}</h2>
          <div className="list">
            {state.patients.map((p) => (
              <button type="button" key={p.id} className="list-row" aria-label={t("Edit {name}", { name: p.name })} onClick={() => open("family", { editingId: p.id })}>
                <span className="stack-xs" style={{ minWidth: 0 }}>
                  <span className="strong">{p.name}</span>
                  <span className="small muted">{patientMeta(p)}</span>
                </span>
                <span className="end"><Icon name="edit" size={18} /></span>
              </button>
            ))}
            <button type="button" className="list-row add-row" onClick={() => open("family", { editingId: null })}>
              <Icon name="plus" size={20} />
              {t("Add a family member")}
            </button>
          </div>
        </div>

        <div className="stack">
          <h2>{t("Addresses")}</h2>
          <div className="list">
            {state.addresses.map((a) => (
              <button type="button" key={a.id} className="list-row" aria-label={t("Edit {label} address", { label: t(a.label) })} onClick={() => open("address", { editingId: a.id })}>
                <span className="stack-xs" style={{ minWidth: 0 }}>
                  <span className="strong">{t(a.label)}</span>
                  <span className="small muted">{formatAddress(a)}</span>
                </span>
                <span className="end"><Icon name="edit" size={18} /></span>
              </button>
            ))}
            <button type="button" className="list-row add-row" onClick={() => open("address", { editingId: null })}>
              <Icon name="plus" size={20} />
              {t("Add an address")}
            </button>
          </div>
        </div>

        <div className="stack">
          <h2>{t("Emergency contact")}</h2>
          <div className="list">
            {state.contact ? (
              <button type="button" className="list-row" aria-label={t("Edit emergency contact")} onClick={() => open("contact")}>
                <span className="stack-xs" style={{ minWidth: 0 }}>
                  <span className="strong">{state.contact.name}</span>
                  <span className="small muted">{t(state.contact.relation)} · +91 {state.contact.phone}</span>
                </span>
                <span className="end"><Icon name="edit" size={18} /></span>
              </button>
            ) : (
              <button type="button" className="list-row add-row" onClick={() => open("contact")}>
                <Icon name="plus" size={20} />
                {t("Add an emergency contact")}
              </button>
            )}
          </div>
        </div>

        <div className="list">
          <button type="button" className="list-row" onClick={() => open("notifications")}>
            <span className="row-inline"><Icon name="bell" size={20} />{t("Notifications")}</span>
            <span className="end">{unread > 0 && <span className="pill">{t("{n} new", { n: unread })}</span>}<Icon name="next" size={18} /></span>
          </button>
          <button type="button" className="list-row" onClick={() => open("help")}>
            <span className="row-inline"><Icon name="help" size={20} />{t("Help and support")}</span>
            <span className="end"><Icon name="next" size={18} /></span>
          </button>
          <button type="button" className="list-row" onClick={() => open("legal", { legalDoc: "terms" })}>
            <span className="row-inline"><Icon name="file" size={20} />{t("Terms of Use")}</span>
            <span className="end"><Icon name="next" size={18} /></span>
          </button>
          <button type="button" className="list-row" onClick={() => open("legal", { legalDoc: "privacy" })}>
            <span className="row-inline"><Icon name="shield" size={20} />{t("Privacy Policy")}</span>
            <span className="end"><Icon name="next" size={18} /></span>
          </button>
        </div>

        {/* Remove this whole block before launch. */}
        <div className="dashed-box stack">
          <h2>{t("Prototype tools")}</h2>
          <CheckRow id="simulate-failure" checked={state.simulateFailure} onChange={(v) => set({ simulateFailure: v })}>
            <span className="stack-xs">
              <span className="strong">{t("Pretend the internet is failing")}</span>
              <span className="small muted">{t("Every list fails to load the first time, and booking, cancelling or moving a visit fails once. Trying again works.")}</span>
            </span>
          </CheckRow>
          {askReset ? (
            <div className="danger-box stack">
              <div className="strong">{t("Erase everything saved on this device?")}</div>
              <div className="actions">
                <button type="button" className="btn btn-danger-solid" style={{ minHeight: 48, fontSize: 16 }} onClick={reset}>{t("Yes, erase")}</button>
                <button type="button" className="btn btn-outline" onClick={() => setAskReset(false)}>{t("Keep")}</button>
              </div>
            </div>
          ) : (
            <button type="button" className="link-btn" onClick={() => setAskReset(true)}>{t("Erase all data and start again")}</button>
          )}
        </div>

        <button type="button" className="btn btn-danger" onClick={() => go("login")}>{t("Log out")}</button>
      </div>
    </div>
  );
}
