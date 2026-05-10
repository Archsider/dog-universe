// HMAC-signed taxi tracking tokens.
//
// Format: `{tripId}.{nonce16hex}.{sig16hex}` where sig = HMAC-SHA256(secret,
// `${tripId}.${nonce}`).slice(0, 16). The signed format lets us reject
// invalid tokens with a 404 *without* hitting the DB — neutralizes brute
// force / token enumeration vectors.
//
// Backward compatibility: legacy trips were issued raw UUID v4 tokens. The
// caller is expected to fall back to a DB lookup when verifyTaxiToken
// returns null.
import { createHmac, randomBytes } from 'crypto';

const SECRET = process.env.NEXTAUTH_SECRET ?? 'dev-secret';

export function signTaxiToken(tripId: string): string {
  const nonce = randomBytes(16).toString('hex');
  const payload = `${tripId}.${nonce}`;
  const sig = createHmac('sha256', SECRET).update(payload).digest('hex').slice(0, 16);
  return `${payload}.${sig}`;
}

export function verifyTaxiToken(token: string): { tripId: string } | null {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [tripId, nonce, sig] = parts;
  if (!tripId || !nonce || !sig) return null;
  const expected = createHmac('sha256', SECRET).update(`${tripId}.${nonce}`).digest('hex').slice(0, 16);
  if (sig.length !== expected.length) return null;
  // timing-safe compare
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return null;
  return { tripId };
}
