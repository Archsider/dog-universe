/**
 * Unit tests — verifyTaxiToken() / signTaxiToken() in src/lib/taxi-token.ts.
 *
 * Focus:
 *  - valid HMAC round-trip accepted
 *  - tampered signature / tampered tripId rejected
 *  - malformed token (legacy UUID, empty, wrong segment count) rejected
 *  - secret rotation invalidates previously-signed tokens (the closest
 *    available analogue to "expired" — this token format has no embedded
 *    expiry; revocation is done by rotating NEXTAUTH_SECRET).
 *
 * NOTE: getSecret() in taxi-token.ts caches the resolved secret in a module
 * variable, so we cannot mid-test swap NEXTAUTH_SECRET on the already-loaded
 * module. The "rotation" behaviour is exercised by signing under one secret
 * and verifying with a hand-rolled HMAC under a different secret.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createHmac } from 'crypto';
import { signTaxiToken, verifyTaxiToken } from '@/lib/taxi-token';

beforeEach(() => {
  // Ensure a deterministic 32+ char test secret is in place. The module caches
  // the resolved secret on first call; subsequent reassignments do not affect
  // already-cached state, but provide stable behaviour across the suite.
  if (!process.env.NEXTAUTH_SECRET || process.env.NEXTAUTH_SECRET.length < 32) {
    process.env.NEXTAUTH_SECRET = 'a'.repeat(32);
  }
});

describe('verifyTaxiToken — valid HMAC', () => {
  it('accepts a freshly signed token and returns its tripId', () => {
    const t = signTaxiToken('trip-42');
    expect(verifyTaxiToken(t)).toEqual({ tripId: 'trip-42' });
  });

  it('produces unique tokens for the same tripId (random nonce)', () => {
    const a = signTaxiToken('trip-x');
    const b = signTaxiToken('trip-x');
    expect(a).not.toEqual(b);
    expect(verifyTaxiToken(a)?.tripId).toBe('trip-x');
    expect(verifyTaxiToken(b)?.tripId).toBe('trip-x');
  });
});

describe('verifyTaxiToken — tampered token', () => {
  it('rejects a token whose signature byte was flipped', () => {
    const t = signTaxiToken('trip-1');
    const parts = t.split('.');
    parts[2] = '0'.repeat(parts[2].length);
    expect(verifyTaxiToken(parts.join('.'))).toBeNull();
  });

  it('rejects a token whose tripId was swapped (signature mismatch)', () => {
    const t = signTaxiToken('trip-1');
    const parts = t.split('.');
    parts[0] = 'trip-evil';
    expect(verifyTaxiToken(parts.join('.'))).toBeNull();
  });

  it('rejects a forged token signed with a foreign secret (analogue to a rotated/expired secret)', () => {
    const tripId = 'trip-rotated';
    const nonce = 'feedfacecafebeef';
    const sig = createHmac('sha256', 'wrong-secret-key-of-sufficient-len-32')
      .update(`${tripId}.${nonce}`)
      .digest('hex')
      .slice(0, 16);
    expect(verifyTaxiToken(`${tripId}.${nonce}.${sig}`)).toBeNull();
  });
});

describe('verifyTaxiToken — malformed input', () => {
  it('rejects empty / wrong-segment-count tokens', () => {
    expect(verifyTaxiToken('')).toBeNull();
    expect(verifyTaxiToken('a.b')).toBeNull();
    expect(verifyTaxiToken('a.b.c.d')).toBeNull();
  });

  it('rejects a legacy UUID token (no signature triplet)', () => {
    expect(verifyTaxiToken('123e4567-e89b-12d3-a456-426614174000')).toBeNull();
  });
});
