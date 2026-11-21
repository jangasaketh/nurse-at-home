// NURSE AT HOME · DELETE MY ACCOUNT (Supabase Edge Function "account"), version 1.9.0
//
// The patient or caregiver app calls this when someone deletes their account. It:
//   1. checks the sign-in and that nothing stops the deletion (open visits, money still due),
//   2. deletes the person's own files (prescriptions, documents, report photos) from private storage,
//   3. runs delete_my_account() in the database (supabase/009_accounts.sql), which removes their details.
//
// Deploy: name "account", Verify JWT OFF (it checks the sign-in itself). No secrets needed.

type Env = Record<string, string | undefined>;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

export async function handle(req: Request, env: Env): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "POST only" });
  const SUPA = (env.SUPABASE_URL ?? "").replace(/\/$/, "");
  const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SERVICE_ROLE_KEY ?? "";
  const ANON = env.SUPABASE_ANON_KEY ?? SERVICE;
  if (!SUPA || !SERVICE) return json(500, { error: "Missing configuration" });

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer /i, "");
  const who = await fetch(`${SUPA}/auth/v1/user`, { headers: { apikey: ANON, Authorization: `Bearer ${token}` } });
  if (!who.ok) return json(401, { error: "Sign in first" });
  const user = (await who.json()) as { id: string };

  // As the person: is anything stopping this?
  const asUser = (fn: string) => fetch(`${SUPA}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: "{}" });
  const blockRes = await asUser("account_blocker");
  if (!blockRes.ok) return json(500, { error: "Could not check the account" });
  const blocker = await blockRes.json();
  if (blocker) return json(409, { error: blocker });

  // Their own files, with the service key (storage cannot be emptied from SQL).
  const svc: Record<string, string> = { apikey: SERVICE, "Content-Type": "application/json" };
  if (SERVICE.startsWith("eyJ")) svc.Authorization = `Bearer ${SERVICE}`;
  for (const bucket of ["kyc", "prescriptions", "tickets"]) {
    for (let round = 0; round < 20; round++) {
      const list = await fetch(`${SUPA}/storage/v1/object/list/${bucket}`, { method: "POST", headers: svc, body: JSON.stringify({ prefix: `${user.id}/`, limit: 100 }) });
      if (!list.ok) break;
      const names = ((await list.json()) as { name: string; id: string | null }[]).filter((f) => f.id).map((f) => `${user.id}/${f.name}`);
      if (!names.length) break;
      await fetch(`${SUPA}/storage/v1/object/${bucket}`, { method: "DELETE", headers: svc, body: JSON.stringify({ prefixes: names }) });
    }
  }

  const del = await asUser("delete_my_account");
  if (!del.ok) {
    const e = await del.json().catch(() => ({}));
    return json(409, { error: (e as { message?: string }).message ?? "Could not delete the account" });
  }
  return json(200, { ok: true });
}

type DenoLike = { serve: (h: (req: Request) => Response | Promise<Response>) => void; env: { toObject: () => Env } };
const runtime = (globalThis as unknown as { Deno?: DenoLike }).Deno;
if (runtime) runtime.serve((req) => handle(req, runtime.env.toObject()));
