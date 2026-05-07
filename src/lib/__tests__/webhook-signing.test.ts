import { describe, it, expect } from 'vitest';
import { signWebhook, verifyWebhook } from '../webhook-signing';

const SECRET = 'whsec_test_DGtWlGm5LLHuTeOh7M5hjlA1z7Z';
const BODY = '{"event":"payment.succeeded","data":{"id":"pi_123"}}';

describe('webhook-signing', () => {
  it('sign + verify roundtrip succeeds within tolerance', () => {
    const ts = Math.floor(Date.now() / 1000);
    const sig = signWebhook(SECRET, BODY, ts);
    expect(verifyWebhook(SECRET, BODY, sig, ts)).toBe(true);
  });

  it('rejects replay outside tolerance window', () => {
    const ts = Math.floor(Date.now() / 1000) - 10 * 60; // 10 min old
    const sig = signWebhook(SECRET, BODY, ts);
    expect(verifyWebhook(SECRET, BODY, sig, ts, 300)).toBe(false);
  });

  it('rejects tampered signature (wrong digest)', () => {
    const ts = Math.floor(Date.now() / 1000);
    const sig = signWebhook(SECRET, BODY, ts);
    const tampered = sig.slice(0, -2) + (sig.endsWith('00') ? 'ff' : '00');
    expect(verifyWebhook(SECRET, BODY, tampered, ts)).toBe(false);
  });

  it('rejects tampered body', () => {
    const ts = Math.floor(Date.now() / 1000);
    const sig = signWebhook(SECRET, BODY, ts);
    expect(verifyWebhook(SECRET, BODY + 'x', sig, ts)).toBe(false);
  });

  it('rejects when secret differs', () => {
    const ts = Math.floor(Date.now() / 1000);
    const sig = signWebhook(SECRET, BODY, ts);
    expect(verifyWebhook('other-secret', BODY, sig, ts)).toBe(false);
  });

  it('rejects mismatched-length signatures without throwing', () => {
    const ts = Math.floor(Date.now() / 1000);
    expect(verifyWebhook(SECRET, BODY, 'deadbeef', ts)).toBe(false);
  });

  it('rejects future timestamps beyond tolerance', () => {
    const now = Math.floor(Date.now() / 1000);
    const futureTs = now + 10 * 60;
    const sig = signWebhook(SECRET, BODY, futureTs);
    expect(verifyWebhook(SECRET, BODY, sig, futureTs, 300, now)).toBe(false);
  });

  it('accepts timestamp at tolerance boundary', () => {
    const now = 1_700_000_000;
    const ts = now - 300;
    const sig = signWebhook(SECRET, BODY, ts);
    expect(verifyWebhook(SECRET, BODY, sig, ts, 300, now)).toBe(true);
  });

  it('signWebhook throws on non-integer timestamp', () => {
    expect(() => signWebhook(SECRET, BODY, 1.5)).toThrow();
  });

  it('signWebhook throws on empty secret', () => {
    expect(() => signWebhook('', BODY, 1_700_000_000)).toThrow();
  });

  it('verifyWebhook returns false on empty signature', () => {
    expect(verifyWebhook(SECRET, BODY, '', Math.floor(Date.now() / 1000))).toBe(false);
  });

  it('produces deterministic hex output (64 chars for SHA-256)', () => {
    const sig = signWebhook(SECRET, BODY, 1_700_000_000);
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
    // Same inputs → same output
    expect(signWebhook(SECRET, BODY, 1_700_000_000)).toBe(sig);
  });
});
