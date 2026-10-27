"use client";

// ADMIN: team members and roles (screens only). Each role sees only its own pages.
// With the server, each person gets their own sign-in with a code sent to their phone.

import { useCallback, useEffect, useState } from "react";
import { db } from "@/lib/supabase";
import type { TeamMember } from "@/lib/admin/data";
import { useAdmin } from "@/lib/admin/store";
import { dateOnly, ROLE_HELP, ROLE_PAGES, ROLE_TEXT, type AdminPage, type AdminRole } from "@/lib/admin/data";
import { Badge, Field, PageHead, useToast } from "./ui";

const PAGE_TEXT: Record<AdminPage, string> = {
  dashboard: "Dashboard", verification: "Verification", caregivers: "Caregivers", patients: "Patients", bookings: "Bookings", refunds: "Refunds",
  support: "Support", messages: "Messages", payouts: "Payouts", reports: "Reports", settings: "Settings", team: "Team", activity: "Activity log",
};
const ROLES = Object.keys(ROLE_TEXT) as AdminRole[];

export function TeamPage() {
  const { state, update, log, set } = useAdmin();
  const toast = useToast();
  const live = state.mode === "live";

  // Live: the team comes from the database (admin_users); demo: the sample team saved in this browser.
  const [liveTeam, setLiveTeam] = useState<TeamMember[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const load = useCallback(async () => {
    const { data, error } = await db("admin").from("admin_users").select("id, email, name, role, active, created_at").order("created_at");
    if (error) { setLoadError(error.message); return; }
    setLoadError("");
    setLiveTeam((data ?? []).map((m) => ({ id: m.id, email: m.email, name: m.name, role: m.role as AdminRole, active: m.active, addedAt: new Date(m.created_at).getTime() })));
  }, []);
  useEffect(() => { if (live) void load(); }, [live, load]);
  const team = live ? liveTeam ?? [] : state.team;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AdminRole>("support");
  const [tried, setTried] = useState(false);

  const activeOwners = team.filter((m) => m.active && m.role === "owner");
  const errors = {
    name: name.trim().length < 3 ? "Enter their name." : "",
    email: !/^\S+@\S+\.\S+$/.test(email.trim()) ? "Enter their work email." : team.some((m) => m.email.toLowerCase() === email.trim().toLowerCase()) ? "This email is already in the team." : "",
  };

  const add = async () => {
    setTried(true);
    if (errors.name || errors.email) return;
    if (live) {
      const mail = email.trim().toLowerCase();
      // The person needs a login first (made by an owner in Supabase → Authentication → Users → Add user).
      const { data: prof, error: pErr } = await db("admin").from("profiles").select("id").ilike("email", mail).maybeSingle();
      if (pErr) { toast(`Could not look up ${mail}: ${pErr.message}`); return; }
      if (!prof) { toast(`No login for ${mail} yet. Create it first in Supabase → Authentication → Users → Add user.`); return; }
      const { error } = await db("admin").from("admin_users").insert({ id: prof.id, email: mail, name: name.trim(), role });
      if (error) { toast(`Could not add: ${error.message}`); return; }
      log(`Added ${name.trim()} (${mail}) to the team as ${ROLE_TEXT[role].toLowerCase()}`, "team");
      toast(`${name.trim()} added. They can sign in with ${mail} and the password set in Supabase.`);
      setName(""); setEmail(""); setRole("support"); setTried(false);
      void load();
      return;
    }
    const member = { id: `t${Date.now().toString(36)}`, name: name.trim(), email: email.trim().toLowerCase(), role, active: true, addedAt: Date.now() };
    update((prev) => ({ team: [...prev.team, member] }));
    log(`Added ${member.name} (${member.email}) to the team as ${ROLE_TEXT[role].toLowerCase()}`, "team");
    toast(`${member.name} added. They can sign in with ${member.email}.`);
    setName(""); setEmail(""); setRole("support"); setTried(false);
  };
  const isMe = (mail: string) => mail.toLowerCase() === state.adminEmail.toLowerCase();
  const changeRole = async (id: string, next: AdminRole) => {
    const m = team.find((x) => x.id === id);
    if (!m) return;
    if (m.role === "owner" && next !== "owner" && activeOwners.length <= 1 && m.active) { toast("Keep at least one owner"); return; }
    if (live) {
      const { error } = await db("admin").from("admin_users").update({ role: next }).eq("id", id);
      if (error) { toast(`Could not change: ${error.message}`); return; }
      log(`Changed ${m.name}'s role: ${ROLE_TEXT[m.role].toLowerCase()} → ${ROLE_TEXT[next].toLowerCase()}`, "team");
      toast(`${m.name} is now ${ROLE_TEXT[next].toLowerCase()}`);
      if (isMe(m.email)) set({ role: next, page: ROLE_PAGES[next].includes("team") ? "team" : "dashboard" });
      void load();
      return;
    }
    const me = isMe(m.email);
    update((prev) => ({
      team: prev.team.map((x) => (x.id === id ? { ...x, role: next } : x)),
      // Changing your own role changes what you can open straight away.
      ...(me ? { role: next, page: ROLE_PAGES[next].includes(prev.page) ? prev.page : "dashboard" } : {}),
    }));
    log(`Changed ${m.name}'s role: ${ROLE_TEXT[m.role].toLowerCase()} → ${ROLE_TEXT[next].toLowerCase()}`, "team");
    toast(`${m.name} is now ${ROLE_TEXT[next].toLowerCase()}`);
  };
  const toggle = async (id: string) => {
    const m = team.find((x) => x.id === id);
    if (!m) return;
    if (m.active && isMe(m.email)) { toast("You cannot switch off your own access"); return; }
    if (m.active && m.role === "owner" && activeOwners.length <= 1) { toast("Keep at least one owner"); return; }
    if (live) {
      const { error } = await db("admin").from("admin_users").update({ active: !m.active }).eq("id", id);
      if (error) { toast(`Could not change: ${error.message}`); return; }
      log(`${m.active ? "Switched off" : "Switched on"} ${m.name}'s access`, "team");
      toast(`${m.name}’s access is ${m.active ? "switched off" : "switched on"}`);
      void load();
      return;
    }
    update((prev) => ({ team: prev.team.map((x) => (x.id === id ? { ...x, active: !x.active } : x)) }));
    log(`${m.active ? "Switched off" : "Switched on"} ${m.name}'s access`, "team");
    toast(`${m.name}’s access is ${m.active ? "switched off" : "switched on"}`);
  };

  return (
    <>
      <PageHead title="Team" sub="Who can use the admin panel, and what each role can open. Only owners see this page." />
      {live ? (
        <div className="anote info adm-small">
          <b>Adding someone takes two steps.</b> 1. In Supabase, open Authentication → Users → Add user → Create new user, enter their email and a password, and tick “Auto confirm user”. 2. Add them here with the same email and a role. They sign in with that email and password, and see only their role’s pages. Switched-off people cannot sign in.
        </div>
      ) : (
        <div className="anote info adm-small">Demo: this is the sample team. Sign in with a real team account to manage the real team.</div>
      )}
      {loadError && <div className="anote danger" role="alert">Could not load the team: {loadError}</div>}

      <section className="acard acard-flat">
        <div className="atable-wrap">
          <table className="atable">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Access</th><th>Added</th><th /></tr></thead>
            <tbody>
              {team.map((m) => (
                <tr key={m.id}>
                  <td className="adm-strong">{m.name}{isMe(m.email) && <> <Badge tone="info">You</Badge></>}</td>
                  <td>{m.email}</td>
                  <td>
                    <label className="afield" htmlFor={`team-role-${m.id}`}>
                      <span className="ainput-label">Role for {m.name}</span>
                      <select id={`team-role-${m.id}`} value={m.role} onChange={(e) => void changeRole(m.id, e.target.value as AdminRole)}>
                        {ROLES.map((r) => <option key={r} value={r}>{ROLE_TEXT[r]}</option>)}
                      </select>
                    </label>
                  </td>
                  <td>{m.active ? <Badge tone="ok">On</Badge> : <Badge tone="danger">Switched off</Badge>}</td>
                  <td className="nowrap">{dateOnly(m.addedAt)}</td>
                  <td><button type="button" className="abtn abtn-sm" onClick={() => void toggle(m.id)}>{m.active ? "Switch off" : "Switch on"}</button></td>
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
          <div><button type="button" className="abtn abtn-primary" onClick={() => void add()}>Add to the team</button></div>
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
