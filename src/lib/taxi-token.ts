// HMAC-signed taxi tracking tokens.
//
// Format: `{tripId}.{nonce16hex}.{sig64hex}` where sig = HMAC-SHA256(secret,
// `${tripId}.${nonce}`) — full 256-bit signature. The signed format lets us reject
// invalid tokens with a 404 *without* hitting the DB — neutralizes brute
// force / token enumeration vectors.
//
// Backward compatibility: legacy trips were issued raw UUID v4 tokens. The
// caller is expected to fall back to a DB lookup when verifyTaxiToken
// returns null.
//
// SECURITY: the signing secret derives from NEXTAUTH_SECRET. In production we
// throw at first call if the env var is missing (fail-closed); in dev we warn
// once and use a deterministic fallback so unit tests and local dev keep
// working without env setup. `assertProductionEnv()` (boot-checks) already
// requires NEXTAUTH_SECRET in prod, so this lazy getter is defence in depth —
// it guarantees we never silently sign with `'dev-secret'` on a misconfigured
// production deploy (which would let anyone forge taxi tokens).
import { createHmac, randomBytes } from 'crypto';

let cachedSecret: string | null = null;
let warnedDevFallback = false;

function getSecret(): string {
  if (cachedSecret !== null) return cachedSecret;
  const raw = process.env.NEXTAUTH_SECRET;
  if (raw && raw.length >= 16) {
    cachedSecret = raw;
    return cachedSecret;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('TAXI_TOKEN_SECRET_MISSING: NEXTAUTH_SECRET is required in production');
  }
  if (!warnedDevFallback) {
    console.warn(
      JSON.stringify({
        level: 'warn',
        service: 'taxi-token',
        message: 'NEXTAUTH_SECRET missing — using deterministic dev fallback (NEVER acceptable in production)',
        timestamp: new Date().toISOString(),
      }),
    );
    warnedDevFallback = true;
  }
  cachedSecret = 'dev-secret';
  return cachedSecret;
}

export function signTaxiToken(tripId: string): string {
  const secret = getSecret();
  const nonce = randomBytes(16).toString('hex');
  const payload = `${tripId}.${nonce}`;
  const sig = createHmac('sha256', secret).update(payload).digest('hex'); // full 256-bit
  return `${payload}.${sig}`;
}

export function verifyTaxiToken(token: string): { tripId: string } | null {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [tripId, nonce, sig] = parts;
  if (!tripId || !nonce || !sig) return null;
  const secret = getSecret();
  const expected = createHmac('sha256', secret).update(`${tripId}.${nonce}`).digest('hex');
  if (sig.length !== expected.length) return null;
  // timing-safe compare
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return null;
  return { tripId };
}
