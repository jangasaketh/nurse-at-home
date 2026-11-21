import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegalDocView } from "@/components/LegalDocView";
import { LEGAL_DOCS, type LegalId } from "@/lib/legal";

// Public policy pages: /legal/terms/, /legal/privacy/, /legal/refunds/, /legal/caregivers/, /legal/contact/.
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function generateStaticParams() {
  return LEGAL_DOCS.map((d) => ({ doc: d.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ doc: string }> }): Promise<Metadata> {
  const { doc } = await params;
  const d = LEGAL_DOCS.find((x) => x.id === doc);
  return { title: d ? `${d.title} · Nurse at Home` : "Nurse at Home", description: d?.summary };
}

export default async function Page({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  if (!LEGAL_DOCS.some((d) => d.id === doc)) notFound();
  return (
    <main className="legal-page">
      <nav className="legal-nav" aria-label="Policies">
        <a href={`${BASE}/`} className="legal-brand">Nurse at Home</a>
        {LEGAL_DOCS.map((d) => (
          <a key={d.id} href={`${BASE}/legal/${d.id}/`} aria-current={d.id === doc ? "page" : undefined}>{d.title}</a>
        ))}
      </nav>
      <LegalDocView id={doc as LegalId} />
    </main>
  );
}
