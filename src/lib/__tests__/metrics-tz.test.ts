import { vi, describe, it, expect, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  cacheReadThrough: vi.fn(),
  prisma: {
    invoice: { findMany: vi.fn().mockResolvedValue([]) },
    monthlyRevenueSummary: { findFirst: vi.fn().mockResolvedValue(null) },
    $queryRaw: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/cache', () => ({
  cacheReadThrough: mocks.cacheReadThrough,
}));
vi.mock('@/lib/accounting', () => ({
  computeMonthlyRevenueByCategory: () => ({ boarding: 0, taxi: 0, grooming: 0, croquettes: 0, other: 0 }),
}));
vi.mock('@/lib/billing', () => ({
  getMonthlyInvoicesWhere: () => ({ OR: [] }),
}));

// Reuse the real dates-casablanca helpers — we are precisely testing the
// integration of `casablancaYMD` with metrics.ts.
import { revenueByCategoryProrata } from '../metrics';
import { startOfMonthCasa, endOfMonthCasa } from '../dates-casablanca';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cacheReadThrough.mockImplementation(async (_key: string, _ttl: number, loader: () => Promise<unknown>) => loader());
});

describe('revenueByCategoryProrata — Casa-anchored cache key (Bug TZ analytics)', () => {
  it('uses Casa year/month for the cache key when called with startOfMonthCasa(May 2026)', async () => {
    // startOfMonthCasa(May 14, 2026) returns 2026-04-30T23:00:00Z. On a UTC
    // runtime, `.getMonth()` on that Date returns 3 (April), which BEFORE
    // this fix produced cache key `revenue:2026:4` for what should have
    // been the May query — silently making /admin/analytics show April.
    const refDate = new Date('2026-05-14T12:00:00Z');
    const monthStart = startOfMonthCasa(refDate);
    const monthEnd = endOfMonthCasa(refDate);

    // Sanity : the Date instant produced by startOfMonthCasa is indeed
    // the late-April UTC instant whose `.getMonth()` returns April. This
    // confirms the test reproduces the production failure mode.
    expect(monthStart.toISOString()).toBe('2026-04-30T23:00:00.000Z');
    expect(monthStart.getUTCMonth()).toBe(3); // April 0-indexed — the trap

    await revenueByCategoryProrata(monthStart, monthEnd);

    expect(mocks.cacheReadThrough).toHaveBeenCalledTimes(1);
    const [key] = mocks.cacheReadThrough.mock.calls[0];
    // The fix uses casablancaYMD(start) instead of `.getMonth()+1`, so
    // the key is built from the Casa calendar value (May = 5), not the
    // UTC runtime value (April = 4).
    expect(key).toBe('revenue:2026:5');
  });

  it('uses Casa year for the cache key at the Jan 1 / Dec 31 boundary', async () => {
    // 23:30 UTC on 31 December 2026 = 00:30 Casa on 1 January 2027. The
    // buggy `start.getFullYear()` would return 2026 on a UTC runtime
    // even though the Casa user is already in 2027.
    const newYearEve = new Date('2026-12-31T23:30:00Z');
    const monthStart = startOfMonthCasa(newYearEve);

    await revenueByCategoryProrata(monthStart, monthStart);

    const [key] = mocks.cacheReadThrough.mock.calls[0];
    expect(key).toBe('revenue:2027:1');
  });
});
