import { vi, describe, it, expect, beforeEach } from 'vitest';

const mockRedis = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
}));

vi.mock('@upstash/redis', () => ({
  Redis: vi.fn(function () { return mockRedis; }),
}));

process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';

import { markEmailSent, getLastEmailSentAt } from '../email-health';

beforeEach(() => {
  vi.clearAllMocks();
  mockRedis.get.mockResolvedValue(null);
  mockRedis.set.mockResolvedValue('OK');
});

describe('markEmailSent', () => {
  it('writes email:last:sent with an ISO timestamp and 30-day TTL', async () => {
    await markEmailSent();
    expect(mockRedis.set).toHaveBeenCalledTimes(1);
    const [key, value, opts] = mockRedis.set.mock.calls[0];
    expect(key).toBe('email:last:sent');
    expect(opts).toEqual({ ex: 30 * 24 * 3600 });
    // Value is an ISO timestamp the resolver can re-parse.
    expect(typeof value).toBe('string');
    expect(new Date(value as string).toString()).not.toBe('Invalid Date');
  });

  it('swallows Redis errors — fail-open (never block a send on telemetry)', async () => {
    mockRedis.set.mockRejectedValueOnce(new Error('Redis down'));
    await expect(markEmailSent()).resolves.toBeUndefined();
  });
});

describe('getLastEmailSentAt', () => {
  it('returns the ISO string when set', async () => {
    mockRedis.get.mockResolvedValueOnce('2026-05-15T17:30:00.000Z');
    expect(await getLastEmailSentAt()).toBe('2026-05-15T17:30:00.000Z');
  });

  it('returns null when unset', async () => {
    mockRedis.get.mockResolvedValueOnce(null);
    expect(await getLastEmailSentAt()).toBeNull();
  });

  it('returns null when Redis throws — fail-open', async () => {
    mockRedis.get.mockRejectedValueOnce(new Error('timeout'));
    expect(await getLastEmailSentAt()).toBeNull();
  });

  it('coerces non-string Redis return to string (Upstash deserialiser quirk)', async () => {
    // Some Upstash client versions auto-parse JSON-like strings. Defensive
    // String() coercion in the impl prevents crashes if it ever returns
    // something other than `string | null`.
    mockRedis.get.mockResolvedValueOnce(12345 as unknown as string);
    expect(await getLastEmailSentAt()).toBe('12345');
  });
});

describe('Redis not configured — fail-open', () => {
  it('both helpers no-op when env vars are missing', async () => {
    vi.resetModules();
    const saved = {
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    };
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    try {
      const mod = await import('../email-health');
      await expect(mod.markEmailSent()).resolves.toBeUndefined();
      expect(await mod.getLastEmailSentAt()).toBeNull();
    } finally {
      process.env.UPSTASH_REDIS_REST_URL = saved.url;
      process.env.UPSTASH_REDIS_REST_TOKEN = saved.token;
    }
  });
});
