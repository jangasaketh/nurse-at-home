"use client";

// ADMIN: patient accounts. Look up a patient by name, phone or family member, and see their family,
// addresses, bookings, complaints and refunds in one place.

import { useState } from "react";
import { useAdmin } from "@/lib/admin/store";
import { ago, cityName, dateOnly, dateTime, money, serviceName, type PatientAccount } from "@/lib/admin/data";
import { BookingDrawer, StatusBadge } from "./BookingsPages";
import { Badge, Drawer, Empty, Field, PageHead, Select } from "./ui";

const LivePatientBadge = () => <Badge tone="live">Live · patient app</Badge>;

export function PatientsPage() {
  const { view, state } = useAdmin();
  const [q, setQ] = useState("");
  const [city, setCity] = useState("all");
  const [only, setOnly] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const stats = (a: PatientAccount) => {
    const bookings = view.bookings.filter((b) => b.accountId === a.id);
    const tickets = view.tickets.filter((tk) => tk.from === "patient" && tk.name === a.name);
    const refunds = view.refunds.filter((r) => r.from === a.name);
    const past = bookings.filter((b) => b.at < Date.now()).sort((x, y) => y.at - x.at);
    return { bookings, tickets, open: tickets.filter((tk) => tk.status === "open").length, refunds, last: past[0]?.at ?? null };
  };

  const rows = view.accounts.filter((a) => {
    if (city !== "all" && a.cityId !== city) return false;
    const st = stats(a);
    if (only === "complaints" && st.open === 0) return false;
    if (only === "dues" && a.dues <= 0) return false;
    if (q) {
      const hay = `${a.name} ${a.phone} ${a.family.map((f) => f.name).join(" ")}`.toLowerCase();
      if (!hay.includes(q.toLowerCase().trim())) return false;
    }
    return true;
  });
  const open = view.accounts.find((a) => a.id === openId) ?? null;

  return (
    <>
      <PageHead title="Patients" sub={`${view.accounts.length} patient accounts (sample${view.patient ? ", plus the patient signed in to the patient app in this browser" : ""}). Search by name, phone or a family member’s name.`} />
      <div className="afilters">
        <Field id="pt-search" label="Search" value={q} onChange={setQ} placeholder="Name, phone or family member" />
        <Select id="pt-city" label="City" value={city} onChange={setCity} options={[{ value: "all", label: "All cities" }, ...state.settings.cities.map((c) => ({ value: c.id, label: c.name }))]} />
        <Select id="pt-only" label="Show" value={only} onChange={setOnly} options={[{ value: "all", label: "Everyone" }, { value: "complaints", label: "With an open complaint" }, { value: "dues", label: "With an unpaid charge" }]} />
      </div>
      <section className="acard acard-flat">
        {rows.length === 0 ? <Empty title="No patients match" body="Check the spelling, or search by phone number." /> : (
          <div className="atable-wrap">
            <table className="atable">
              <thead><tr><th>Account</th><th>City</th><th>Family</th><th className="num">Bookings</th><th>Last visit</th><th>Complaints</th><th className="num">Unpaid</th></tr></thead>
              <tbody>
                {rows.map((a) => {
                  const st = stats(a);
                  return (
                    <tr key={a.id} className="click" onClick={() => setOpenId(a.id)}>
                      <td><span className="adm-strong">{a.name}</span>{a.live && <> <LivePatientBadge /></>}<span className="sub">+91 {a.phone}</span></td>
                      <td>{cityName(a.cityId)}<span className="sub">{a.addresses[0]?.area ?? ""}</span></td>
                      <td className="adm-small">{a.family.length > 1 ? a.family.slice(1).map((f) => `${f.name} (${f.relation.toLowerCase()})`).join(", ") : <span className="adm-muted">Only themself</span>}</td>
                      <td className="num">{a.live ? (view.patient?.booking ? 1 : 0) : st.bookings.length}</td>
                      <td className="nowrap">{st.last ? ago(st.last) : <span className="adm-muted">—</span>}</td>
                      <td>{st.open > 0 ? <Badge tone="danger">{st.open} open</Badge> : st.tickets.length ? <Badge tone="ok">Resolved</Badge> : <span className="adm-muted">None</span>}</td>
                      <td className="num">{a.dues > 0 ? <Badge tone="warn">{money(a.dues)}</Badge> : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {open && <PatientDrawer a={open} onClose={() => setOpenId(null)} />}
    </>
  );
}

function PatientDrawer({ a, onClose }: { a: PatientAccount; onClose: () => void }) {
  const { view, nowMs } = useAdmin();
  const [bookingId, setBookingId] = useState<string | null>(null);
  const bookings = view.bookings.filter((b) => b.accountId === a.id).sort((x, y) => y.at - x.at);
  const tickets = view.tickets.filter((tk) => tk.from === "patient" && tk.name === a.name);
  const refunds = view.refunds.filter((r) => r.from === a.name);
  const booking = view.bookingById(bookingId);
  const live = a.live ? view.patient : null;

  return (
    <>
      <Drawer label={`Patient ${a.name}`} onClose={onClose}
        title={<span className="adm-row">{a.name}{a.live && <LivePatientBadge />}</span>}
        sub={`+91 ${a.phone} · ${cityName(a.cityId)}${a.live ? "" : ` · joined ${dateOnly(a.joinedAt)}`}`}>
        {a.live && <div className="anote info">This is the patient signed in to the patient app in this browser. Shown read-only until the server connects the apps.</div>}
        {a.dues > 0 && <div className="anote">Unpaid home visit charge of {money(a.dues)} from a cash booking. It is collected with their next booking.</div>}

        <div className="agrid agrid-2" style={{ alignItems: "start" }}>
          <section className="adm-col">
            <h3>Family members</h3>
            <table className="atable">
              <thead><tr><th>Name</th><th>Relation</th><th className="num">Age</th><th className="num">Visits</th></tr></thead>
              <tbody>
                {a.family.map((f) => (
                  <tr key={f.name + f.relation}>
                    <td>{f.name}</td>
                    <td>{f.relation === "Self" ? "Account holder" : f.relation}</td>
                    <td className="num">{f.age || "—"}{f.gender ? ` · ${f.gender}` : ""}</td>
                    <td className="num">{bookings.filter((b) => b.patient.name === f.name).length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="adm-col">
            <h3>Addresses and contact</h3>
            {a.addresses.length === 0 ? <p className="adm-small adm-muted">No address saved.</p> : a.addresses.map((ad, i) => (
              <div key={i} className="amsg"><b>{ad.label || "Address"}</b>{ad.line}, {ad.area}, {cityName(ad.cityId)} {ad.pincode}</div>
            ))}
            <dl className="akv">
              <dt>Emergency contact</dt><dd>{a.contact ?? "Not given"}</dd>
            </dl>
          </section>
        </div>

        {live && (
          <section className="adm-col">
            <h3>In the patient app</h3>
            {live.booking ? (
              <div className="amsg"><b>Current booking</b>{live.booking.service} · {live.booking.when}{live.booking.visits > 1 ? ` · visit ${live.booking.visitNo} of ${live.booking.visits}` : ""} · {live.booking.pay}{live.booking.prescription ? " · prescription uploaded" : ""}</div>
            ) : <p className="adm-small adm-muted">No booking at the moment.</p>}
            {live.records.length > 0 && (
              <table className="atable">
                <thead><tr><th>Visit</th><th>When</th><th>Result</th><th>Caregiver</th></tr></thead>
                <tbody>{live.records.map((r, i) => <tr key={i}><td>{r.title}</td><td>{r.when}</td><td>{r.status}</td><td>{r.by}</td></tr>)}</tbody>
              </table>
            )}
          </section>
        )}

        {!a.live && (
          <section className="adm-col">
            <h3>Bookings ({bookings.length})</h3>
            {bookings.length === 0 ? <p className="adm-small adm-muted">No bookings in the last 7 days.</p> : (
              <div className="atable-wrap">
                <table className="atable">
                  <thead><tr><th>Booking</th><th>Visit</th><th>For</th><th>Service</th><th>Status</th></tr></thead>
                  <tbody>
                    {bookings.map((b) => (
                      <tr key={b.id} className="click" onClick={() => setBookingId(b.id)}>
                        <td className="nowrap adm-strong">{b.id}</td>
                        <td className="nowrap">{dateTime(b.at)}</td>
                        <td>{b.patient.name}<span className="sub">{b.patient.forWhom === "Self" ? "Themself" : b.patient.forWhom}</span></td>
                        <td>{serviceName(b.serviceId)}</td>
                        <td><StatusBadge s={b.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        <section className="adm-col">
          <h3>Complaints ({tickets.length})</h3>
          {tickets.length === 0 ? <p className="adm-small adm-muted">None.</p> : tickets.map((tk) => (
            <div key={tk.id} className="amsg">
              <span className="adm-row" style={{ gap: 8 }}><b>{tk.id} · {tk.topic}</b>{tk.status === "open" ? <Badge tone={tk.urgent ? "danger" : "warn"}>{tk.urgent ? "Urgent, open" : "Open"}</Badge> : <Badge tone="ok">Resolved</Badge>}</span>
              <span>{tk.message}</span>
              <span className="adm-small adm-muted">{ago(tk.at, nowMs)}{tk.replies.length ? ` · ${tk.replies.length} ${tk.replies.length === 1 ? "reply" : "replies"}` : ""}</span>
            </div>
          ))}
        </section>

        <section className="adm-col">
          <h3>Refunds ({refunds.length})</h3>
          {refunds.length === 0 ? <p className="adm-small adm-muted">None.</p> : (
            <table className="atable">
              <tbody>
                {refunds.map((r) => (
                  <tr key={r.id}>
                    <td className="nowrap adm-strong">{r.id}</td>
                    <td className="nowrap">{r.bookingId}</td>
                    <td className="adm-small">{r.reason}</td>
                    <td className="nowrap">{r.decision ? (r.decision.status === "approved" ? <Badge tone="ok">Refunded {money(r.decision.amount)}</Badge> : <Badge tone="danger">Declined</Badge>) : <Badge tone="warn">Waiting · {money(r.asked)}</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </Drawer>
      {booking && <BookingDrawer b={booking} onClose={() => setBookingId(null)} />}
    </>
  );
}
