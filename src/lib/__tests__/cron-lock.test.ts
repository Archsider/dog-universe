import { vi, describe, it, expect, beforeEach } from 'vitest';

const mockSet = vi.hoisted(() => vi.fn());

vi.mock('@upstash/redis', () => ({
  Redis: vi.fn(function () { return { set: mockSet }; }),
}));

process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';

import { acquireCronLock, periodKey } from '../cron-lock';

beforeEach(() => {
  vi.clearAllMocks();
  mockSet.mockResolvedValue('OK');
});

describe('periodKey', () => {
  it('returns YYYY-MM-DD for daily period (UTC)', () => {
    const d = new Date(Date.UTC(2026, 4, 1, 12, 0, 0)); // 2026-05-01
    expect(periodKey('daily', d)).toBe('2026-05-01');
  });

  it('returns YYYY-Www for weekly period', () => {
    const d = new Date(Date.UTC(2026, 4, 1, 12, 0, 0));
    expect(periodKey('weekly', d)).toMatch(/^\d{4}-W\d{2}$/);
  });

  it('zero-pads month/day for daily period', () => {
    const d = new Date(Date.UTC(2026, 0, 5, 12, 0, 0)); // 2026-01-05
    expect(periodKey('daily', d)).toBe('2026-01-05');
  });
});

describe('acquireCronLock', () => {
  it('returns true when SET NX succeeds', async () => {
    mockSet.mockResolvedValueOnce('OK');
    const ok = await acquireCronLock('reminders', 60);
    expect(ok).toBe(true);
  });

  it('returns false when SET NX returns null (lock already held)', async () => {
    mockSet.mockResolvedValueOnce(null);
    const ok = await acquireCronLock('reminders', 60);
    expect(ok).toBe(false);
  });

  it('builds the lock key as cron:{name}:{period}', async () => {
    await acquireCronLock('reminders', 60, 'daily');
    expect(mockSet).toHaveBeenCalledWith(
      expect.stringMatching(/^cron:reminders:\d{4}-\d{2}-\d{2}$/),
      '1',
      { nx: true, ex: 60 },
    );
  });

  it('uses weekly key format when period=weekly', async () => {
    await acquireCronLock('contract-reminders', 60, 'weekly');
    expect(mockSet).toHaveBeenCalledWith(
      expect.stringMatching(/^cron:contract-reminders:\d{4}-W\d{2}$/),
      '1',
      { nx: true, ex: 60 },
    );
  });

  it('fail-open: returns true when Redis throws', async () => {
    mockSet.mockRejectedValueOnce(new Error('Redis down'));
    const ok = await acquireCronLock('reminders', 60);
    expect(ok).toBe(true);
  });
});

describe('acquireCronLock — Redis not configured', () => {
  it('returns true when no Redis env vars (fail-open)', async () => {
    vi.resetModules();
    const saved = {
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    };
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    try {
      const { acquireCronLock: fn } = await import('../cron-lock');
      const ok = await fn('reminders', 60);
      expect(ok).toBe(true);
    } finally {
      process.env.UPSTASH_REDIS_REST_URL = saved.url;
      process.env.UPSTASH_REDIS_REST_TOKEN = saved.token;
    }
  });
});
