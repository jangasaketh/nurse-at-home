// NURSE AT HOME · MAKE THE PUSH KEYS (Supabase Edge Function "push-setup"), version 1.9.1
//
// Makes a new key pair for phone notifications (Web Push, VAPID) inside Supabase and keeps the private key
// in the database Vault (supabase/010_push_keys.sql). The private key never leaves Supabase.
// Called by the admin panel (Settings → Notifications and SMS → Make push keys). An owner can make new keys
// at any time; when no keys exist yet, the first call makes them.
//
// Deploy: name "push-setup", Verify JWT OFF (it checks the sign-in itself). No secrets needed.

type Env = Record<string, string | undefined>;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const b64u = (bytes: Uint8Array) => { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };

export async function handle(req: Request, env: Env): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "POST only" });
  const SUPA = (env.SUPABASE_URL ?? "").replace(/\/$/, "");
  const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SERVICE_ROLE_KEY ?? "";
  const ANON = env.SUPABASE_ANON_KEY ?? SERVICE;
  if (!SUPA || !SERVICE) return json(500, { error: "Missing configuration" });
  const svc: Record<string, string> = { apikey: SERVICE, "Content-Type": "application/json" };
  if (SERVICE.startsWith("eyJ")) svc.Authorization = `Bearer ${SERVICE}`;
  const rpc = async (fn: string, args: unknown, headers = svc) => {
    const r = await fetch(`${SUPA}/rest/v1/rpc/${fn}`, { method: "POST", headers, body: JSON.stringify(args) });
    const t = await r.text();
    if (!r.ok) throw new Error(t);
    return t ? JSON.parse(t) : null;
  };

  // Allowed: an owner (with their two-step code if they set one up), or anyone when no keys exist yet.
  const keys = await rpc("push_keys", {}).catch(() => null) as { private?: string | null } | null;
  const firstTime = !keys?.private;
  if (!firstTime) {
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer /i, "");
    const owner = await rpc("is_admin", { roles: ["owner"] }, { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" }).catch(() => false);
    if (owner !== true) return json(403, { error: "Only an owner can make new push keys" });
  }

  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
  const publicKey = b64u(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)));
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey) as JsonWebKey;
  await rpc("save_push_keys", { p_public: publicKey, p_private: String(jwk.d) });
  return json(200, { publicKey, firstTime });
}

type DenoLike = { serve: (h: (req: Request) => Response | Promise<Response>) => void; env: { toObject: () => Env } };
const runtime = (globalThis as unknown as { Deno?: DenoLike }).Deno;
if (runtime) runtime.serve((req) => handle(req, runtime.env.toObject()));
