"use client";

// ADMIN: send one notice to many caregivers at once (a city, a role, or only those online).

import { useState } from "react";
import { useAdmin } from "@/lib/admin/store";
import * as link from "@/lib/admin/link";
import * as live from "@/lib/admin/live";
import { ago, cityName, dateTime } from "@/lib/admin/data";
import { Icon } from "../Icon";
import { Badge, Empty, Field, PageHead, Select, useToast } from "./ui";

const TEMPLATES: { label: string; title: string; body: string }[] = [
  { label: "Busy evening", title: "Busy evening: go online", body: "Many patients are booking for this evening. Go online on the Jobs screen if you can take visits." },
  { label: "Diwali", title: "Diwali week: more requests", body: "Diwali week brings more requests than usual. Go online to get them. You keep half of every urgent charge." },
  { label: "Heavy rain", title: "Heavy rain: travel safely", body: "Heavy rain in the city today. Leave early, tell patients if you will be late, and do not ride through flooded roads." },
  { label: "Bank holiday", title: "Payout on Tuesday this week", body: "Monday is a bank holiday, so this week's payout reaches your account on Tuesday." },
];

type RoleFilter = "all" | "nurse" | "compounder";

export function MessagesPage() {
  const { view, state, cg, update, log, refreshCg, nowMs } = useAdmin();
  const toast = useToast();
  const [cityId, setCityId] = useState("all");
  const [role, setRole] = useState<RoleFilter>("all");
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tried, setTried] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const recipients = view.roster.filter((m) => !m.suspended && (cityId === "all" || m.cityId === cityId) && (role === "all" || m.role === role) && (!onlineOnly || m.online));
  const errors = {
    title: title.trim().length < 3 ? "Write a short title." : title.length > 60 ? "Keep the title under 60 characters." : "",
    body: body.trim().length < 10 ? "Write the message, at least a sentence." : body.length > 300 ? "Keep the message under 300 characters." : "",
  };
  const lower = (x: string) => x.charAt(0).toLowerCase() + x.slice(1);
  const audience = `${role === "all" ? "Nurses and compounders" : role === "nurse" ? "Nurses" : "Compounders"} in ${cityId === "all" ? "all cities" : cityName(cityId)}${onlineOnly ? ", online now" : ""}`;

  const send = () => {
    setTried(true);
    if (errors.title || errors.body || recipients.length === 0) return;
    if (!confirm) { setConfirm(true); return; }
    if (state.mode === "live") {
      // Real team sign-in: the database sends it to every matching caregiver.
      live.sendBroadcast(title.trim(), body.trim(), cityId === "all" ? null : cityId, role === "all" ? null : role, onlineOnly)
        .then((n) => {
          update((prev) => ({ broadcasts: [{ id: `B-${3000 + prev.broadcasts.length}`, at: Date.now(), title: title.trim(), body: body.trim(), cityId, role, onlineOnly, recipients: n, by: prev.adminName }, ...prev.broadcasts] }));
          log(`Sent “${title.trim()}” to ${n} caregivers (${lower(audience)})`, "messages");
          toast(`Sent to ${n} ${n === 1 ? "caregiver" : "caregivers"}`);
          setTitle(""); setBody(""); setTried(false); setConfirm(false);
        })
        .catch((e: Error) => toast(`Could not send: ${e.message}`));
      return;
    }
    const liveGets = recipients.some((m) => m.live);
    if (liveGets) link.messageLive(title.trim(), body.trim());
    update((prev) => ({
      broadcasts: [{ id: `B-${3000 + prev.broadcasts.length}`, at: Date.now(), title: title.trim(), body: body.trim(), cityId, role, onlineOnly, recipients: recipients.length, by: prev.adminName }, ...prev.broadcasts],
    }));
    log(`Sent “${title.trim()}” to ${recipients.length} caregivers (${lower(audience)})`, "messages");
    refreshCg();
    toast(`Sent to ${recipients.length} ${recipients.length === 1 ? "caregiver" : "caregivers"}${liveGets ? ", including the caregiver app" : ""}`);
    setTitle(""); setBody(""); setTried(false); setConfirm(false);
  };

  return (
    <>
      <PageHead title="Messages to caregivers" sub="Send one notice to many caregivers: a whole city, only nurses or compounders, or only those online now. It arrives in the caregiver app’s notifications." />
      <div className="agrid agrid-2" style={{ alignItems: "start" }}>
        <section className="acard">
          <h2>New message</h2>
          <div className="agrid agrid-2">
            <Select id="msg-city" label="City" value={cityId} onChange={(v) => { setCityId(v); setConfirm(false); }} options={[{ value: "all", label: "All cities" }, ...state.settings.cities.map((c) => ({ value: c.id, label: c.name }))]} />
            <Select<RoleFilter> id="msg-role" label="Who" value={role} onChange={(v) => { setRole(v); setConfirm(false); }} options={[{ value: "all", label: "Nurses and compounders" }, { value: "nurse", label: "Nurses only" }, { value: "compounder", label: "Compounders only" }]} />
          </div>
          <label className="achoice"><input id="msg-online" type="checkbox" checked={onlineOnly} onChange={(e) => { setOnlineOnly(e.target.checked); setConfirm(false); }} /><span>Only caregivers who are online now</span></label>
          <div className="adm-col" style={{ gap: 6 }}>
            <span className="adm-small adm-muted">Ready-made messages</span>
            <div className="adm-row" style={{ gap: 6 }}>
              {TEMPLATES.map((tp) => <button key={tp.label} type="button" className="abtn abtn-sm" onClick={() => { setTitle(tp.title); setBody(tp.body); setConfirm(false); }}>{tp.label}</button>)}
            </div>
          </div>
          <Field id="msg-title" label="Title" value={title} onChange={(v) => { setTitle(v); setConfirm(false); }} error={tried ? errors.title : ""} hint={`${title.length} of 60`} />
          <Field id="msg-body" label="Message" multiline value={body} onChange={(v) => { setBody(v); setConfirm(false); }} error={tried ? errors.body : ""} hint={`${body.length} of 300. Shown in English, also to caregivers using Telugu or Kannada.`} />
          <div className={`anote ${recipients.length ? "info" : "danger"}`} role="status">
            {recipients.length
              ? <>Goes to <b>{recipients.length} {recipients.length === 1 ? "caregiver" : "caregivers"}</b>: {lower(audience)}. Paused caregivers are left out.{recipients.some((m) => m.live) ? " Includes the caregiver app in this browser." : cg?.kycStatus === "approved" ? " The caregiver app in this browser is not in this group." : ""}</>
              : <>Nobody matches: {lower(audience)}.</>}
          </div>
          {confirm && <div className="anote" role="alert">Press “Send now” again to send to {recipients.length} caregivers. This cannot be taken back.</div>}
          <div className="adm-row">
            <button type="button" className="abtn abtn-primary" onClick={send} disabled={recipients.length === 0}>{confirm ? "Send now" : "Send…"}</button>
            {confirm && <button type="button" className="abtn" onClick={() => setConfirm(false)}>Cancel</button>}
          </div>
        </section>

        <section className="acard">
          <h2>How it looks in the caregiver app</h2>
          <div className="amsg" style={{ flexDirection: "row", gap: 12, alignItems: "flex-start", maxWidth: 380 }}>
            <span style={{ width: 34, height: 34, borderRadius: "50%", background: "#e5edf7", color: "#1d4e89", display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "none" }}><Icon name="message" size={18} /></span>
            <span className="adm-col" style={{ gap: 2 }}>
              <b>{title.trim() || "Title"}</b>
              <span className="adm-small">{body.trim() || "Your message appears here."}</span>
              <span className="adm-small adm-muted">Just now</span>
            </span>
          </div>
          <p className="adm-small adm-muted">With the server, this also goes out as a push notification. Until then, only the caregiver app in this browser receives it.</p>
        </section>
      </div>

      <section className="acard acard-flat">
        <div className="acard-head" style={{ padding: "16px 18px 6px" }}><h2>Sent messages</h2><span className="adm-small adm-muted">{state.broadcasts.length} sent</span></div>
        {state.broadcasts.length === 0 ? <Empty title="No messages sent yet" /> : (
          <div className="atable-wrap">
            <table className="atable">
              <thead><tr><th>Sent</th><th>Message</th><th>To</th><th className="num">Caregivers</th><th>By</th></tr></thead>
              <tbody>
                {state.broadcasts.map((b) => (
                  <tr key={b.id}>
                    <td className="nowrap">{dateTime(b.at)}<span className="sub">{ago(b.at, nowMs)}</span></td>
                    <td><span className="adm-strong">{b.title}</span><span className="sub">{b.body}</span></td>
                    <td className="adm-small">{b.role === "all" ? "Nurses and compounders" : b.role === "nurse" ? "Nurses" : "Compounders"}, {b.cityId === "all" ? "all cities" : cityName(b.cityId)}{b.onlineOnly ? <> <Badge>Online only</Badge></> : null}</td>
                    <td className="num">{b.recipients}</td>
                    <td className="nowrap">{b.by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
