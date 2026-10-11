// Screen text in English, Telugu and Kannada.
//
// How it works: every piece of text is written in English inside t("..."). The English text is the key.
// For Telugu or Kannada, t() looks the key up in lib/i18n/strings-*.ts. If a translation is missing,
// the English text is shown, so nothing ever breaks.
//
// Words in {curly brackets} are filled in at run time: t("Book {name}", { name: "Anjali" }).
//
// To add a language later: add it to LANGS, add a column to the strings files, and add its font in app/layout.tsx.

import { STRINGS } from "./i18n/strings";

export type Lang = "en" | "te" | "kn";

export const LANGS: { id: Lang; label: string }[] = [
  { id: "en", label: "English" },
  { id: "te", label: "తెలుగు" },
  { id: "kn", label: "ಕನ್ನಡ" },
];

const TABLE: Record<"te" | "kn", Map<string, string>> = { te: new Map(), kn: new Map() };
for (const [en, te, kn] of STRINGS) {
  TABLE.te.set(en, te);
  TABLE.kn.set(en, kn);
}

// The language in use. The app state sets it on every render (see lib/store.tsx).
let current: Lang = "en";
export const setLang = (lang: Lang) => { current = lang; };
export const getLang = () => current;

// Keys asked for but not translated. Visible in the browser console as window.__i18nMissing.
const missing = new Set<string>();

// Testing aid: when a test sets window.__i18nCollect, every text asked for is recorded (in any language),
// so a test run can list all texts used on screen and check each has a translation. Off for real users.
type CollectWindow = { __i18nCollect?: boolean; __i18nSeen?: string[]; __i18nReport?: (text: string) => void };
const seen = new Set<string>();
function collect(text: string) {
  if (typeof window === "undefined") return;
  const w = window as unknown as CollectWindow;
  if (!w.__i18nCollect || seen.has(text)) return;
  seen.add(text);
  w.__i18nSeen = Array.from(seen);
  w.__i18nReport?.(text);
}

export function t(text: string, vars?: Record<string, string | number>) {
  collect(text);
  let out = text;
  if (current !== "en" && text) {
    const hit = TABLE[current].get(text);
    if (hit) {
      out = hit;
    } else if (!missing.has(text)) {
      missing.add(text);
      if (typeof window !== "undefined") (window as unknown as { __i18nMissing: string[] }).__i18nMissing = Array.from(missing);
    }
  }
  if (vars) out = out.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match));
  return out;
}
