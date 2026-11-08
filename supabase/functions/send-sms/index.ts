// NURSE AT HOME · SIGN-IN CODES BY SMS THROUGH MSG91 (Supabase Edge Function "send-sms"), version 1.6.0
//
// Optional. Supabase can send sign-in codes itself through Twilio, MessageBird, Vonage or Textlocal. In India
// every SMS needs a DLT-registered sender and template; MSG91 is an Indian provider built around DLT, and
// Supabase lets us use it through a "Send SMS hook" that calls this program with each code.
//
// How to put it live:
//   1. MSG91: register the DLT sender ID and an OTP template with a variable for the code (for example
//      "##otp## is your Nurse at Home code. Do not share it."), and create a Flow/OTP template using it.
//   2. Supabase → Edge Functions → Deploy a new function → Via editor, name it "send-sms", paste this file.
//      Switch OFF "Verify JWT" (Supabase signs each call with the hook secret instead).
//   3. Supabase → Authentication → Hooks → Send SMS hook → HTTPS → URL
//      https://<project>.supabase.co/functions/v1/send-sms → Generate secret → Save.
//   4. Secrets (Edge Functions → Secrets): SEND_SMS_HOOK_SECRET (the secret from step 3, starting "v1,whsec_"),
//      MSG91_AUTH_KEY, MSG91_TEMPLATE_ID, and MSG91_OTP_VAR if your template's variable is not called "otp".

type Env = Record<string, string | undefined>;

const b64 = (bytes: Uint8Array) => { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); };
const unb64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

/** Standard Webhooks signature check (the format Supabase hooks use). */
export async function verifyHook(secret: string, id: string, timestamp: string, body: string, signatures: string) {
  const key = unb64(secret.replace(/^v1,/, "").replace(/^whsec_/, ""));
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = b64(new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`${id}.${timestamp}.${body}`))));
  const fresh = Math.abs(Date.now() / 1000 - Number(timestamp)) < 5 * 60;
  return fresh && signatures.split(" ").some((s) => s.split(",")[1] === expected);
}

export async function handle(req: Request, env: Env): Promise<Response> {
  const fail = (status: number, message: string) =>
    new Response(JSON.stringify({ error: { http_code: status, message } }), { status, headers: { "Content-Type": "application/json" } });
  if (req.method !== "POST") return fail(405, "POST only");
  const body = await req.text();
  const ok = await verifyHook(env.SEND_SMS_HOOK_SECRET ?? "", req.headers.get("webhook-id") ?? "", req.headers.get("webhook-timestamp") ?? "0", body,
    req.headers.get("webhook-signature") ?? "").catch(() => false);
  if (!ok) return fail(401, "Bad signature");
  const { user, sms } = JSON.parse(body) as { user?: { phone?: string }; sms?: { otp?: string } };
  const phone = (user?.phone ?? "").replace(/\D/g, "");
  if (!phone || !sms?.otp) return fail(400, "No phone or code");
  const r = await fetch(env.MSG91_URL ?? "https://control.msg91.com/api/v5/flow", {
    method: "POST",
    headers: { authkey: env.MSG91_AUTH_KEY ?? "", "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({ template_id: env.MSG91_TEMPLATE_ID, short_url: "0", recipients: [{ mobiles: phone, [env.MSG91_OTP_VAR ?? "otp"]: sms.otp }] }),
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok || out?.type === "error") return fail(500, `SMS not sent: ${out?.message ?? r.status}`);
  return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
}

type DenoLike = { serve: (h: (req: Request) => Response | Promise<Response>) => void; env: { toObject: () => Env } };
const runtime = (globalThis as unknown as { Deno?: DenoLike }).Deno;
if (runtime) runtime.serve((req) => handle(req, runtime.env.toObject()));
