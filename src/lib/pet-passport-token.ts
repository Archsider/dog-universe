// HMAC-signed Pet Health Passport tokens with embedded expiry.
//
// Format: `{petId}.{expiresAtMs}.{nonce16hex}.{sig64hex}` where
//   sig = HMAC-SHA256(secret, `${petId}.${expiresAtMs}.${nonce}`)
//
// The expiry is embedded in the signed payload so:
//   1. Expired tokens are rejected without a DB hit (defence against
//      enumeration / replay after the share window closes).
//   2. The signature covers the expiry, so it can't be tampered with.
//
// SECURITY: signs with NEXTAUTH_SECRET via the same lazy getter pattern as
// taxi-token.ts. Fail-closed in production, deterministic dev fallback
// elsewhere. `assertProductionEnv()` (boot-checks) already requires
// NEXTAUTH_SECRET in prod.
import { createHmac, randomBytes } from 'crypto';

const MAX_TTL_MS = 72 * 3600 * 1000;   // 72h hard cap
const DEFAULT_TTL_MS = 24 * 3600 * 1000; // 24h default

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
    throw new Error('PASSPORT_TOKEN_SECRET_MISSING: NEXTAUTH_SECRET is required in production');
  }
  if (!warnedDevFallback) {
    console.warn(JSON.stringify({
      level: 'warn',
      service: 'pet-passport-token',
      message: 'NEXTAUTH_SECRET missing — using deterministic dev fallback (NEVER acceptable in production)',
      timestamp: new Date().toISOString(),
    }));
    warnedDevFallback = true;
  }
  cachedSecret = 'dev-secret';
  return cachedSecret;
}

export interface SignedPassportToken {
  token: string;
  expiresAt: Date;
}

/**
 * Sign a passport token for `petId`, valid for `ttlMs` from now (default 24h,
 * hard-capped at 72h). The expiry is embedded in the signed payload — verify
 * checks it without DB.
 */
export function signPassportToken(petId: string, ttlMs: number = DEFAULT_TTL_MS): SignedPassportToken {
  if (!petId || typeof petId !== 'string') {
    throw new Error('PASSPORT_TOKEN_INVALID_PET_ID');
  }
  const ttl = Math.min(Math.max(60_000, ttlMs), MAX_TTL_MS);
  const expiresAtMs = Date.now() + ttl;
  const nonce = randomBytes(16).toString('hex');
  const payload = `${petId}.${expiresAtMs}.${nonce}`;
  const sig = createHmac('sha256', getSecret()).update(payload).digest('hex');
  return {
    token: `${payload}.${sig}`,
    expiresAt: new Date(expiresAtMs),
  };
}

/**
 * Verify a passport token. Returns `{ petId, expiresAt }` on success, null
 * on malformed / bad signature / expired. No DB hit.
 */
export function verifyPassportToken(token: string): { petId: string; expiresAt: Date } | null {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [petId, expiresAtStr, nonce, sig] = parts;
  if (!petId || !expiresAtStr || !nonce || !sig) return null;
  const expiresAtMs = Number(expiresAtStr);
  if (!Number.isFinite(expiresAtMs)) return null;

  const expected = createHmac('sha256', getSecret()).update(`${petId}.${expiresAtMs}.${nonce}`).digest('hex');
  if (sig.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return null;

  if (expiresAtMs < Date.now()) return null;
  return { petId, expiresAt: new Date(expiresAtMs) };
}

export const PASSPORT_TOKEN_DEFAULTS = {
  defaultTtlMs: DEFAULT_TTL_MS,
  maxTtlMs: MAX_TTL_MS,
};
