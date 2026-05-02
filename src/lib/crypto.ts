// AES-256-GCM symmetric encryption for at-rest secrets (e.g. TOTP shared secrets).
//
// Format: `v1:${ivBase64}:${authTagBase64}:${cipherBase64}` so that:
//  - The version prefix lets us rotate algorithms without ambiguity.
//  - All three components round-trip safely as ASCII.
//  - Existing plaintext rows (no `v1:` prefix) can be detected and migrated.
//
// Key: `TOTP_ENCRYPTION_KEY` — 32-byte hex (64 hex chars) → 256-bit key.
// Generate with: `openssl rand -hex 32`
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { env } from './env';

const VERSION = 'v1';
const IV_LENGTH = 12; // GCM standard

function getKey(): Buffer {
  const hex = env.TOTP_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error('TOTP_ENCRYPTION_KEY is not configured');
  }
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('TOTP_ENCRYPTION_KEY must be 64 hex chars (32 bytes)');
  }
  return Buffer.from(hex, 'hex');
}

export function encryptSecret(plain: string): string {
  if (typeof plain !== 'string' || plain.length === 0) {
    throw new Error('encryptSecret: plain must be a non-empty string');
  }
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${VERSION}:${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext.toString('base64')}`;
}

export function decryptSecret(payload: string): string {
  if (typeof payload !== 'string' || payload.length === 0) {
    throw new Error('decryptSecret: payload must be a non-empty string');
  }
  // Backward-compat: legacy plaintext rows (no `v1:` prefix). We treat them
  // as already-decrypted so dev environments with pre-migration data still
  // work — production has none yet.
  if (!payload.startsWith(`${VERSION}:`)) {
    return payload;
  }
  const parts = payload.split(':');
  if (parts.length !== 4) {
    throw new Error('decryptSecret: malformed payload');
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const key = getKey();
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
  return plaintext.toString('utf8');
}

// True if the payload is in the v1 encrypted envelope (vs legacy plaintext).
export function isEncrypted(payload: string): boolean {
  return typeof payload === 'string' && payload.startsWith(`${VERSION}:`);
}
