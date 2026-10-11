"use client";

import { LANGS, type Lang } from "@/lib/i18n";

/** English / తెలుగు / ಕನ್ನಡ buttons. Shared by the patient and caregiver apps. */
export function LanguageChips({ value, onChange }: { value: Lang; onChange: (lang: Lang) => void }) {
  return (
    <div className="lang-row" role="group" aria-label="Language / భాష / ಭಾಷೆ">
      {LANGS.map((l) => (
        <button key={l.id} type="button" className="chip" lang={l.id} aria-pressed={value === l.id} onClick={() => onChange(l.id)}>
          {l.label}
        </button>
      ))}
    </div>
  );
}
