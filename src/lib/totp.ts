import { createHash } from 'crypto';
import { generateSecret, generate, verify } from 'otplib';
import qrcode from 'qrcode';
import { prisma } from './prisma';
import { decryptSecret } from './crypto';

export { generateSecret as generateTotpSecret };

// Replay window: how long after a valid token may NOT be reused for the same
// user. otplib accepts ±1 step (30s) drift by default, so 90s comfortably
// covers the entire acceptance window.
const REPLAY_WINDOW_MS = 90_000;

// SHA-256 the token before storing it in `lastTotpToken`. Defense-in-depth
// against a DB leak: a plaintext 6-digit token in the column would let an
// attacker replay the code within the 30-90s acceptance window. Hashing
// preserves the replay-detection capability (same input → same hash) while
// removing the raw token from at-rest storage. (audit S-M1)
//
// Migration: legacy rows still hold plaintext 6-digit tokens. The compare
// below tolerates both — if the stored value matches the hash OR the raw
// token, we treat it as a replay. After every legitimate login, the new
// hashed value overwrites the legacy plaintext.
function hashTotpToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function isReplayMatch(stored: string, candidate: string): boolean {
  if (!stored) return false;
  if (stored === candidate) return true; // legacy plaintext row
  return stored === hashTotpToken(candidate);
}

export function getTotpUri(secret: string, email: string): string {
  const label = encodeURIComponent(`Dog Universe:${email}`);
  const issuer = encodeURIComponent('Dog Universe');
  return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}

export async function getTotpQRCodeDataURL(secret: string, email: string): Promise<string> {
  return qrcode.toDataURL(getTotpUri(secret, email));
}

export interface TotpUserSlice {
  id: string;
  totpSecret: string | null;
  lastTotpToken: string | null;
  lastTotpUsedAt: Date | null;
}

export interface TotpVerifyResult {
  ok: boolean;
  reason?: 'INVALID_TOKEN' | 'REPLAY' | 'NO_SECRET' | 'CRYPTO_ERROR';
}

/**
 * Verify a 6-digit TOTP token against a user's encrypted secret, with
 * replay protection.
 *
 * On success, the caller is responsible for persisting `{ lastTotpToken,
 * lastTotpUsedAt }` (we expose `persistTotpUse()` for that — it's called
 * automatically when `persist: true`).
 */
export async function verifyTotpForUser(
  user: TotpUserSlice,
  token: string,
  opts: { persist?: boolean } = {},
): Promise<TotpVerifyResult> {
  if (!user.totpSecret) return { ok: false, reason: 'NO_SECRET' };

  // Replay guard: same token used within REPLAY_WINDOW_MS for THIS user.
  // Compare both as hash and as plaintext (legacy rows) — see hashTotpToken.
  if (
    user.lastTotpToken &&
    user.lastTotpUsedAt &&
    Date.now() - user.lastTotpUsedAt.getTime() < REPLAY_WINDOW_MS &&
    isReplayMatch(user.lastTotpToken, token)
  ) {
    return { ok: false, reason: 'REPLAY' };
  }

  let plaintext: string;
  try {
    plaintext = decryptSecret(user.totpSecret);
  } catch {
    return { ok: false, reason: 'CRYPTO_ERROR' };
  }

  let valid = false;
  try {
    const result = await verify({ secret: plaintext, token });
    valid = result.valid;
  } catch {
    valid = false;
  }

  if (!valid) return { ok: false, reason: 'INVALID_TOKEN' };

  if (opts.persist) {
    await persistTotpUse(user.id, token);
  }
  return { ok: true };
}

export async function persistTotpUse(userId: string, token: string): Promise<void> {
  // Store the hash, not the raw token. See hashTotpToken() for rationale.
  await prisma.user.update({
    where: { id: userId },
    data: { lastTotpToken: hashTotpToken(token), lastTotpUsedAt: new Date() },
  });
}

// Legacy entrypoint — accepts a plaintext secret and a token, returns boolean.
// Retained ONLY for places that have not been migrated to the user-aware API
// (e.g. test fixtures). New code MUST use `verifyTotpForUser`.
export async function verifyTotpToken(secret: string, token: string): Promise<boolean> {
  try {
    const result = await verify({ secret, token });
    return result.valid;
  } catch {
    return false;
  }
}

// Convenience: generate a current token (for testing)
export async function generateTotpToken(secret: string): Promise<string> {
  return generate({ secret });
}
