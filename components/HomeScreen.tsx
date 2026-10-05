"use client";

import { useState } from "react";
import { useApp } from "@/lib/store";
import { CITIES, PATIENTS, SERVICES } from "@/lib/data";
import { addressIn, cityById, describeBooking, money } from "@/lib/booking";
import { Icon } from "./Icon";
import { Chip } from "./ui";

export function UpcomingLabel({ visitNo, visits }: { visitNo: number; visits: number }) {
  return <>{visits > 1 ? `Upcoming · visit ${visitNo} of ${visits}` : "Upcoming visit"}</>;
}

export function HomeScreen() {
  const { state, set, go } = useApp();
  const upcoming = state.booking ? describeBooking(state.booking) : null;
  const city = cityById(state.cityId);
  const [pickingCity, setPickingCity] = useState(false);

  const openService = (id: string) =>
    set({ serviceId: id, screen: "service", hasPrescription: false, slot: null, repeat: false });

  return (
    <div className="screen">
      <div className="scroll scroll-top" style={{ gap: 22 }}>
        <div className="stack-sm">
          <div className="muted" style={{ fontSize: 15 }}>Namaste, Kavya</div>
          <h1>What care do you need today?</h1>
          <button type="button" className="city-btn" aria-expanded={pickingCity} onClick={() => setPickingCity(!pickingCity)}>
            <Icon name="pin" size={16} />
            <span className="strong">{city.name}</span>
            <span className="muted">· {city.area}</span>
            <span className="primary-text strong">Change</span>
          </button>
        </div>

        {pickingCity && (
          <div className="card stack">
            <h2>Choose your city</h2>
            <div className="wrap">
              {CITIES.map((c) => (
                <Chip
                  key={c.id}
                  className="chip-toggle"
                  selected={c.id === state.cityId}
                  onClick={() => { set({ cityId: c.id, language: null }); setPickingCity(false); }}
                >
                  {c.name}
                </Chip>
              ))}
            </div>
            <p className="small muted">Visits go to {addressIn(city)}.</p>
          </div>
        )}

        {upcoming && state.booking && (
          <button type="button" className="upcoming" onClick={() => go("tracking")}>
            <span className="stack-xs" style={{ flex: 1, minWidth: 0 }}>
              <span className="tiny" style={{ opacity: 0.9 }}>
                <UpcomingLabel visitNo={state.booking.visitNo} visits={state.booking.visits} />
              </span>
              <span className="strong">{upcoming.service.name} · {upcoming.when}</span>
            </span>
            <Icon name="next" />
          </button>
        )}

        <div className="stack">
          <h2 style={{ fontSize: 17 }}>Who needs care?</h2>
          <div className="wrap">
            {PATIENTS.map((p) => (
              <Chip key={p.id} className="chip-pill" selected={p.id === state.patientId} onClick={() => set({ patientId: p.id })}>
                {p.chip}
              </Chip>
            ))}
          </div>
        </div>

        <div className="stack">
          <h2 style={{ fontSize: 17 }}>Services</h2>
          <div className="grid grid-2 grid-services">
            {SERVICES.map((s) => (
              <button type="button" key={s.id} className="service-tile" onClick={() => openService(s.id)}>
                <span className="icon-bubble"><Icon name={s.icon} /></span>
                <span className="name">{s.name}</span>
                <span className="stack-xs foot">
                  <span className="small muted">From {money(s.price)}</span>
                  <span className={s.needsPrescription ? "tag-rx" : "tag-none"}>
                    {s.needsPrescription ? "Prescription needed" : "No prescription needed"}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="tint-box" style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <span className="primary-text" style={{ paddingTop: 2 }}><Icon name="shield" /></span>
          <div className="stack-xs">
            <div className="strong">Checked before they visit</div>
            <div className="small" style={{ color: "var(--ink-soft)" }}>
              Every caregiver&apos;s ID and nursing licence is verified. Only registered nurses give injections and drips.
            </div>
          </div>
        </div>

        <p className="small muted">
          This app is not for emergencies. For chest pain, heavy bleeding or trouble breathing, call 112.
        </p>
      </div>
    </div>
  );
}
