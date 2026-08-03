// ForkScape license fulfillment — Cloudflare Worker.
//
// Paddle (merchant of record) takes the payment; this Worker turns the payment
// into an offline license key, automatically:
//
//   Paddle webhook (transaction.completed)
//     → verify Paddle-Signature (HMAC-SHA256, 5-min replay window)
//     → mint FSK1.<payload>.<sig>  (ECDSA P-256/SHA-256 — exactly what the
//       app's validateLicense() verifies against the baked-in public key)
//     → store under the transaction id in KV
//   Thank-you page then fetches GET /license?txn=… and shows the key.
//
// Secrets (wrangler secret put …): LICENSE_SIGNING_KEY_PEM  (the pkcs8 pem
// from business-docs/ — the ONE copy of it outside your backup),
// PADDLE_WEBHOOK_SECRET, and optionally PADDLE_API_KEY (only needed when a
// checkout doesn't carry custom_data.email). Vars: PLAN_BY_PRICE (JSON map
// price-id → plan), LICENSE_DAYS (default 365; "0" = perpetual).
// Binding: LICENSES (KV).

const te = new TextEncoder();

const b64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function importSigningKey(pem) {
  const b64 = pem.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

/** Mint a key the app will accept. Payload field order matches license-admin. */
export async function mintLicense(pem, email, plan, days) {
  const payload = { email, plan, iat: Date.now() };
  if (days > 0) payload.exp = payload.iat + days * 86400000;
  const bytes = te.encode(JSON.stringify(payload));
  const key = await importSigningKey(pem);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, bytes);
  return `FSK1.${b64url(bytes)}.${b64url(sig)}`;
}

/** Paddle-Signature: "ts=<unix>;h1=<hex hmac of `${ts}:${rawBody}`>". */
export async function verifyPaddleSignature(header, rawBody, secret, nowSec = Math.floor(Date.now() / 1000)) {
  const m = /ts=(\d+);h1=([0-9a-f]+)/.exec(header ?? '');
  if (!m) return false;
  const [, ts, h1] = m;
  if (Math.abs(nowSec - Number(ts)) > 300) return false; // replay window
  const hmacKey = await crypto.subtle.importKey('raw', te.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', hmacKey, te.encode(`${ts}:${rawBody}`)));
  const expect = [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
  if (expect.length !== h1.length) return false;
  let diff = 0; // constant-time compare
  for (let i = 0; i < expect.length; i++) diff |= expect.charCodeAt(i) ^ h1.charCodeAt(i);
  return diff === 0;
}

async function paddleCustomerEmail(customerId, apiKey) {
  if (!customerId || !apiKey) return null;
  const r = await fetch(`https://api.paddle.com/customers/${customerId}`, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  if (!r.ok) return null;
  return (await r.json())?.data?.email ?? null;
}

const CORS = {
  'access-control-allow-origin': 'https://forkscape.com',
  'access-control-allow-methods': 'GET',
};
const json = (obj, status = 200, extra = {}) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...CORS, ...extra },
  });

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (url.pathname === '/health') return json({ ok: true });

    // The thank-you page polls this until the webhook has landed.
    if (url.pathname === '/license' && req.method === 'GET') {
      const txn = url.searchParams.get('txn') ?? '';
      if (!/^txn_[a-z0-9]+$/i.test(txn)) return json({ error: 'bad txn id' }, 400);
      const rec = await env.LICENSES.get(`txn:${txn}`);
      return rec ? json(JSON.parse(rec)) : json({ pending: true }, 202);
    }

    if (url.pathname === '/paddle/webhook' && req.method === 'POST') {
      const raw = await req.text();
      const ok = await verifyPaddleSignature(req.headers.get('paddle-signature'), raw, env.PADDLE_WEBHOOK_SECRET);
      if (!ok) return json({ error: 'bad signature' }, 401);

      const evt = JSON.parse(raw);
      if (evt.event_type !== 'transaction.completed') return json({ ignored: evt.event_type });
      const data = evt.data ?? {};

      const email =
        data.custom_data?.email ??
        (await paddleCustomerEmail(data.customer_id, env.PADDLE_API_KEY));
      if (!email) {
        // Refuse to mint an anonymous key — the payload requires the buyer's
        // email (it is shown in the app). 200 so Paddle stops retrying; the
        // record marks what happened for manual follow-up.
        await env.LICENSES.put(`txn:${data.id}`, JSON.stringify({ error: 'no email on transaction' }),
          { expirationTtl: 60 * 60 * 24 * 30 });
        return json({ error: 'no email; stored for manual follow-up' });
      }

      const priceId = data.items?.[0]?.price?.id ?? '';
      const planMap = env.PLAN_BY_PRICE ? JSON.parse(env.PLAN_BY_PRICE) : {};
      const plan = planMap[priceId] ?? 'pro';
      const days = Number(env.LICENSE_DAYS ?? '365');

      const key = await mintLicense(env.LICENSE_SIGNING_KEY_PEM, email, plan, days);
      await env.LICENSES.put(`txn:${data.id}`, JSON.stringify({ key, email, plan }),
        { expirationTtl: 60 * 60 * 24 * 365 });
      return json({ minted: true });
    }

    return json({ error: 'not found' }, 404);
  },
};
