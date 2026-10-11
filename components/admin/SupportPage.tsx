"use client";

// ADMIN: support tickets and complaints from patients and caregivers.

import { useState } from "react";
import { useAdmin, type TicketRow } from "@/lib/admin/store";
import * as link from "@/lib/admin/link";
import { ago, dateTime, serviceName } from "@/lib/admin/data";
import { StatusBadge } from "./BookingsPages";
import { Badge, Doc, Drawer, Empty, LiveBadge, PageHead, Select, Tabs, useToast } from "./ui";

const QUICK = [
  "We are sorry about this. We have spoken to the caregiver and will make sure it does not happen again.",
  "We have checked this and refunded the amount. It reaches your account in 5 to 7 working days.",
  "If this is an emergency, call 108 now. A nurse from our team will call you within 10 minutes.",
  "Thank you for telling us. We have looked into it and fixed the problem.",
];

export function SupportPage() {
  const { view, nowMs } = useAdmin();
  const [tab, setTab] = useState<"open" | "resolved">("open");
  const [from, setFrom] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const list = view.tickets.filter((tk) => tk.status === tab && (from === "all" || tk.from === from))
    .sort((a, b) => (tab === "open" ? Number(b.urgent) - Number(a.urgent) || a.at - b.at : b.at - a.at));
  const open = view.tickets.find((tk) => tk.id === openId) ?? null;
  const openCount = view.tickets.filter((tk) => tk.status === "open").length;

  return (
    <>
      <PageHead title="Support" sub="Complaints and questions from patients and caregivers. Urgent ones (safety, a problem after a visit) are at the top: answer within 30 minutes." />
      <div className="afilters">
        <Tabs label="Ticket lists" value={tab} onChange={setTab} tabs={[{ id: "open", label: "Open", n: openCount }, { id: "resolved", label: "Resolved", n: view.tickets.length - openCount }]} />
        <span style={{ flex: 1 }} />
        <Select id="sp-from" label="From" value={from} onChange={setFrom} options={[{ value: "all", label: "Patients and caregivers" }, { value: "patient", label: "Patients" }, { value: "caregiver", label: "Caregivers" }]} />
      </div>
      <section className="acard acard-flat">
        {list.length === 0 ? <Empty title={tab === "open" ? "No open tickets" : "No resolved tickets yet"} body={tab === "open" ? "Reports sent from the caregiver app’s “Report a problem” appear here too." : undefined} /> : (
          <div className="atable-wrap">
            <table className="atable">
              <thead><tr><th>Ticket</th><th>From</th><th>Topic</th><th>Message</th><th>Received</th><th /></tr></thead>
              <tbody>
                {list.map((tk) => (
                  <tr key={tk.id} className="click" onClick={() => setOpenId(tk.id)}>
                    <td className="nowrap"><span className="adm-strong">{tk.id}</span>{tk.urgent && tk.status === "open" && <span className="sub"><Badge tone="danger">Urgent</Badge></span>}</td>
                    <td>{tk.name}{tk.live && <> <LiveBadge /></>}<span className="sub">{tk.from === "patient" ? "Patient" : "Caregiver"}</span></td>
                    <td>{tk.topic}</td>
                    <td className="adm-small" style={{ maxWidth: 420 }}>{tk.message}</td>
                    <td className="nowrap">{ago(tk.at, nowMs)}</td>
                    <td>{tk.replies.length > 0 && <Badge tone="info">Replied</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {open && <TicketDrawer tk={open} onClose={() => setOpenId(null)} />}
    </>
  );
}

function TicketDrawer({ tk, onClose }: { tk: TicketRow; onClose: () => void }) {
  const { view, update, log, refreshCg, nowMs } = useAdmin();
  const toast = useToast();
  const [text, setText] = useState("");
  const [tried, setTried] = useState(false);
  const b = view.bookingById(tk.bookingId);
  const cg = b ? view.memberById(b.caregiverId) : null;

  const save = (status: "open" | "resolved", reply: string | null) => {
    update((prev) => {
      const cur = prev.tickets[tk.id] ?? { status: tk.status, replies: tk.replies };
      return { tickets: { ...prev.tickets, [tk.id]: { status, replies: reply ? [...cur.replies, { text: reply, at: Date.now() }] : cur.replies } } };
    });
  };
  const send = (resolve: boolean) => {
    setTried(true);
    const reply = text.trim();
    if (reply.length < 5) return;
    if (tk.live) link.replyTicketLive(tk.id, reply, resolve);
    save(resolve ? "resolved" : tk.status, reply);
    log(`Replied to ${tk.id} (${tk.name})${resolve ? " and closed it" : ""}`, "support");
    refreshCg();
    toast(resolve ? `Reply sent and ${tk.id} closed` : "Reply sent");
    setText("");
    setTried(false);
    if (resolve) onClose();
  };
  const setStatus = (status: "open" | "resolved") => {
    if (tk.live) link.setTicketStatusLive(tk.id, status);
    save(status, null);
    log(`${status === "resolved" ? "Closed" : "Reopened"} ${tk.id}`, "support");
    refreshCg();
    toast(status === "resolved" ? `${tk.id} closed` : `${tk.id} reopened`);
    if (status === "resolved") onClose();
  };

  return (
    <Drawer narrow label={`Ticket ${tk.id}`} onClose={onClose}
      title={<span className="adm-row">{tk.id}{tk.urgent && <Badge tone="danger">Urgent</Badge>}{tk.status === "resolved" && <Badge tone="ok">Resolved</Badge>}{tk.live && <LiveBadge />}</span>}
      sub={`${tk.topic} · ${tk.from === "patient" ? "patient" : "caregiver"} ${tk.name}, ${tk.phone} · ${dateTime(tk.at)}`}
      footer={tk.status === "open" ? (
        <>
          <button type="button" className="abtn" onClick={() => setStatus("resolved")}>Close without reply</button>
          <button type="button" className="abtn" onClick={() => send(false)}>Send reply</button>
          <button type="button" className="abtn abtn-primary" onClick={() => send(true)}>Send and close</button>
        </>
      ) : <button type="button" className="abtn" onClick={() => setStatus("open")}>Reopen</button>}>
      {tk.urgent && tk.status === "open" && <div className="anote danger">Urgent. Call {tk.name} on {tk.phone} now, then write here what was agreed.</div>}
      <div className="amsg"><b>{tk.name} wrote, {ago(tk.at, nowMs)}</b>{tk.message}</div>
      {tk.photo && <Doc file={tk.photo} label="Photo they added" />}
      {b && (
        <section className="acard">
          <h3>Booking {b.id} <StatusBadge s={b.status} /></h3>
          <p className="adm-small">{serviceName(b.serviceId)} · {dateTime(b.at)} · caregiver {cg?.name ?? "—"}</p>
          <p className="adm-small adm-muted">Open Bookings and search for {b.id} to reassign, cancel or refund.</p>
        </section>
      )}
      {tk.replies.map((r, i) => <div key={i} className="amsg ours"><b>Our reply, {ago(r.at, nowMs)}</b>{r.text}</div>)}
      {tk.status === "open" && (
        <div className="adm-col">
          <label className="afield" htmlFor="sp-reply"><span>Reply to {tk.name}</span>
            <textarea id="sp-reply" value={text} onChange={(e) => setText(e.target.value)} />
            {tried && text.trim().length < 5 && <span className="err" role="alert">Write a reply first.</span>}
            {tk.live && <span className="hint">Shown in the caregiver app under “Your reports”, with a notification. Written in English.</span>}
          </label>
          <div className="adm-col" style={{ gap: 6 }}>
            <span className="adm-small adm-muted">Ready-made replies</span>
            {QUICK.map((q) => <button key={q} type="button" className="achoice adm-small" onClick={() => setText(q)}>{q}</button>)}
          </div>
        </div>
      )}
    </Drawer>
  );
}
