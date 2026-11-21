"use client";

// RECEIPTS (2.0.0). A patient opens a receipt for a past visit (Bookings → Past). It opens as a page that
// can be printed or saved as a PDF from the browser's print screen. It is a payment receipt, not a tax
// invoice (GST invoices wait for the chartered accountant's advice).

import { db } from "./supabase";
import { serviceById } from "./booking";
import { t } from "./i18n";

type Receipt = {
  number: string; kind: string; date: string; visit_date: string; service_id: string; visit_no: number; visits: number;
  patient: string | null; account: string | null; caregiver: string | null; lines: { k: string; amount: number }[]; total: number;
  pay: string; paid_online: number; refunded: number; city_id: string;
};

const LINE: Record<string, string> = {
  service: "Service",
  visit_fee: "Home visit charge",
  urgent_fee: "Urgent visit charge",
  visit_fee_kept: "Home visit charge kept",
};
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const rupees = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const dateText = (iso: string) => { const d = new Date(`${iso}T00:00:00`); return isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }); };

export function receiptHtml(r: Receipt, lang: string) {
  const service = t(serviceById(r.service_id).name) + (r.visits > 1 ? ` · ${t("visit {n} of {total}", { n: r.visit_no, total: r.visits })}` : "");
  const paidHow = r.paid_online > 0 ? t("Paid online") : r.pay === "cash" || r.paid_online === 0 ? t("Paid to the caregiver (cash or UPI)") : t("Paid online");
  const rows = r.lines.map((l) => `<tr><td>${esc(t(LINE[l.k] ?? l.k))}</td><td class="n">${rupees(l.amount)}</td></tr>`).join("");
  const status = r.kind === "completed" ? t("Visit completed") : r.kind === "cancelled" ? t("Cancelled") : t("Visit missed");
  return `<!doctype html><html lang="${esc(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t("Receipt"))} ${esc(r.number)}</title>
<style>
  body{font:15px/1.5 system-ui,-apple-system,"Noto Sans Telugu","Noto Sans Kannada",sans-serif;color:#1b2b26;margin:0;padding:24px;background:#fff}
  .card{max-width:560px;margin:0 auto}
  h1{font-size:22px;margin:0 0 4px} .muted{color:#55665f;font-size:13px}
  table{width:100%;border-collapse:collapse;margin:16px 0} td{padding:8px 0;border-bottom:1px solid #e3e9e6} td.n{text-align:right;font-variant-numeric:tabular-nums}
  tr.total td{font-weight:700;border-bottom:2px solid #1b2b26}
  dl{display:grid;grid-template-columns:auto 1fr;gap:4px 16px;margin:16px 0} dt{color:#55665f} dd{margin:0}
  .note{background:#f2f6f4;border-radius:10px;padding:10px 12px;font-size:13px;margin-top:16px}
  button{font:inherit;padding:10px 16px;border-radius:10px;border:0;background:#0e5c4a;color:#fff;margin-top:16px;cursor:pointer}
  @media print{button{display:none}body{padding:0}}
</style></head><body><div class="card">
  <h1>${esc(t("Receipt"))}</h1>
  <div class="muted">Nurse at Home · ${esc(t("Receipt number"))} ${esc(r.number)} · ${esc(dateText(r.date))}</div>
  <dl>
    <dt>${esc(t("Service"))}</dt><dd>${esc(service)}</dd>
    <dt>${esc(t("Visit date"))}</dt><dd>${esc(dateText(r.visit_date))}</dd>
    <dt>${esc(t("Patient"))}</dt><dd>${esc(r.patient ?? "")}</dd>
    <dt>${esc(t("Booked by"))}</dt><dd>${esc(r.account ?? "")}</dd>
    ${r.caregiver ? `<dt>${esc(t("Caregiver"))}</dt><dd>${esc(r.caregiver)}</dd>` : ""}
    <dt>${esc(t("Status"))}</dt><dd>${esc(status)}</dd>
  </dl>
  <table>${rows}<tr class="total"><td>${esc(t("Total"))}</td><td class="n">${rupees(r.total)}</td></tr>
  ${r.refunded > 0 ? `<tr><td>${esc(t("Refunded"))}</td><td class="n">− ${rupees(r.refunded)}</td></tr>` : ""}</table>
  <div>${esc(paidHow)}</div>
  <div class="note">${esc(t("This is a payment receipt, not a tax invoice."))}</div>
  <button type="button" onclick="window.print()">${esc(t("Print or save as PDF"))}</button>
</div></body></html>`;
}

/** Open the receipt for a past visit (record id) or a cancelled booking (booking id). Opens the window at once (pop-up blockers). */
export async function openReceipt(id: string, lang: string): Promise<boolean> {
  const win = window.open("", "_blank");
  try {
    const { data, error } = await db("patient").rpc("visit_receipt", { p_id: id });
    if (error || !data) throw error ?? new Error("none");
    const html = receiptHtml(data as Receipt, lang);
    if (win) { win.document.open(); win.document.write(html); win.document.close(); }
    else { const url = URL.createObjectURL(new Blob([html], { type: "text/html" })); window.location.assign(url); }
    return true;
  } catch {
    win?.close();
    return false;
  }
}
