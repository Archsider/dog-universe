import { describe, it, expect } from 'vitest';
import { scrubSensitive } from '../log-scrubber';

describe('scrubSensitive', () => {
  it('replaces password values with [REDACTED]', () => {
    const out = scrubSensitive({ password: 'hunter2', email: 'x@y.com' });
    expect(out).toEqual({ password: '[REDACTED]', email: 'x@y.com' });
  });

  it('catches casing variations (Password, PASSWORD)', () => {
    const out = scrubSensitive({ Password: 'a', PASSWORD: 'b', passwd: 'c' });
    expect(out).toEqual({ Password: '[REDACTED]', PASSWORD: '[REDACTED]', passwd: '[REDACTED]' });
  });

  it('catches token, secret, api_key, apiKey, csrf, 2fa, otp, totp, authorization, cookie', () => {
    const out = scrubSensitive({
      token: 't', secret: 's', api_key: 'k', apiKey: 'k2',
      csrf: 'c', '2fa': 'f', otp: 'o', totp: 'tt',
      authorization: 'A', cookie: 'C',
    });
    for (const v of Object.values(out)) {
      expect(v).toBe('[REDACTED]');
    }
  });

  it('preserves non-sensitive keys intact', () => {
    const out = scrubSensitive({
      bookingId: 'b1', amount: 100, paymentMethod: 'CASH', notes: 'OK',
    });
    expect(out).toEqual({
      bookingId: 'b1', amount: 100, paymentMethod: 'CASH', notes: 'OK',
    });
  });

  it('recurses into nested objects', () => {
    const out = scrubSensitive({
      user: { id: 'u1', email: 'x@y.com', password: 'hunter2' },
      meta: { token: 't' },
    });
    expect(out).toEqual({
      user: { id: 'u1', email: 'x@y.com', password: '[REDACTED]' },
      meta: { token: '[REDACTED]' },
    });
  });

  it('walks arrays', () => {
    const out = scrubSensitive({
      events: [
        { type: 'login', password: 'a' },
        { type: 'logout', token: 'b' },
      ],
    });
    expect(out).toEqual({
      events: [
        { type: 'login', password: '[REDACTED]' },
        { type: 'logout', token: '[REDACTED]' },
      ],
    });
  });

  it('handles null/undefined/primitives gracefully', () => {
    expect(scrubSensitive(null)).toBeNull();
    expect(scrubSensitive(undefined)).toBeUndefined();
    expect(scrubSensitive(42)).toBe(42);
    expect(scrubSensitive('hello')).toBe('hello');
    expect(scrubSensitive(true)).toBe(true);
  });

  it('does not crash on cyclic references', () => {
    const a: Record<string, unknown> = { name: 'a' };
    const b: Record<string, unknown> = { parent: a, password: 'p' };
    a.child = b;
    const out = scrubSensitive(a) as Record<string, unknown>;
    expect((out.child as Record<string, unknown>).password).toBe('[REDACTED]');
  });

  it('is idempotent', () => {
    const input = { user: { password: 'x' }, token: 't' };
    const once = scrubSensitive(input);
    const twice = scrubSensitive(once);
    expect(once).toEqual(twice);
  });

  it('catches "Authorization" and "Cookie" headers exactly (HTTP convention)', () => {
    const out = scrubSensitive({
      Authorization: 'Bearer xyz',
      Cookie: 'sid=abc',
      method: 'POST',
    });
    expect(out).toEqual({
      Authorization: '[REDACTED]',
      Cookie: '[REDACTED]',
      method: 'POST',
    });
  });
});
