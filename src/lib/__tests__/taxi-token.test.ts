import { describe, it, expect } from 'vitest';
import { signTaxiToken, verifyTaxiToken } from '../taxi-token';

describe('taxi-token', () => {
  it('signs + verifies a round-trip', () => {
    const token = signTaxiToken('trip-abc');
    const out = verifyTaxiToken(token);
    expect(out).toEqual({ tripId: 'trip-abc' });
  });

  it('produces unique tokens for the same tripId (random nonce)', () => {
    const a = signTaxiToken('trip-xyz');
    const b = signTaxiToken('trip-xyz');
    expect(a).not.toEqual(b);
    expect(verifyTaxiToken(a)?.tripId).toBe('trip-xyz');
    expect(verifyTaxiToken(b)?.tripId).toBe('trip-xyz');
  });

  it('rejects tampered signatures', () => {
    const token = signTaxiToken('trip-1');
    const parts = token.split('.');
    parts[2] = '0'.repeat(parts[2].length);
    expect(verifyTaxiToken(parts.join('.'))).toBeNull();
  });

  it('rejects malformed tokens (legacy UUID format)', () => {
    expect(verifyTaxiToken('123e4567-e89b-12d3-a456-426614174000')).toBeNull();
    expect(verifyTaxiToken('a.b')).toBeNull();
    expect(verifyTaxiToken('a.b.c.d')).toBeNull();
    expect(verifyTaxiToken('')).toBeNull();
  });

  it('rejects tampered tripId (signature mismatch)', () => {
    const token = signTaxiToken('trip-1');
    const parts = token.split('.');
    parts[0] = 'trip-2';
    expect(verifyTaxiToken(parts.join('.'))).toBeNull();
  });
});
