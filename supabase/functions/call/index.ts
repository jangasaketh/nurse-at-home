// NURSE AT HOME · PRIVATE CALLS (Supabase Edge Function "call"), version 1.7.0
//
// The patient and the caregiver of a visit call each other without seeing each other's number. The app asks
// this program to connect them; Exotel (an Indian calling service) first rings the person who tapped "Call",
// then connects them to the other person. Both see only our Exotel number (the "ExoPhone").
//
//   { booking }   → { ok: true }      the app shows "We are calling you now"
//
// Allowed only for the patient and the assigned caregiver, from acceptance until care is finished, at most
// 10 calls per visit (database function call_parties in supabase/007_maps_calls.sql). Every call is logged.
//
// How to put it live: Supabase → Edge Functions → Deploy a new function → Via editor, name it "call", paste this
// file, deploy, and switch OFF "Verify JWT" (this program checks the sign-in itself). Secrets:
//   EXOTEL_SID, EXOTEL_API_KEY, EXOTEL_API_TOKEN   (Exotel → Settings → API settings)
//   EXOTEL_CALLER_ID                               (your ExoPhone, the number both people see)
//   EXOTEL_SUBDOMAIN                               (api.exotel.com for Singapore accounts, api.in.exotel.com for Mumbai)
// Until these are set, the apps say private calls are coming soon and offer the support number.

type Env = Record<string, string | undefined>;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
/** "919876543210" or "+919876543210" → "+919876543210" */
const e164 = (phone: string) => { const d = (phone ?? "").replace(/\D/g, ""); return d.length === 10 ? `+91${d}` : `+${d}`; };

export async function handle(req: Request, env: Env): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "POST only" });
  const SUPA = (env.SUPABASE_URL ?? "").replace(/\/$/, "");
  const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SERVICE_ROLE_KEY ?? "";
  if (!SUPA || !SERVICE) return json(500, { error: "The function is missing SUPABASE_URL or the service key." });

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer /i, "");
  const who = await fetch(`${SUPA}/auth/v1/user`, { headers: { apikey: env.SUPABASE_ANON_KEY ?? SERVICE, Authorization: `Bearer ${token}` } });
  if (!who.ok) return json(401, { error: "Sign in first" });
  const user = (await who.json()) as { id: string };

  const { EXOTEL_SID: sid, EXOTEL_API_KEY: key, EXOTEL_API_TOKEN: secret, EXOTEL_CALLER_ID: callerId } = env;
  if (!sid || !key || !secret || !callerId) return json(503, { error: "Private calls are not set up yet." });

  let booking = "";
  try { booking = String((await req.json()).booking ?? ""); } catch { return json(400, { error: "Bad request" }); }
  if (!/^[0-9a-f-]{36}$/i.test(booking)) return json(400, { error: "Bad request" });

  const dbHeaders: Record<string, string> = { apikey: SERVICE, "Content-Type": "application/json" };
  if (SERVICE.startsWith("eyJ")) dbHeaders.Authorization = `Bearer ${SERVICE}`;
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const r = await fetch(`${SUPA}/rest/v1/rpc/${fn}`, { method: "POST", headers: dbHeaders, body: JSON.stringify(args) });
    const text = await r.text();
    const data = text ? JSON.parse(text) : null;
    if (!r.ok) throw new Error((data && (data.message || data.error)) || `Database error ${r.status}`);
    return data;
  };

  let parties: { from: string; to: string; callee: string };
  try { parties = await rpc("call_parties", { p_booking: booking, p_caller: user.id }); }
  catch (e) { return json(403, { error: (e as Error).message }); }
  if (!parties?.from || !parties?.to) return json(409, { error: "A phone number is missing for this visit." });

  const host = (env.EXOTEL_SUBDOMAIN ?? "api.exotel.com").replace(/^https?:\/\//, "").replace(/\/$/, "");
  const base = env.EXOTEL_API ?? `https://${host}`;
  const form = new URLSearchParams({ From: e164(parties.from), To: e164(parties.to), CallerId: callerId, TimeLimit: "900", Record: "false" });
  const r = await fetch(`${base}/v1/Accounts/${encodeURIComponent(sid)}/Calls/connect.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`${key}:${secret}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const out = await r.json().catch(() => ({})) as { Call?: { Sid?: string; Status?: string }; RestException?: { Message?: string } };
  await rpc("call_placed", { p_booking: booking, p_caller: user.id, p_callee: parties.callee, p_ref: out?.Call?.Sid ?? null, p_status: r.ok ? (out?.Call?.Status ?? "queued") : "failed" }).catch(() => {});
  if (!r.ok) return json(502, { error: out?.RestException?.Message ?? `The call could not be placed (${r.status}).` });
  return json(200, { ok: true });
}

type DenoLike = { serve: (h: (req: Request) => Response | Promise<Response>) => void; env: { toObject: () => Env } };
const runtime = (globalThis as unknown as { Deno?: DenoLike }).Deno;
if (runtime) runtime.serve((req) => handle(req, runtime.env.toObject()));
