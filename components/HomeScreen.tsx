"use client";

import { useApp } from "@/lib/store";
import { SERVICES } from "@/lib/data";
import { SELF, cityById, describeBooking, money, patientChip } from "@/lib/booking";
import { Icon } from "./Icon";
import { Chip } from "./ui";

export function UpcomingLabel({ visitNo, visits }: { visitNo: number; visits: number }) {
  return <>{visits > 1 ? `Upcoming · visit ${visitNo} of ${visits}` : "Upcoming visit"}</>;
}

export function HomeScreen() {
  const { state, set, go, open } = useApp();
  const upcoming = state.booking ? describeBooking(state.booking) : null;
  const address = state.addresses.find((a) => a.id === state.addressId) ?? state.addresses[0] ?? null;
  const firstName = (state.patients.find((p) => p.relation === SELF)?.name ?? "").split(" ")[0];
  const unread = state.notifications.filter((n) => !n.read).length;
  const selectedPatientId = state.patients.some((p) => p.id === state.patientId) ? state.patientId : state.patients[0]?.id;

  const openService = (id: string) =>
    set({ serviceId: id, screen: "service", trail: [], hasPrescription: false, slot: null, repeat: false });

  return (
    <div className="screen">
      <div className="scroll scroll-top" style={{ gap: 22 }}>
        <div className="home-top">
          <div className="stack-sm">
            <div className="muted" style={{ fontSize: 15 }}>Namaste{firstName ? `, ${firstName}` : ""}</div>
            <h1>What care do you need today?</h1>
          </div>
          <button type="button" className="bell" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} onClick={() => open("notifications")}>
            <Icon name="bell" />
            {unread > 0 && <span className="badge" aria-hidden="true">{unread}</span>}
          </button>
        </div>

        {address ? (
          <button type="button" className="city-btn" style={{ marginTop: -12 }} onClick={() => open("addresses")}>
            <Icon name="pin" size={16} />
            <span className="strong">{address.label}</span>
            <span className="muted">· {address.area}, {cityById(address.cityId).name}</span>
            <span className="primary-text strong">Change</span>
          </button>
        ) : (
          <div className="warn-box stack" style={{ gap: 12 }}>
            <div className="stack-xs">
              <h2>Add your address</h2>
              <div className="sub">We need it to show the nurses near you and to book a visit.</div>
            </div>
            <button type="button" className="btn btn-warn" onClick={() => open("address", { editingId: null })}>
              <Icon name="plus" size={20} />
              Add address
            </button>
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
            {state.patients.map((p) => (
              <Chip key={p.id} className="chip-pill" selected={p.id === selectedPatientId} onClick={() => set({ patientId: p.id })}>
                {patientChip(p)}
              </Chip>
            ))}
            <button type="button" className="chip chip-pill row-inline" style={{ gap: 6, borderStyle: "dashed" }} onClick={() => open("family", { editingId: null })}>
              <Icon name="plus" size={18} />
              Add family member
            </button>
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
