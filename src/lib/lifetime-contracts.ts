// Service layer for LifetimeContract — magic-link signature workflow for
// pet-specific lifetime boarding contracts (Stephanie / Mama, 2026-05-18).
//
// Pattern aligned with `time-proposals.ts` : HMAC-signed self-verifying
// token, state machine guarded in a single module, routes never touch
// `prisma.lifetimeContract.update` directly to keep the invariants
// centralized.
//
// State machine :
//
//     PENDING ──sign──> SIGNED      (terminal-positive, PDF generated)
//        │
//        ├──admin revoke──> REVOKED  (terminal — link cancelled before signing)
//        │
//        └──token TTL─────> EXPIRED  (lazy — checked on access)

import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

const TOKEN_NONCE_BYTES = 16;
export const TOKEN_TTL_DAYS = 30;
export const TOKEN_TTL_MS = TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

function getSecret(): string {
  const s =
    process.env.LIFETIME_CONTRACT_TOKEN_SECRET ||
    process.env.TIME_PROPOSAL_TOKEN_SECRET ||
    process.env.NEXTAUTH_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      'LIFETIME_CONTRACT_TOKEN_SECRET (or NEXTAUTH_SECRET) must be set',
    );
  }
  return s;
}

/** Builds `<contractId>.<nonce16hex>.<sig64hex>`. */
export function signLifetimeToken(contractId: string): string {
  const nonce = randomBytes(TOKEN_NONCE_BYTES).toString('hex');
  const payload = `${contractId}.${nonce}`;
  const sig = createHmac('sha256', getSecret()).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

/** Returns the `contractId` embedded in the token, or `null` if tampered. */
export function verifyLifetimeToken(token: string): string | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [contractId, nonce, sig] = parts;
  if (!contractId || !nonce || !sig) return null;
  const expected = createHmac('sha256', getSecret())
    .update(`${contractId}.${nonce}`)
    .digest('hex');
  const a = Buffer.from(sig, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length) return null;
  try {
    if (!timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  return contractId;
}
