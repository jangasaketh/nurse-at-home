import type { Metadata } from "next";
import { LEGAL_DOCS } from "@/lib/legal";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
export const metadata: Metadata = { title: "Policies · Nurse at Home", description: "Terms, privacy, refunds, caregiver terms and contact details." };

export default function Page() {
  return (
    <main className="legal-page">
      <nav className="legal-nav" aria-label="Policies"><a href={`${BASE}/`} className="legal-brand">Nurse at Home</a></nav>
      <article className="legal-doc">
        <h1>Policies</h1>
        <ul className="legal-list">
          {LEGAL_DOCS.map((d) => (
            <li key={d.id}><a href={`${BASE}/legal/${d.id}/`}>{d.title}</a><span>{d.summary}</span></li>
          ))}
        </ul>
      </article>
    </main>
  );
}
