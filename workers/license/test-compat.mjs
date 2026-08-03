// Compatibility proof: keys minted by worker.js validate with the app's exact
// logic (license.ts validateLicense), using a throwaway keypair.
import { webcrypto as wc } from 'node:crypto';
globalThis.crypto ??= wc;
import { generateKeyPairSync } from 'node:crypto';
import { mintLicense, verifyPaddleSignature } from './worker.js';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
const jwk = publicKey.export({ format: 'jwk' });

// — the app's validateLicense, verbatim semantics (license.ts) —
const b64urlToBytes = (s) => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
};
async function validateLicense(key, now, pubJwk) {
  const parts = key.trim().split('.');
  if (parts.length !== 3 || parts[0] !== 'FSK1') return { ok: false, reason: 'format' };
  const payloadBytes = b64urlToBytes(parts[1]), sigBytes = b64urlToBytes(parts[2]);
  const pub = await crypto.subtle.importKey('jwk', pubJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  if (!(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, sigBytes, payloadBytes)))
    return { ok: false, reason: 'sig' };
  const info = JSON.parse(new TextDecoder().decode(payloadBytes));
  if (info.plan !== 'pro' && info.plan !== 'enterprise') return { ok: false, reason: 'plan' };
  if (typeof info.exp === 'number' && now > info.exp) return { ok: false, reason: 'expired' };
  return { ok: true, info };
}

let pass = 0, fail = 0;
const t = (name, cond) => { cond ? pass++ : (fail++, console.error('FAIL:', name)); };

const key = await mintLicense(pem, 'buyer@example.com', 'pro', 365);
const r1 = await validateLicense(key, Date.now(), jwk);
t('annual pro key validates', r1.ok && r1.info.email === 'buyer@example.com' && r1.info.plan === 'pro');
t('expiry ~365d out', r1.ok && Math.abs(r1.info.exp - r1.info.iat - 365 * 86400000) < 1000);

const perp = await mintLicense(pem, 'x@y.z', 'enterprise', 0);
const r2 = await validateLicense(perp, Date.now() + 10 * 365 * 86400000, jwk);
t('perpetual key has no expiry', r2.ok && r2.info.exp === undefined);

const r3 = await validateLicense(key, Date.now() + 366 * 86400000, jwk);
t('expired key rejected', !r3.ok && r3.reason === 'expired');

const tampered = key.slice(0, -4) + 'AAAA';
t('tampered key rejected', !(await validateLicense(tampered, Date.now(), jwk)).ok);

// — Paddle signature verification —
const secret = 'whsec_test';
const body = '{"event_type":"transaction.completed"}';
const ts = Math.floor(Date.now() / 1000);
const mac = Buffer.from(await crypto.subtle.sign('HMAC',
  await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']),
  new TextEncoder().encode(`${ts}:${body}`))).toString('hex');
t('valid paddle sig accepted', await verifyPaddleSignature(`ts=${ts};h1=${mac}`, body, secret));
t('wrong secret rejected', !(await verifyPaddleSignature(`ts=${ts};h1=${mac}`, body, 'other')));
t('replayed sig rejected', !(await verifyPaddleSignature(`ts=${ts - 999};h1=${mac}`, body, secret, ts)));

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
