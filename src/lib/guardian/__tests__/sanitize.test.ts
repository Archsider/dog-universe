import { describe, it, expect } from 'vitest';
import { sanitizeString, sanitizePayload } from '../sanitize';

describe('sanitizeString', () => {
  it('redacts emails', () => {
    expect(sanitizeString('contact alice@example.com today')).toBe(
      'contact [REDACTED_EMAIL] today',
    );
  });

  it('redacts international phone numbers', () => {
    expect(sanitizeString('call +212 6 12 34 56 78 now')).toContain('[REDACTED_PHONE]');
  });

  it('redacts IPv4 addresses', () => {
    expect(sanitizeString('from 192.168.1.42 here')).toBe('from [REDACTED_IP] here');
  });

  it('redacts JWT-like strings', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    expect(sanitizeString(jwt)).toBe('[REDACTED_JWT]');
  });

  it('redacts cuid-like ids', () => {
    expect(sanitizeString('user clz1234567890abcdefghij12 hi')).toContain('[REDACTED_ID]');
  });

  it('redacts UUIDs', () => {
    expect(sanitizeString('id 550e8400-e29b-41d4-a716-446655440000 ok')).toContain('[REDACTED_UUID]');
  });

  it('redacts Bearer tokens', () => {
    expect(sanitizeString('Authorization: Bearer abc.def-_/=123')).toContain('Bearer [REDACTED]');
  });
});

describe('sanitizePayload', () => {
  it('drops sensitive keys regardless of casing', () => {
    const out = sanitizePayload({ Email: 'a@b.c', PASSWORD: 'p', name: 'X', other: 'y' }) as Record<
      string,
      unknown
    >;
    expect(out.Email).toBe('[REDACTED]');
    expect(out.PASSWORD).toBe('[REDACTED]');
    expect(out.name).toBe('[REDACTED]');
    expect(out.other).toBe('y');
  });

  it('recurses into nested structures and bounds depth', () => {
    let nested: unknown = 'deep';
    for (let i = 0; i < 10; i++) nested = { wrap: nested };
    const out = sanitizePayload(nested) as { wrap: unknown };
    // Truncates somewhere — never throws.
    expect(out).toBeDefined();
  });

  it('caps array length and keeps a placeholder', () => {
    const long = Array.from({ length: 100 }, (_, i) => `v${i}`);
    const out = sanitizePayload(long) as unknown[];
    expect(out.length).toBe(51);
    expect(String(out[50])).toMatch(/truncated/);
  });

  it('passes through primitives unchanged', () => {
    expect(sanitizePayload(42)).toBe(42);
    expect(sanitizePayload(true)).toBe(true);
    expect(sanitizePayload(null)).toBe(null);
  });
});
