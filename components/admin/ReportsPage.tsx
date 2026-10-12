"use client";

// ADMIN: monthly reports. Revenue, what caregivers earned, refunds and a GST summary, with a CSV download.

import { useMemo, useState } from "react";
import { useAdmin } from "@/lib/admin/store";
import {
  cityName, GST_RATE, gstOn, isPaidOut, monthKeyOf, monthLabelOf, money, moneyFor, pastMonthReport, serviceName, type MonthReport,
} from "@/lib/admin/data";
import { Badge, csvRow, downloadText, PageHead, Stat } from "./ui";

const compact = (n: number) => (Math.abs(n) >= 100000 ? `₹${(n / 100000).toFixed(1)}L` : Math.abs(n) >= 1000 ? `₹${(n / 1000).toFixed(1)}k` : `₹${Math.round(n)}`);

export function ReportsPage() {
  const { view, state, nowMs } = useAdmin();
  const s = state.settings;

  const reports = useMemo<MonthReport[]>(() => {
    // This month: from the sample bookings (they cover the last 7 days only) and refunds decided here.
    const key = monthKeyOf(nowMs);
    const inMonth = view.bookings.filter((b) => monthKeyOf(b.at) === key && b.at < nowMs && isPaidOut(b.status));
    const lines = inMonth.map((b) => ({ b, m: moneyFor(b, s) }));
    const gross = lines.reduce((a, x) => a + x.m.patientPays, 0);
    const caregiverPay = lines.reduce((a, x) => a + x.m.caregiverGets, 0);
    const refunds = view.refunds.filter((r) => r.decision?.status === "approved" && monthKeyOf(r.decision.at) === key).reduce((a, r) => a + (r.decision?.amount ?? 0), 0);
    const ids = [...new Set(inMonth.map((b) => b.caregiverId))];
    const current: MonthReport = {
      key, label: monthLabelOf(key), partial: true,
      visits: inMonth.filter((b) => b.status === "completed").length,
      gross, caregiverPay, platform: gross - caregiverPay, refunds,
      byCity: s.cities.map((c) => {
        const l = lines.filter((x) => x.b.cityId === c.id);
        return { cityId: c.id, visits: l.filter((x) => x.b.status === "completed").length, gross: l.reduce((a, x) => a + x.m.patientPays, 0), platform: l.reduce((a, x) => a + x.m.platformKeeps, 0) };
      }),
      byService: s.services.map((sv) => {
        const l = lines.filter((x) => x.b.serviceId === sv.id);
        return { serviceId: sv.id, visits: l.filter((x) => x.b.status === "completed").length, gross: l.reduce((a, x) => a + x.m.patientPays, 0) };
      }),
      byCaregiver: ids.map((id) => {
        const m = view.memberById(id);
        const l = lines.filter((x) => x.b.caregiverId === id);
        return {
          id, name: m?.name ?? id, cityId: m?.cityId ?? "", visits: l.filter((x) => x.b.status === "completed").length,
          earned: l.reduce((a, x) => a + x.m.caregiverGets, 0),
          cash: l.filter((x) => x.b.pay === "cash" && x.b.status === "completed").reduce((a, x) => a + x.m.patientPays, 0),
        };
      }),
    };
    return [current, ...[1, 2, 3, 4, 5].map((n) => pastMonthReport(n, view.members, s, nowMs))];
  }, [view, s, nowMs]);

  const [key, setKey] = useState(reports[0].key);
  const r = reports.find((x) => x.key === key) ?? reports[0];
  const net = r.platform - r.refunds;
  const gst = gstOn(Math.max(0, net));
  const maxNet = Math.max(...reports.map((x) => x.platform - x.refunds), 1);
  const caregivers = [...r.byCaregiver].filter((x) => x.visits > 0 || x.earned > 0).sort((a, b) => b.earned - a.earned);

  const download = () => {
    const rows: string[] = [
      csvRow([`Nurse at Home report: ${r.label}${r.partial ? " (so far)" : ""}`]),
      "",
      csvRow(["Summary", "Amount (Rs)"]),
      csvRow(["Visits completed", r.visits]),
      csvRow(["Patients paid", r.gross]),
      csvRow(["Caregivers earned", r.caregiverPay]),
      csvRow(["We kept, before refunds", r.platform]),
      csvRow(["Refunds given", r.refunds]),
      csvRow(["Net income", net]),
      "",
      csvRow([`GST summary (placeholder: ${GST_RATE}% on our income, confirm with a chartered accountant)`, "Amount (Rs)"]),
      csvRow(["Taxable value", gst.taxable]),
      csvRow(["CGST", gst.cgst]),
      csvRow(["SGST", gst.sgst]),
      csvRow(["Total GST", gst.gst]),
      "",
      csvRow(["City", "Visits", "Patients paid (Rs)", "We kept (Rs)"]),
      ...r.byCity.map((c) => csvRow([cityName(c.cityId), c.visits, c.gross, c.platform])),
      "",
      csvRow(["Service", "Visits", "Patients paid (Rs)"]),
      ...r.byService.map((x) => csvRow([serviceName(x.serviceId), x.visits, x.gross])),
      "",
      csvRow(["Caregiver", "City", "Visits", "Earned (Rs)", "Cash collected (Rs)"]),
      ...caregivers.map((x) => csvRow([x.name, cityName(x.cityId), x.visits, x.earned, x.cash])),
    ];
    downloadText(`report-${r.key}.csv`, rows.join("\r\n"));
  };

  return (
    <>
      <PageHead title="Reports" sub="Money in and out each month: what patients paid, what caregivers earned, what we kept, refunds and GST."
        actions={<button type="button" className="abtn abtn-primary" onClick={download}>Download {r.label} (CSV)</button>} />

      <div className="adm-row" role="group" aria-label="Month" style={{ gap: 6 }}>
        {reports.map((x) => (
          <button key={x.key} type="button" className={`abtn abtn-sm ${x.key === r.key ? "abtn-primary" : ""}`} aria-pressed={x.key === r.key} onClick={() => setKey(x.key)}>
            {x.label}{x.partial ? " (so far)" : ""}
          </button>
        ))}
      </div>
      <div className="anote info adm-small">
        {r.partial
          ? "This month is worked out from the sample bookings, which cover only the last 7 days, and from refunds approved here. With the server it covers every booking."
          : "Earlier months are sample totals, so the page shows how reports will look."}
      </div>

      <div className="agrid agrid-4">
        <Stat label="Patients paid" value={money(r.gross)} sub={`${r.visits} visits completed`} />
        <Stat label="Caregivers earned" value={money(r.caregiverPay)} sub={`${r.gross ? Math.round((r.caregiverPay / r.gross) * 100) : 0}% of what patients paid`} />
        <Stat label="Refunds" value={money(r.refunds)} sub="Given back to patients" />
        <Stat label="Net income" value={money(net)} sub={`What we kept (${money(r.platform)}) minus refunds`} />
      </div>

      <div className="agrid agrid-2">
        <section className="acard">
          <div className="acard-head"><h2>Net income by month</h2><span className="adm-small adm-muted">Last 6 months</span></div>
          <div className="abars" role="img" aria-label={`Net income: ${[...reports].reverse().map((x) => `${x.label} ${money(x.platform - x.refunds)}`).join(", ")}`}>
            {[...reports].reverse().map((x) => {
              const v = x.platform - x.refunds;
              return (
                <div className="abar" key={x.key}>
                  <span className="abar-val">{compact(v)}</span>
                  <span className="abar-track"><span className={`abar-fill ${x.key === r.key ? "today" : ""}`} style={{ height: `${Math.max(2, (v / maxNet) * 100)}%` }} /></span>
                  <span className="abar-lab">{x.label.slice(0, 3)}{x.partial ? "*" : ""}</span>
                </div>
              );
            })}
          </div>
          <span className="adm-small adm-muted">* so far this month</span>
        </section>

        <section className="acard">
          <div className="acard-head"><h2>GST summary</h2><Badge tone="warn">Placeholder</Badge></div>
          <dl className="akv">
            <dt>Our income (incl. GST)</dt><dd className="adm-mono">{money(Math.max(0, net))}</dd>
            <dt>Taxable value</dt><dd className="adm-mono">{money(gst.taxable)}</dd>
            <dt>CGST ({GST_RATE / 2}%)</dt><dd className="adm-mono">{money(gst.cgst)}</dd>
            <dt>SGST ({GST_RATE / 2}%)</dt><dd className="adm-mono">{money(gst.sgst)}</dd>
            <dt>Total GST</dt><dd className="adm-mono adm-strong">{money(gst.gst)}</dd>
          </dl>
          <p className="adm-small adm-muted">Worked out as {GST_RATE}% included in what we keep (our commission), split as CGST and SGST. Caregivers’ share is not counted. A chartered accountant must confirm the rate, whether IGST applies across states, and TDS on caregiver payouts before this is used for filing.</p>
        </section>
      </div>

      <div className="agrid agrid-2" style={{ alignItems: "start" }}>
        <section className="acard acard-flat">
          <div className="acard-head" style={{ padding: "16px 18px 6px" }}><h2>By city</h2></div>
          <div className="atable-wrap">
            <table className="atable">
              <thead><tr><th>City</th><th className="num">Visits</th><th className="num">Patients paid</th><th className="num">We kept</th></tr></thead>
              <tbody>{r.byCity.map((c) => <tr key={c.cityId}><td>{cityName(c.cityId)}</td><td className="num">{c.visits}</td><td className="num">{money(c.gross)}</td><td className="num">{money(c.platform)}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
        <section className="acard acard-flat">
          <div className="acard-head" style={{ padding: "16px 18px 6px" }}><h2>By service</h2></div>
          <div className="atable-wrap">
            <table className="atable">
              <thead><tr><th>Service</th><th className="num">Visits</th><th className="num">Patients paid</th></tr></thead>
              <tbody>{r.byService.map((x) => <tr key={x.serviceId}><td>{serviceName(x.serviceId)}</td><td className="num">{x.visits}</td><td className="num">{money(x.gross)}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="acard acard-flat">
        <div className="acard-head" style={{ padding: "16px 18px 6px" }}><h2>What caregivers earned</h2><span className="adm-small adm-muted">{caregivers.length} caregivers</span></div>
        <div className="atable-wrap">
          <table className="atable">
            <thead><tr><th>Caregiver</th><th>City</th><th className="num">Visits</th><th className="num">Earned</th><th className="num">Cash collected</th></tr></thead>
            <tbody>{caregivers.map((x) => <tr key={x.id}><td className="adm-strong">{x.name}</td><td>{cityName(x.cityId)}</td><td className="num">{x.visits}</td><td className="num">{money(x.earned)}</td><td className="num">{x.cash ? money(x.cash) : "—"}</td></tr>)}</tbody>
            <tfoot><tr><td colSpan={2}>Total</td><td className="num">{caregivers.reduce((a, x) => a + x.visits, 0)}</td><td className="num">{money(caregivers.reduce((a, x) => a + x.earned, 0))}</td><td className="num">{money(caregivers.reduce((a, x) => a + x.cash, 0))}</td></tr></tfoot>
          </table>
        </div>
      </section>
    </>
  );
}
