/* eslint-disable @typescript-eslint/no-explicit-any -- test stubs */
/**
 * Tests for `scheduleMVRefreshIfCurrentMonth` — the helper called from
 * `recordPayment()` to keep `monthly_revenue_mv` fresh on current-month
 * payments without waiting up to 2h for the hourly cron.
 *
 * Asserts the 3 fail-safe gates :
 *   - past-month paymentDate → SKIP (cron handles backfills)
 *   - current-month + debounce flag free → REFRESH scheduled
 *   - current-month + debounce flag held → SKIP
 *   - REFRESH throwing inside waitUntil → swallowed, never propagates
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const state: {
  flagAcquired: boolean;
  waitUntilCalls: Array<Promise<unknown>>;
  refreshThrows: boolean;
  executeRawCalls: string[];
  markCalls: number;
} = {
  flagAcquired: true,
  waitUntilCalls: [],
  refreshThrows: false,
  executeRawCalls: [],
  markCalls: 0,
};

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $executeRawUnsafe: async (sql: string) => {
      state.executeRawCalls.push(sql);
      if (state.refreshThrows) throw new Error('CONCURRENTLY conflict');
      return 0;
    },
    $queryRaw: async () => [],
  },
}));

vi.mock('@/lib/cache', () => ({
  tryAcquireFlag: vi.fn(async () => state.flagAcquired),
  cacheGet: async () => null,
  cacheSet: async () => {
    state.markCalls += 1;
  },
}));

vi.mock('@/lib/observability', () => ({
  withSpan: async (_n: string, _a: unknown, fn: () => unknown) => fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('@sentry/nextjs', () => ({
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

vi.mock('@vercel/functions', () => ({
  waitUntil: (p: Promise<unknown>) => {
    state.waitUntilCalls.push(p);
  },
}));

// `currentMonthCasa` returns now; we control "now" via fake timers so the
// helper sees a deterministic Casa year/month pair.
import { scheduleMVRefreshIfCurrentMonth } from '@/lib/billing/monthly-revenue';
import { tryAcquireFlag } from '@/lib/cache';

beforeEach(() => {
  state.flagAcquired = true;
  state.waitUntilCalls = [];
  state.refreshThrows = false;
  state.executeRawCalls = [];
  state.markCalls = 0;
  vi.clearAllMocks();
  // Pin "now" to 2026-05-16 12:00 Casa (= 11:00 UTC) so currentMonthCasa
  // returns { year: 2026, month: 5 }.
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-05-16T11:00:00Z'));
});

describe('scheduleMVRefreshIfCurrentMonth', () => {
  it('schedules a REFRESH when paymentDate is in the current Casa month', async () => {
    await scheduleMVRefreshIfCurrentMonth(new Date('2026-05-14T09:00:00Z'));

    expect(tryAcquireFlag).toHaveBeenCalledWith(
      'mv:refresh:debounce:monthly_revenue',
      60,
    );
    expect(state.waitUntilCalls).toHaveLength(1);

    // Drain the scheduled promise so we can assert the side effects.
    await Promise.all(state.waitUntilCalls);
    expect(state.executeRawCalls).toEqual([
      'REFRESH MATERIALIZED VIEW CONCURRENTLY monthly_revenue_mv',
    ]);
    expect(state.markCalls).toBe(1);
  });

  it('SKIPs (no flag check, no REFRESH) when paymentDate is in a past month', async () => {
    await scheduleMVRefreshIfCurrentMonth(new Date('2026-04-20T09:00:00Z'));

    expect(tryAcquireFlag).not.toHaveBeenCalled();
    expect(state.waitUntilCalls).toHaveLength(0);
    expect(state.executeRawCalls).toHaveLength(0);
  });

  it('SKIPs when the debounce flag is already held (burst protection)', async () => {
    state.flagAcquired = false;

    await scheduleMVRefreshIfCurrentMonth(new Date('2026-05-15T09:00:00Z'));

    expect(tryAcquireFlag).toHaveBeenCalledTimes(1);
    expect(state.waitUntilCalls).toHaveLength(0);
    expect(state.executeRawCalls).toHaveLength(0);
  });

  it('NEVER throws when the background REFRESH itself fails', async () => {
    state.refreshThrows = true;

    await expect(
      scheduleMVRefreshIfCurrentMonth(new Date('2026-05-14T09:00:00Z')),
    ).resolves.toBeUndefined();

    expect(state.waitUntilCalls).toHaveLength(1);
    // The scheduled promise resolves (does not reject) so unhandled
    // rejection logs don't appear in production.
    await expect(Promise.all(state.waitUntilCalls)).resolves.toBeDefined();
    expect(state.markCalls).toBe(0); // markMVRefreshed skipped on throw
  });

  it('treats Casa month boundary correctly (UTC 23:30 on 30 Apr → Casa 1 May)', async () => {
    // "Now" pinned above is 2026-05-16 Casa → current month = May.
    // A payment timestamped 2026-04-30T23:30Z is May 1st in Casa →
    // should count as current month and trigger refresh.
    await scheduleMVRefreshIfCurrentMonth(new Date('2026-04-30T23:30:00Z'));

    expect(tryAcquireFlag).toHaveBeenCalledTimes(1);
    expect(state.waitUntilCalls).toHaveLength(1);
  });
});
