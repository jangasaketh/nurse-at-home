// NURSE AT HOME · PUSH SERVER PROGRAM (Supabase Edge Function "push"), version 1.6.0
//
// Sends each new notification to the person's phones (Web Push), so it rings even when the app is closed.
// Called by a Database Webhook on new rows in public.notifications (set up once in the dashboard; see
// supabase/README.md). It reads the notification itself from the database and sends it only once, so
// calling it again or with made-up data does nothing.
//
// How to put it live: Supabase → Edge Functions → Deploy a new function → Via editor, name it "push",
// paste this file, deploy. Switch OFF "Verify JWT" (safe: it only sends notifications that already exist,
// each once, to their own person; so the database webhook works with any key type). Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (made in the
// admin panel: Settings → Notifications → Make push keys) and VAPID_SUBJECT (mailto:your-support-email).

type Env = Record<string, string | undefined>;

const enc = new TextEncoder();
const b64u = {
  encode(bytes: Uint8Array) {
    let s = "";
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  },
  decode(text: string) {
    const s = atob(text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4));
    return Uint8Array.from(s, (c) => c.charCodeAt(0));
  },
};
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) { out.set(p, i); i += p.length; }
  return out;
};
async function hmac(key: Uint8Array, data: Uint8Array) {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}

/** The VAPID signature that tells the push service the message comes from us (RFC 8292). */
export async function vapidHeader(endpoint: string, publicKey: string, privateKey: string, subject: string) {
  const pub = b64u.decode(publicKey); // 65 bytes: 0x04 || x || y
  const key = await crypto.subtle.importKey("jwk", {
    kty: "EC", crv: "P-256", d: privateKey, x: b64u.encode(pub.slice(1, 33)), y: b64u.encode(pub.slice(33, 65)), ext: true,
  }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const head = b64u.encode(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64u.encode(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${head}.${body}`)));
  return `vapid t=${head}.${body}.${b64u.encode(sig)}, k=${publicKey}`;
}

/** Encrypt a message for one phone (RFC 8291, aes128gcm). */
export async function encryptPayload(p256dh: string, auth: string, payload: string) {
  const uaPublic = b64u.decode(p256dh);
  const authSecret = b64u.decode(auth);
  const pair = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, pair.privateKey, 256));
  const prkKey = await hmac(authSecret, shared);
  const ikm = await hmac(prkKey, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic, new Uint8Array([1])));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(enc.encode("Content-Encoding: aes128gcm\0"), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode("Content-Encoding: nonce\0"), new Uint8Array([1])))).slice(0, 12);
  const key = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, concat(enc.encode(payload), new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]); // record size 4096
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher);
}

export async function handle(req: Request, env: Env): Promise<Response> {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  const SUPA = (env.SUPABASE_URL ?? "").replace(/\/$/, "");
  const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SERVICE_ROLE_KEY ?? "";
  const pub = env.VAPID_PUBLIC_KEY ?? "", priv = env.VAPID_PRIVATE_KEY ?? "", subject = env.VAPID_SUBJECT ?? "mailto:support@example.com";
  if (!SUPA || !SERVICE || !pub || !priv) return new Response(JSON.stringify({ error: "Push is not set up yet" }), { status: 503 });
  const headers: Record<string, string> = { apikey: SERVICE, "Content-Type": "application/json" };
  if (SERVICE.startsWith("eyJ")) headers.Authorization = `Bearer ${SERVICE}`;
  const rpc = async (fn: string, args: unknown) => {
    const r = await fetch(`${SUPA}/rest/v1/rpc/${fn}`, { method: "POST", headers, body: JSON.stringify(args) });
    const t = await r.text();
    if (!r.ok) throw new Error(t);
    return t ? JSON.parse(t) : null;
  };

  const event = await req.json().catch(() => ({}));
  const id = event?.record?.id ?? event?.id;
  if (!id) return new Response(JSON.stringify({ skipped: "no id" }), { status: 200 });
  const n = await rpc("push_take", { p_notification: id });
  if (!n) return new Response(JSON.stringify({ skipped: "already sent or too old" }), { status: 200 });

  const ok: string[] = [], gone: string[] = [];
  await Promise.all((n.subscriptions as { id: string; app: string; endpoint: string; p256dh: string; auth: string; lang: string }[]).map(async (s) => {
    try {
      const payload = JSON.stringify({ title: n.title, body: n.body, target: n.target, kind: n.kind, app: s.app, lang: s.lang, id: n.id });
      const body = await encryptPayload(s.p256dh, s.auth, payload);
      const r = await fetch(s.endpoint, {
        method: "POST",
        headers: {
          Authorization: await vapidHeader(s.endpoint, pub, priv, subject), "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream",
          TTL: "86400", Urgency: n.kind === "request" ? "high" : "normal",
        },
        body,
      });
      if (r.status === 404 || r.status === 410) gone.push(s.id); // the phone unsubscribed
      else if (r.ok) ok.push(s.id);
    } catch { /* one phone failing does not stop the others */ }
  }));
  await rpc("push_done", { p_ok: ok, p_gone: gone }).catch(() => {});
  return new Response(JSON.stringify({ sent: ok.length, removed: gone.length }), { status: 200, headers: { "Content-Type": "application/json" } });
}

type DenoLike = { serve: (h: (req: Request) => Response | Promise<Response>) => void; env: { toObject: () => Env } };
const runtime = (globalThis as unknown as { Deno?: DenoLike }).Deno;
if (runtime) runtime.serve((req) => handle(req, runtime.env.toObject()));
