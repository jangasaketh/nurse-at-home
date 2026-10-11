"use client";

// ADMIN: every decision made in this panel, newest first. With the server, this also records who made it.

import { useState } from "react";
import { useAdmin } from "@/lib/admin/store";
import { dateTime, type AdminPage } from "@/lib/admin/data";
import { Badge, Empty, PageHead, Select, csvRow, downloadText, useToast } from "./ui";

const PAGE_NAMES: Partial<Record<AdminPage, string>> = {
  verification: "Verification", caregivers: "Caregivers", bookings: "Bookings", refunds: "Refunds", support: "Support", payouts: "Payouts", settings: "Settings",
};

export function ActivityPage() {
  const { state, resetDemo, log } = useAdmin();
  const toast = useToast();
  const [page, setPage] = useState("all");
  const [confirm, setConfirm] = useState(false);
  const rows = state.activity.filter((a) => page === "all" || a.page === page);

  const download = () => {
    downloadText("admin-activity.csv", [csvRow(["When", "Section", "What", "Who"]), ...state.activity.map((a) => csvRow([dateTime(a.at), PAGE_NAMES[a.page] ?? a.page, a.text, state.adminName]))].join("\r\n"));
  };

  return (
    <>
      <PageHead title="Activity log" sub="Every decision made in this panel. Kept for audits and disputes."
        actions={<button type="button" className="abtn" onClick={download} disabled={state.activity.length === 0}>Download (CSV)</button>} />
      <div className="afilters">
        <Select id="ac-page" label="Section" value={page} onChange={setPage} options={[{ value: "all", label: "All sections" }, ...Object.entries(PAGE_NAMES).map(([value, label]) => ({ value, label: label! }))]} />
      </div>
      <section className="acard acard-flat">
        {rows.length === 0 ? <Empty title="Nothing yet" body="Approvals, refunds, replies, payouts and settings changes are listed here." /> : (
          <div className="atable-wrap">
            <table className="atable">
              <thead><tr><th>When</th><th>Section</th><th>What</th><th>Who</th></tr></thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id}><td className="nowrap">{dateTime(a.at)}</td><td><Badge>{PAGE_NAMES[a.page] ?? a.page}</Badge></td><td>{a.text}</td><td className="nowrap">{state.adminName}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="acard">
        <h2>Prototype: start the sample data again</h2>
        <p className="adm-small adm-muted">Clears every decision made here (approvals, refunds, replies, payouts, settings) and puts back the built-in prices. The caregiver app is not changed.</p>
        {confirm ? (
          <div className="adm-row">
            <button type="button" className="abtn abtn-danger" onClick={() => { resetDemo(); log("Started the sample data again", "settings"); setConfirm(false); toast("Sample data started again"); }}>Yes, clear everything</button>
            <button type="button" className="abtn" onClick={() => setConfirm(false)}>Keep it</button>
          </div>
        ) : <div><button type="button" className="abtn" onClick={() => setConfirm(true)}>Start the sample data again…</button></div>}
      </section>
    </>
  );
}
