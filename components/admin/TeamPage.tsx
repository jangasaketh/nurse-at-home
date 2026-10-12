"use client";

// ADMIN: team members and roles (screens only). Each role sees only its own pages.
// With the server, each person gets their own sign-in with a code sent to their phone.

import { useState } from "react";
import { useAdmin } from "@/lib/admin/store";
import { dateOnly, ROLE_HELP, ROLE_PAGES, ROLE_TEXT, type AdminPage, type AdminRole } from "@/lib/admin/data";
import { Badge, Field, PageHead, useToast } from "./ui";

const PAGE_TEXT: Record<AdminPage, string> = {
  dashboard: "Dashboard", verification: "Verification", caregivers: "Caregivers", patients: "Patients", bookings: "Bookings", refunds: "Refunds",
  support: "Support", messages: "Messages", payouts: "Payouts", reports: "Reports", settings: "Settings", team: "Team", activity: "Activity log",
};
const ROLES = Object.keys(ROLE_TEXT) as AdminRole[];

export function TeamPage() {
  const { state, update, log } = useAdmin();
  const toast = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AdminRole>("support");
  const [tried, setTried] = useState(false);

  const activeOwners = state.team.filter((m) => m.active && m.role === "owner");
  const errors = {
    name: name.trim().length < 3 ? "Enter their name." : "",
    email: !/^\S+@\S+\.\S+$/.test(email.trim()) ? "Enter their work email." : state.team.some((m) => m.email.toLowerCase() === email.trim().toLowerCase()) ? "This email is already in the team." : "",
  };

  const add = () => {
    setTried(true);
    if (errors.name || errors.email) return;
    const member = { id: `t${Date.now().toString(36)}`, name: name.trim(), email: email.trim().toLowerCase(), role, active: true, addedAt: Date.now() };
    update((prev) => ({ team: [...prev.team, member] }));
    log(`Added ${member.name} (${member.email}) to the team as ${ROLE_TEXT[role].toLowerCase()}`, "team");
    toast(`${member.name} added. They can sign in with ${member.email}.`);
    setName(""); setEmail(""); setRole("support"); setTried(false);
  };
  const isMe = (mail: string) => mail.toLowerCase() === state.adminEmail.toLowerCase();
  const changeRole = (id: string, next: AdminRole) => {
    const m = state.team.find((x) => x.id === id);
    if (!m) return;
    if (m.role === "owner" && next !== "owner" && activeOwners.length <= 1 && m.active) { toast("Keep at least one owner"); return; }
    const me = isMe(m.email);
    update((prev) => ({
      team: prev.team.map((x) => (x.id === id ? { ...x, role: next } : x)),
      // Changing your own role changes what you can open straight away.
      ...(me ? { role: next, page: ROLE_PAGES[next].includes(prev.page) ? prev.page : "dashboard" } : {}),
    }));
    log(`Changed ${m.name}'s role: ${ROLE_TEXT[m.role].toLowerCase()} → ${ROLE_TEXT[next].toLowerCase()}`, "team");
    toast(`${m.name} is now ${ROLE_TEXT[next].toLowerCase()}`);
  };
  const toggle = (id: string) => {
    const m = state.team.find((x) => x.id === id);
    if (!m) return;
    if (m.active && isMe(m.email)) { toast("You cannot switch off your own access"); return; }
    if (m.active && m.role === "owner" && activeOwners.length <= 1) { toast("Keep at least one owner"); return; }
    update((prev) => ({ team: prev.team.map((x) => (x.id === id ? { ...x, active: !x.active } : x)) }));
    log(`${m.active ? "Switched off" : "Switched on"} ${m.name}'s access`, "team");
    toast(`${m.name}’s access is ${m.active ? "switched off" : "switched on"}`);
  };

  return (
    <>
      <PageHead title="Team" sub="Who can use the admin panel, and what each role can open. Only owners see this page." />
      <div className="anote info adm-small">Prototype: these screens show how roles will work. Anyone signing in with a team member’s email gets that role (any password works). With the server, each person gets their own password and a code sent to their phone, and switched-off people cannot sign in at all.</div>

      <section className="acard acard-flat">
        <div className="atable-wrap">
          <table className="atable">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Access</th><th>Added</th><th /></tr></thead>
            <tbody>
              {state.team.map((m) => (
                <tr key={m.id}>
                  <td className="adm-strong">{m.name}{isMe(m.email) && <> <Badge tone="info">You</Badge></>}</td>
                  <td>{m.email}</td>
                  <td>
                    <label className="afield" htmlFor={`team-role-${m.id}`}>
                      <span className="ainput-label">Role for {m.name}</span>
                      <select id={`team-role-${m.id}`} value={m.role} onChange={(e) => changeRole(m.id, e.target.value as AdminRole)}>
                        {ROLES.map((r) => <option key={r} value={r}>{ROLE_TEXT[r]}</option>)}
                      </select>
                    </label>
                  </td>
                  <td>{m.active ? <Badge tone="ok">On</Badge> : <Badge tone="danger">Switched off</Badge>}</td>
                  <td className="nowrap">{dateOnly(m.addedAt)}</td>
                  <td><button type="button" className="abtn abtn-sm" onClick={() => toggle(m.id)}>{m.active ? "Switch off" : "Switch on"}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="agrid agrid-2" style={{ alignItems: "start" }}>
        <section className="acard">
          <h2>Add a team member</h2>
          <Field id="team-name" label="Name" value={name} onChange={setName} error={tried ? errors.name : ""} />
          <Field id="team-email" label="Work email" type="email" value={email} onChange={setEmail} error={tried ? errors.email : ""} />
          <div className="adm-col" role="radiogroup" aria-label="Role">
            {ROLES.map((r) => (
              <label key={r} className="achoice"><input type="radio" name="team-role" checked={role === r} onChange={() => setRole(r)} /><span><b>{ROLE_TEXT[r]}</b><br /><span className="adm-small adm-muted">{ROLE_HELP[r]}</span></span></label>
            ))}
          </div>
          <div><button type="button" className="abtn abtn-primary" onClick={add}>Add to the team</button></div>
        </section>

        <section className="acard acard-flat">
          <div className="acard-head" style={{ padding: "16px 18px 6px" }}><h2>What each role can open</h2></div>
          <div className="atable-wrap">
            <table className="atable">
              <thead><tr><th>Page</th>{ROLES.map((r) => <th key={r} className="num">{ROLE_TEXT[r].replace(" team", "")}</th>)}</tr></thead>
              <tbody>
                {(Object.keys(PAGE_TEXT) as AdminPage[]).map((p) => (
                  <tr key={p}>
                    <td>{PAGE_TEXT[p]}</td>
                    {ROLES.map((r) => <td key={r} className="num">{ROLE_PAGES[r].includes(p) ? <span aria-label="Yes">✓</span> : <span className="adm-muted" aria-label="No">—</span>}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
