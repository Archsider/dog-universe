import { describe, it, expect, beforeEach } from 'vitest';
import { signReferralToken, verifyReferralToken } from '../referral-token';

describe('referral-token', () => {
  beforeEach(() => {
    process.env.NEXTAUTH_SECRET = 'test-secret-at-least-16-chars-long';
  });

  it('sign + verify round-trip returns the same sponsorId', () => {
    const token = signReferralToken('user_abc');
    const v = verifyReferralToken(token);
    expect(v).toEqual({ sponsorId: 'user_abc' });
  });

  it('produces a different token each call (nonce randomness)', () => {
    const a = signReferralToken('user_x');
    const b = signReferralToken('user_x');
    expect(a).not.toBe(b);
  });

  it('rejects malformed tokens', () => {
    expect(verifyReferralToken('')).toBeNull();
    expect(verifyReferralToken('a.b')).toBeNull();         // 2 parts
    expect(verifyReferralToken('a.b.c.d')).toBeNull();     // 4 parts
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- defensive
    expect(verifyReferralToken(undefined as any)).toBeNull();
  });

  it('rejects tokens with a tampered sponsorId', () => {
    const token = signReferralToken('user_real');
    const parts = token.split('.');
    const tampered = ['user_fake', parts[1], parts[2]].join('.');
    expect(verifyReferralToken(tampered)).toBeNull();
  });

  it('rejects tokens with a tampered nonce', () => {
    const token = signReferralToken('user_y');
    const parts = token.split('.');
    const tampered = [parts[0], '00'.repeat(8), parts[2]].join('.');
    expect(verifyReferralToken(tampered)).toBeNull();
  });

  it('throws on empty sponsorId', () => {
    expect(() => signReferralToken('')).toThrow();
  });
});
