// HMAC-signed referral tokens — Parrainage Royal.
//
// Format: `{sponsorId}.{nonce8hex}.{sig64hex}` where
//   sig = HMAC-SHA256(secret, `${sponsorId}.${nonce}`)
//
// No expiry — referrals are permanent (a friend can sign up months later).
// To revoke, rotate NEXTAUTH_SECRET (nuclear).
//
// SECURITY: signs with NEXTAUTH_SECRET via the same lazy getter pattern as
// taxi-token.ts and pet-passport-token.ts.
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
    throw new Error('REFERRAL_TOKEN_SECRET_MISSING: NEXTAUTH_SECRET is required in production');
  }
  if (!warnedDevFallback) {
    console.warn(JSON.stringify({
      level: 'warn',
      service: 'referral-token',
      message: 'NEXTAUTH_SECRET missing — using deterministic dev fallback (NEVER acceptable in production)',
      timestamp: new Date().toISOString(),
    }));
    warnedDevFallback = true;
  }
  cachedSecret = 'dev-secret';
  return cachedSecret;
}

export function signReferralToken(sponsorId: string): string {
  if (!sponsorId || typeof sponsorId !== 'string') {
    throw new Error('REFERRAL_TOKEN_INVALID_SPONSOR_ID');
  }
  const nonce = randomBytes(8).toString('hex'); // shorter than taxi nonce — referrals share friendlier URLs
  const payload = `${sponsorId}.${nonce}`;
  const sig = createHmac('sha256', getSecret()).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

export function verifyReferralToken(token: string): { sponsorId: string } | null {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [sponsorId, nonce, sig] = parts;
  if (!sponsorId || !nonce || !sig) return null;
  const expected = createHmac('sha256', getSecret()).update(`${sponsorId}.${nonce}`).digest('hex');
  if (sig.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return null;
  return { sponsorId };
}
