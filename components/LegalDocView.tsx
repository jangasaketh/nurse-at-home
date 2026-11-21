"use client";

// One policy page (Terms, Privacy, Refunds, Caregiver Terms, Contact), filled with the live settings.
// Used on the public pages at /legal/… and inside the patient and caregiver apps.

import { useEffect, useState } from "react";
import { fillLegal, LEGAL_DEFAULTS, LEGAL_DOCS, LEGAL_UPDATED, loadLegalVars, type LegalId, type LegalVars } from "@/lib/legal";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase";

let cached: Promise<LegalVars> | null = null;
export function useLegalVars() {
  const [v, setV] = useState<LegalVars>(LEGAL_DEFAULTS);
  useEffect(() => { let live = true; cached ??= loadLegalVars(SUPABASE_URL, SUPABASE_KEY); void cached.then((x) => { if (live) setV(x); }); return () => { live = false; }; }, []);
  return v;
}

export function LegalDocView({ id, headingLevel = 1 }: { id: LegalId; headingLevel?: 1 | 2 }) {
  const doc = LEGAL_DOCS.find((d) => d.id === id)!;
  const v = useLegalVars();
  const H = headingLevel === 1 ? "h1" : "h2";
  return (
    <article className="legal-doc">
      <H>{doc.title}</H>
      <p className="legal-meta">Last updated {LEGAL_UPDATED} · Draft, under legal review</p>
      {doc.sections.map((s) => (
        <section key={s.h}>
          <h3>{s.h}</h3>
          {s.p.map((p, i) => <p key={i}>{fillLegal(p, v)}</p>)}
        </section>
      ))}
    </article>
  );
}
