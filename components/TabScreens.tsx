"use client";

import { useApp, type Screen } from "@/lib/store";
import { PATIENTS, SAMPLE_PAST_VISITS } from "@/lib/data";
import { addressIn, cityById, describeBooking } from "@/lib/booking";
import { Icon, type IconName } from "./Icon";

const TABS: { id: Screen; label: string; icon: IconName }[] = [
  { id: "home", label: "Home", icon: "home" },
  { id: "bookings", label: "Bookings", icon: "calendar" },
  { id: "records", label: "Records", icon: "file" },
  { id: "profile", label: "Profile", icon: "user" },
];

export function TabBar() {
  const { state, go } = useApp();
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map((tab) => (
        <button type="button" key={tab.id} className="tab" aria-current={state.screen === tab.id ? "page" : undefined} onClick={() => go(tab.id)}>
          <Icon name={tab.icon} size={24} />
          <span>{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}

export function BookingsScreen() {
  const { state, set, go } = useApp();
  const booking = state.booking;
  const b = booking ? describeBooking(booking) : null;
  const past = [...state.history, ...SAMPLE_PAST_VISITS];

  // Switch between "same person every visit" and "any available" for the rest of a course.
  const switchNurse = () => {
    if (!booking || !b) return;
    set({ booking: { ...booking, sameCaregiver: !booking.sameCaregiver, caregiverId: b.caregiver.id, rotateFrom: booking.visitNo } });
  };

  return (
    <div className="screen">
      <div className="scroll scroll-top">
        <h1>Bookings</h1>

        <div className="stack">
          <h2>Upcoming</h2>
          {booking && b ? (
            <>
              <button type="button" className="card card-btn card-active" onClick={() => go("tracking")}>
                <span className="strong" style={{ fontSize: 17 }}>{b.service.name}</span>
                <span className="small muted">{b.when} · {b.patient.chip}</span>
                <span className="small muted">With {b.caregiver.name}</span>
                <span className="small strong primary-text">Track visit</span>
              </button>
              {b.isCourse && (
                <div className="tint-box stack" style={{ gap: 6 }}>
                  <div className="strong">{b.visitLabel}, {b.planText}</div>
                  <div className="small" style={{ color: "var(--ink-soft)" }}>
                    {booking.sameCaregiver
                      ? `${b.caregiver.name} comes for every visit.`
                      : `A different ${b.who} may come each time. You see who is coming the evening before.`}
                  </div>
                  <button type="button" className="link-btn" onClick={switchNurse}>
                    {booking.sameCaregiver ? `Switch to any available ${b.who}` : `Keep ${b.caregiver.first} for the remaining visits`}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="dashed-box stack">
              <div className="muted">No visits booked yet.</div>
              <button type="button" className="link-btn" onClick={() => go("home")}>Book a visit</button>
            </div>
          )}
        </div>

        <div className="stack">
          <h2>Past</h2>
          {past.map((v) => (
            <div key={v.title + v.when} className="card stack-sm">
              <div className="between" style={{ alignItems: "flex-start" }}>
                <span className="strong" style={{ fontSize: 17 }}>{v.title}</span>
                <span className="pill pill-ok">Completed</span>
              </div>
              <div className="small muted">{v.when} · {v.who}</div>
              <div className="small muted">With {v.by}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function RecordsScreen() {
  const { state } = useApp();
  const records = [...state.history, ...SAMPLE_PAST_VISITS];
  return (
    <div className="screen">
      <div className="scroll scroll-top">
        <div className="stack" style={{ gap: 6 }}>
          <h1>Health records</h1>
          <p className="muted">Notes and readings from every home visit.</p>
        </div>
        {records.map((r) => (
          <div key={r.title + r.when} className="card stack" style={{ gap: 8 }}>
            <div className="stack-xs">
              <span className="tiny muted">{r.when} · {r.who}</span>
              <span className="strong" style={{ fontSize: 17 }}>{r.title}</span>
            </div>
            <p style={{ fontSize: 15 }}>{r.note}</p>
            <div className="small muted">Recorded by {r.by}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProfileScreen() {
  const { state, go } = useApp();
  return (
    <div className="screen">
      <div className="scroll scroll-top">
        <div className="row-inline" style={{ gap: 14 }}>
          <span className="avatar avatar-solid display" style={{ width: 60, height: 60, fontSize: 22 }}>K</span>
          <div className="stack-xs">
            <h1 style={{ fontSize: 24 }}>Kavya</h1>
            <div className="muted">+91 {state.phone}</div>
          </div>
        </div>

        <div className="stack">
          <h2>Family members</h2>
          <div className="rows">
            {PATIENTS.map((p) => (
              <div className="row" key={p.id}>
                <span className="strong">{p.name}</span>
                <span className="muted">{p.meta}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="stack">
          <h2>Saved address</h2>
          <div className="card stack-xs" style={{ padding: "14px 16px" }}>
            <span className="strong">Home</span>
            <span className="muted">{addressIn(cityById(state.cityId))}</span>
          </div>
        </div>

        <div className="stack">
          <h2>Emergency contact</h2>
          <div className="card between" style={{ padding: "14px 16px" }}>
            <span className="strong">Suresh (brother)</span>
            <span className="muted">Alerted on SOS</span>
          </div>
        </div>

        <button type="button" className="btn btn-danger" onClick={() => go("login")}>Log out</button>
      </div>
    </div>
  );
}
