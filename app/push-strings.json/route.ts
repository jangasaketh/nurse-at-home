// The words a phone notification may contain, in Telugu and Kannada, for the service worker (public/sw.js).
// Built once with the site (a plain JSON file, /push-strings.json). A notification arrives as a key and values
// ({"k": "{name} is on the way", "v": {"name": "Anjali"}}); the service worker shows it in the phone's language.
// The keys are read from the database files (msg('...') and msgv('...')), plus the service names.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { STRINGS } from "@/lib/i18n/strings";
import { BUILT_IN_SERVICES } from "@/lib/data";

export const dynamic = "force-static";

export function GET() {
  const dir = join(process.cwd(), "supabase");
  const keys = new Set<string>(BUILT_IN_SERVICES.map((s) => s.name));
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".sql"))) {
    const sql = readFileSync(join(dir, f), "utf8");
    for (const m of sql.matchAll(/msgv?\('((?:[^']|'')+)'/g)) keys.add(m[1].replace(/''/g, "'"));
    for (const m of sql.matchAll(/"k"\s*:\s*"([^"]+)"/g)) keys.add(m[1]);
  }
  const out: Record<string, [string, string]> = {};
  for (const [en, te, kn] of STRINGS) if (keys.has(en)) out[en] = [te, kn];
  return Response.json(out);
}
