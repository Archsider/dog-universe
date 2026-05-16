/* eslint-disable @typescript-eslint/no-explicit-any -- test stubs */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ──────────────────────────────────────────────────────────────
// Mocks — Prisma raw query + cache + Sentry + waitUntil + logger
// ──────────────────────────────────────────────────────────────

type RawQueryHandler = (sql: string, params: unknown[]) => unknown[];

const state: {
  mvRows: Array<{ category: string; total: string }>;
  liveRows: Array<{ category: string; total: string }>;
  liveThrows: boolean;
  redisStamp: string | null;
  redisSetCalls: Array<{ key: string; value: string; ttl: number }>;
  sentryMessages: Array<{ msg: string; level: string }>;
  waitUntilCalls: Array<Promise<unknown>>;
} = {
  mvRows: [],
  liveRows: [],
  liveThrows: false,
  redisStamp: null,
  redisSetCalls: [],
  sentryMessages: [],
  waitUntilCalls: [],
};

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: (strings: TemplateStringsArray, ..._params: unknown[]) => {
      const sql = strings.join('?');
      if (sql.includes('monthly_revenue_mv')) {
        return state.mvRows.map(r => ({ category: r.category, amount: parseFloat(r.total) }));
      }
      if (sql.includes('compute_payment_by_category')) {
        if (state.liveThrows) throw new Error('function compute_payment_by_category does not exist');
        return state.liveRows.map(r => ({ category: r.category, amount: parseFloat(r.total) }));
      }
      return [];
    },
  },
}));

vi.mock('@/lib/cache', () => ({
  cacheGet: async (_key: string) => state.redisStamp,
  cacheSet: async (key: string, value: string, ttl: number) => {
    state.redisSetCalls.push({ key, value, ttl });
    state.redisStamp = value;
  },
}));

vi.mock('@/lib/observability', () => ({
  withSpan: async (_name: string, _attrs: unknown, fn: () => unknown) => fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('@sentry/nextjs', () => ({
  captureMessage: (msg: string, opts: any) => {
    state.sentryMessages.push({ msg, level: opts?.level ?? 'info' });
  },
}));

vi.mock('@vercel/functions', () => ({
  waitUntil: (p: Promise<unknown>) => {
    state.waitUntilCalls.push(p);
  },
}));

beforeEach(() => {
  state.mvRows = [];
  state.liveRows = [];
  state.liveThrows = false;
  state.redisStamp = null;
  state.redisSetCalls = [];
  state.sentryMessages = [];
  state.waitUntilCalls = [];
});

// ──────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────

describe('getMonthlyRevenueByCategory — Sémantique B fast/slow paths', () => {
  it('fast path : MV fresh (< 2h) returns mv source + schedules async drift', async () => {
    state.redisStamp = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1h ago
    state.mvRows = [
      { category: 'BOARDING', total: '12340.50' },
      { category: 'PRODUCT', total: '740.00' },
    ];
    state.liveRows = [
      { category: 'BOARDING', total: '12340.50' },
      { category: 'PRODUCT', total: '740.00' },
    ];

    const { getMonthlyRevenueByCategory } = await import('@/lib/billing/monthly-revenue');
    const res = await getMonthlyRevenueByCategory(2026, 5);

    expect(res.source).toBe('mv');
    expect(res.rows).toHaveLength(2);
    expect(res.totalAllCategories).toBeCloseTo(13080.5, 2);
    // Background drift check scheduled via waitUntil.
    expect(state.waitUntilCalls).toHaveLength(1);
  });

  it('slow path : MV stale (> 2h) computes live and returns live source', async () => {
    state.redisStamp = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(); // 3h ago
    state.mvRows = [{ category: 'BOARDING', total: '10000' }];
    state.liveRows = [{ category: 'BOARDING', total: '12340.50' }];

    const { getMonthlyRevenueByCategory } = await import('@/lib/billing/monthly-revenue');
    const res = await getMonthlyRevenueByCategory(2026, 5);

    expect(res.source).toBe('live');
    expect(res.rows[0].amount).toBeCloseTo(12340.5, 2);
  });

  it('slow path with drift > 0.01 logs Sentry warning synchronously', async () => {
    state.redisStamp = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    state.mvRows = [{ category: 'BOARDING', total: '10000' }];
    state.liveRows = [{ category: 'BOARDING', total: '12340.50' }];

    const { getMonthlyRevenueByCategory } = await import('@/lib/billing/monthly-revenue');
    await getMonthlyRevenueByCategory(2026, 5);

    expect(state.sentryMessages).toHaveLength(1);
    expect(state.sentryMessages[0].level).toBe('warning');
    expect(state.sentryMessages[0].msg).toMatch(/sync stale/);
  });

  it('no Redis stamp → treats MV as stale and computes live', async () => {
    state.redisStamp = null; // Redis miss / cold start
    state.mvRows = [{ category: 'BOARDING', total: '12340.50' }];
    state.liveRows = [{ category: 'BOARDING', total: '12340.50' }];

    const { getMonthlyRevenueByCategory } = await import('@/lib/billing/monthly-revenue');
    const res = await getMonthlyRevenueByCategory(2026, 5);

    expect(res.source).toBe('live');
  });

  it('live path returns empty if PG function missing — does not throw', async () => {
    state.redisStamp = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    state.mvRows = [];
    state.liveThrows = true;

    const { getMonthlyRevenueByCategory } = await import('@/lib/billing/monthly-revenue');
    const res = await getMonthlyRevenueByCategory(2026, 5);

    expect(res.source).toBe('live');
    expect(res.rows).toHaveLength(0);
    expect(res.totalAllCategories).toBe(0);
  });
});

describe('markMVRefreshed — Redis stamping', () => {
  it('writes the timestamp to Redis with 7-day TTL', async () => {
    const { markMVRefreshed, MV_REFRESH_REDIS_KEY, MV_REFRESH_TTL_SECONDS } = await import('@/lib/billing/monthly-revenue');
    const when = new Date('2026-05-17T12:00:00.000Z');
    await markMVRefreshed(when);
    expect(state.redisSetCalls).toHaveLength(1);
    expect(state.redisSetCalls[0]).toEqual({
      key: MV_REFRESH_REDIS_KEY,
      value: when.toISOString(),
      ttl: MV_REFRESH_TTL_SECONDS,
    });
  });

  it('defaults to now() if no date is provided', async () => {
    const { markMVRefreshed } = await import('@/lib/billing/monthly-revenue');
    const before = Date.now();
    await markMVRefreshed();
    const after = Date.now();
    expect(state.redisSetCalls).toHaveLength(1);
    const stamped = new Date(state.redisSetCalls[0].value).getTime();
    expect(stamped).toBeGreaterThanOrEqual(before);
    expect(stamped).toBeLessThanOrEqual(after);
  });
});

describe('__test.computeDrift — pure drift math', () => {
  it('zero drift when MV equals live exactly', async () => {
    const { __test } = await import('@/lib/billing/monthly-revenue');
    const drift = __test.computeDrift(
      [{ category: 'BOARDING', amount: 100 }],
      [{ category: 'BOARDING', amount: 100 }],
    );
    expect(drift).toBe(0);
  });

  it('symmetric drift catches missing-on-mv', async () => {
    const { __test } = await import('@/lib/billing/monthly-revenue');
    const drift = __test.computeDrift(
      [{ category: 'BOARDING', amount: 100 }],
      [{ category: 'BOARDING', amount: 100 }, { category: 'PRODUCT', amount: 740 }],
    );
    expect(drift).toBeCloseTo(740, 2);
  });

  it('symmetric drift catches missing-on-live', async () => {
    const { __test } = await import('@/lib/billing/monthly-revenue');
    const drift = __test.computeDrift(
      [{ category: 'BOARDING', amount: 100 }, { category: 'PRODUCT', amount: 740 }],
      [{ category: 'BOARDING', amount: 100 }],
    );
    expect(drift).toBeCloseTo(740, 2);
  });

  it('partial mismatch sums absolute differences across categories', async () => {
    const { __test } = await import('@/lib/billing/monthly-revenue');
    const drift = __test.computeDrift(
      [{ category: 'BOARDING', amount: 100 }, { category: 'PRODUCT', amount: 700 }],
      [{ category: 'BOARDING', amount: 110 }, { category: 'PRODUCT', amount: 740 }],
    );
    // |100-110| + |700-740| = 10 + 40 = 50
    expect(drift).toBeCloseTo(50, 2);
  });
});
