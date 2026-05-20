import { describe, it, expect, beforeEach, vi } from 'vitest';
import { signPassportToken, verifyPassportToken } from '../pet-passport-token';

describe('pet-passport-token', () => {
  beforeEach(() => {
    process.env.NEXTAUTH_SECRET = 'test-secret-at-least-16-chars-long';
    vi.useRealTimers();
  });

  it('sign + verify round-trip returns the same petId', () => {
    const { token, expiresAt } = signPassportToken('pet_abc');
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    const v = verifyPassportToken(token);
    expect(v).not.toBeNull();
    expect(v!.petId).toBe('pet_abc');
    expect(v!.expiresAt.getTime()).toBe(expiresAt.getTime());
  });

  it('rejects malformed tokens', () => {
    expect(verifyPassportToken('')).toBeNull();
    expect(verifyPassportToken('foo')).toBeNull();
    expect(verifyPassportToken('a.b.c')).toBeNull();          // 3 parts only
    expect(verifyPassportToken('a.b.c.d.e')).toBeNull();      // 5 parts
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- defensive
    expect(verifyPassportToken(null as any)).toBeNull();
  });

  it('rejects tokens with a tampered petId', () => {
    const { token } = signPassportToken('pet_real');
    // Mutate petId in the payload — sig was computed over pet_real
    const parts = token.split('.');
    const tampered = ['pet_fake', parts[1], parts[2], parts[3]].join('.');
    expect(verifyPassportToken(tampered)).toBeNull();
  });

  it('rejects tokens with a tampered expiry (extending expiration)', () => {
    const { token } = signPassportToken('pet_x', 60_000);
    const parts = token.split('.');
    const futureMs = Date.now() + 365 * 86_400_000; // a year ahead
    const tampered = [parts[0], String(futureMs), parts[2], parts[3]].join('.');
    expect(verifyPassportToken(tampered)).toBeNull();
  });

  it('rejects expired tokens', () => {
    // Sign with the minimum allowed TTL (60s), then advance system clock past it.
    const { token } = signPassportToken('pet_y', 60_000);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 120_000);
    expect(verifyPassportToken(token)).toBeNull();
    vi.useRealTimers();
  });

  it('caps TTL at 72h hard ceiling', () => {
    const requested = 365 * 86_400_000; // 1 year
    const { expiresAt } = signPassportToken('pet_cap', requested);
    const deltaH = (expiresAt.getTime() - Date.now()) / 3_600_000;
    expect(deltaH).toBeGreaterThan(71);
    expect(deltaH).toBeLessThanOrEqual(72.01);
  });

  it('floors TTL at 60s minimum', () => {
    const { expiresAt } = signPassportToken('pet_floor', 10);
    const deltaMs = expiresAt.getTime() - Date.now();
    expect(deltaMs).toBeGreaterThanOrEqual(59_000);
  });

  it('throws on empty petId', () => {
    expect(() => signPassportToken('')).toThrow();
  });
});
