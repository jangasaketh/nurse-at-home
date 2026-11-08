// NURSE AT HOME · PAYMENTS SERVER PROGRAM (Supabase Edge Function "payments"), version 1.5.0
//
// The only place that knows the Razorpay secret key. The apps call it to:
//   { action: "order",  booking }                          start paying for a booking (returns a Razorpay order)
//   { action: "verify", order_id, payment_id, signature }  after Razorpay Checkout says it is paid
//   { action: "refund", booking }                          send back what the rules (or the team) say is owed
// Razorpay calls it too (the webhook), so a payment counts even if the phone closes before "verify".
//
// How to put it live (no command line needed): Supabase → Edge Functions → Deploy a new function → Via editor,
// name it "payments", paste this whole file, and deploy. Then in the function's settings switch OFF
// "Verify JWT" (this program checks the sign-in itself, and Razorpay's webhook has no sign-in).
// Secrets (Edge Functions → Secrets): RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET.
// Supabase adds SUPABASE_URL and the service key by itself. Never put the secret key in the apps or GitHub.

type Env = Record<string, string | undefined>;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

async function hmacHex(secret: string, text: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
/** Compare without leaking timing. */
function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function handle(req: Request, env: Env): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "POST only" });

  const SUPA = (env.SUPABASE_URL ?? "").replace(/\/$/, "");
  const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SERVICE_ROLE_KEY ?? "";
  const KEY_ID = env.RAZORPAY_KEY_ID ?? "";
  const KEY_SECRET = env.RAZORPAY_KEY_SECRET ?? "";
  const RZP = (env.RAZORPAY_API ?? "https://api.razorpay.com").replace(/\/$/, "");
  if (!SUPA || !SERVICE) return json(500, { error: "The function is missing SUPABASE_URL or the service key." });

  // The database, with full rights (only the functions made for this program are called).
  const dbHeaders: Record<string, string> = { apikey: SERVICE, "Content-Type": "application/json" };
  if (SERVICE.startsWith("eyJ")) dbHeaders.Authorization = `Bearer ${SERVICE}`;
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const r = await fetch(`${SUPA}/rest/v1/rpc/${fn}`, { method: "POST", headers: dbHeaders, body: JSON.stringify(args) });
    const text = await r.text();
    const data = text ? JSON.parse(text) : null;
    if (!r.ok) throw new Error((data && (data.message || data.error)) || `Database error ${r.status}`);
    return data;
  };
  const rzp = async (path: string, body: unknown) => {
    const r = await fetch(`${RZP}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${btoa(`${KEY_ID}:${KEY_SECRET}`)}` },
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error?.description || `Razorpay error ${r.status}`);
    return data;
  };

  const raw = await req.text();

  // ---------- Razorpay webhook (payment.captured, order.paid, payment.failed) ----------
  const webhookSig = req.headers.get("x-razorpay-signature");
  if (webhookSig) {
    const secret = env.RAZORPAY_WEBHOOK_SECRET ?? "";
    if (!secret || !same(await hmacHex(secret, raw), webhookSig)) return json(400, { error: "Bad signature" });
    const event = JSON.parse(raw);
    const p = event?.payload?.payment?.entity;
    try {
      if ((event.event === "payment.captured" || event.event === "order.paid") && p?.order_id) {
        await rpc("payment_confirmed", { p_order: p.order_id, p_payment: p.id, p_amount: Math.floor((p.amount ?? 0) / 100) });
      } else if (event.event === "payment.failed" && p?.order_id) {
        await rpc("payment_failed", { p_order: p.order_id });
      }
    } catch (e) {
      // An order we do not know (for example from another app on the same account): nothing to do.
      return json(200, { ignored: String((e as Error).message) });
    }
    return json(200, { ok: true });
  }

  // ---------- Calls from the apps: who is asking? ----------
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer /i, "");
  const who = await fetch(`${SUPA}/auth/v1/user`, { headers: { apikey: env.SUPABASE_ANON_KEY ?? SERVICE, Authorization: `Bearer ${token}` } });
  if (!who.ok) return json(401, { error: "Sign in first" });
  const user = (await who.json()) as { id: string };
  let body: Record<string, string>;
  try { body = JSON.parse(raw || "{}"); } catch { return json(400, { error: "Bad request" }); }
  if (!KEY_ID || !KEY_SECRET) return json(503, { error: "Online payment is not set up yet." });

  try {
    if (body.action === "order") {
      const q = await rpc("payment_quote", { p_booking: body.booking, p_user: user.id });
      let orderId: string | null = q.order_id;
      if (!orderId) {
        const order = await rzp("/v1/orders", { amount: q.amount * 100, currency: "INR", receipt: q.code, notes: { booking: body.booking, code: q.code } });
        orderId = order.id;
        await rpc("payment_order_saved", { p_booking: body.booking, p_order: orderId, p_amount: q.amount, p_method: body.method ?? "upi" });
      }
      return json(200, { order_id: orderId, amount: q.amount * 100, currency: "INR", key_id: KEY_ID, code: q.code, phone: q.phone ?? "" });
    }

    if (body.action === "verify") {
      const expected = await hmacHex(KEY_SECRET, `${body.order_id}|${body.payment_id}`);
      if (!body.signature || !same(expected, body.signature)) return json(400, { error: "The payment could not be confirmed." });
      const r = await rpc("payment_confirmed", { p_order: body.order_id, p_payment: body.payment_id, p_amount: null });
      return json(200, { ok: true, booking: r.booking });
    }

    if (body.action === "refund") {
      const due = await rpc("refund_due", { p_booking: body.booking, p_user: user.id });
      if (!due.payment_id || due.amount <= 0) return json(200, { refunded: 0 });
      const refund = await rzp(`/v1/payments/${due.payment_id}/refund`, { amount: due.amount * 100, notes: { booking: body.booking, code: due.code } });
      await rpc("refund_saved", { p_booking: body.booking, p_refund: refund.id, p_amount: due.amount, p_by: user.id });
      return json(200, { refunded: due.amount, refund_id: refund.id });
    }

    return json(400, { error: "Unknown action" });
  } catch (e) {
    return json(400, { error: String((e as Error).message) });
  }
}

// Supabase Edge Functions run on Deno.
type DenoLike = { serve: (h: (req: Request) => Response | Promise<Response>) => void; env: { toObject: () => Env } };
const runtime = (globalThis as unknown as { Deno?: DenoLike }).Deno;
if (runtime) runtime.serve((req) => handle(req, runtime.env.toObject()));
