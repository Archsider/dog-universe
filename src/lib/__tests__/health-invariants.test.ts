import { vi, describe, it, expect, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCronLastRun: vi.fn(),
  prisma: {
    invoice: { findMany: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));

vi.mock('@/lib/observability', () => ({
  getCronLastRun: mocks.getCronLastRun,
  // CRON_NAMES isn't used by the functions we test here.
  CRON_NAMES: [],
}));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
// Bug A : `getMonthlyInvoicesWhere` is no longer imported by
// `checkJsVsMvCurrentMonth` (the JS path now mirrors the MV's source
// CTE directly). The mock stays for any other consumer that might
// import it through the test surface, but is now unused.
vi.mock('@/lib/billing', () => ({
  getMonthlyInvoicesWhere: vi.fn(() => ({ OR: [] })),
}));
vi.mock('@/lib/accounting', () => ({
  computeMonthlyRevenueByCategory: vi.fn(() => ({
    boarding: 0, taxi: 0, grooming: 0, croquettes: 0, other: 0,
  })),
}));
vi.mock('@/lib/dates-casablanca', () => ({
  // Recreate the Bug-A-timezone production hazard in the mock : the Date
  // returned by startOfMonthCasa for May is timestamped at 23:00 UTC the
  // last day of April. Calling `.getMonth()` on it on a UTC runtime gives
  // 3 (April). The fix in src/lib/health-invariants.ts uses
  // `currentMonthCasa()` (also mocked here) to bypass that hazard.
  startOfMonthCasa: () => new Date('2026-04-30T23:00:00Z'),
  endOfMonthCasa: () => new Date('2026-05-31T22:59:59.999Z'),
  currentMonthCasa: () => ({ year: 2026, month: 5 }),
}));

import {
  checkMonthlyRevenueMvFresh,
  checkJsVsMvCurrentMonth,
  checkItemAllocatedOverflow,
} from '../health-invariants';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('checkMonthlyRevenueMvFresh — Redis-based freshness probe', () => {
  it('returns count=0 when last_run is within the 2h window', async () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    mocks.getCronLastRun.mockResolvedValue(oneHourAgo);
    const r = await checkMonthlyRevenueMvFresh();
    expect(r.key).toBe('mv_refresh_stale');
    expect(r.count).toBe(0);
    expect(r.severity).toBe('critical');
  });

  it('returns count=1 when last_run is older than 2h', async () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    mocks.getCronLastRun.mockResolvedValue(threeHoursAgo);
    const r = await checkMonthlyRevenueMvFresh();
    expect(r.count).toBe(1);
    expect(r.sample[0]).toMatchObject({ ageHours: expect.any(Number), thresholdHours: 2 });
  });

  it('returns count=1 when last_run is missing (Redis empty)', async () => {
    mocks.getCronLastRun.mockResolvedValue(null);
    const r = await checkMonthlyRevenueMvFresh();
    expect(r.count).toBe(1);
    expect(r.sample[0]).toMatchObject({ reason: expect.stringContaining('cron:last_run') });
  });

  it('passes exactly at the 2h boundary (1h59min → ok)', async () => {
    // Just-under: 119 minutes (< 2h) → still fresh.
    const justUnder = new Date(Date.now() - 119 * 60 * 1000).toISOString();
    mocks.getCronLastRun.mockResolvedValue(justUnder);
    const r = await checkMonthlyRevenueMvFresh();
    expect(r.count).toBe(0);
  });
});

describe('checkJsVsMvCurrentMonth — JS vs MV parity', () => {
  it('returns count=0 when JS and MV agree exactly', async () => {
    mocks.prisma.invoice.findMany.mockResolvedValue([]);
    mocks.prisma.$queryRaw.mockResolvedValue([]);
    const r = await checkJsVsMvCurrentMonth();
    expect(r.key).toBe('js_vs_mv_current_month');
    expect(r.count).toBe(0);
  });

  it('returns count=N for each category with a > 0.01 MAD divergence', async () => {
    // JS path returns 100 grooming for a fake invoice
    mocks.prisma.invoice.findMany.mockResolvedValue([
      {
        items: [{ category: 'GROOMING', description: 'x', total: 100 }],
        payments: [{ amount: 100, paymentDate: new Date() }],
      },
    ]);
    const { computeMonthlyRevenueByCategory } = await import('@/lib/accounting');
    vi.mocked(computeMonthlyRevenueByCategory).mockReturnValue({
      boarding: 0, taxi: 0, grooming: 100, croquettes: 0, other: 0,
    });
    // MV path returns 50 grooming → 50 MAD divergence on grooming
    mocks.prisma.$queryRaw.mockResolvedValue([{ category: 'GROOMING', total: '50' }]);
    const r = await checkJsVsMvCurrentMonth();
    expect(r.count).toBe(1);
    expect(r.sample[0]).toMatchObject({ category: 'grooming', js: 100, mv: 50, diff: 50 });
  });

  it('absorbs sub-centime drift (Decimal rounding) without alerting', async () => {
    mocks.prisma.invoice.findMany.mockResolvedValue([]);
    const { computeMonthlyRevenueByCategory } = await import('@/lib/accounting');
    vi.mocked(computeMonthlyRevenueByCategory).mockReturnValue({
      boarding: 0, taxi: 0, grooming: 0, croquettes: 0, other: 0,
    });
    // 0.005 MAD drift below the 0.01 tolerance
    mocks.prisma.$queryRaw.mockResolvedValue([{ category: 'BOARDING', total: '0.005' }]);
    const r = await checkJsVsMvCurrentMonth();
    expect(r.count).toBe(0);
  });

  it('skips gracefully when monthly_revenue_mv does not exist (fresh DB)', async () => {
    mocks.prisma.invoice.findMany.mockResolvedValue([]);
    mocks.prisma.$queryRaw.mockRejectedValue(new Error('relation "monthly_revenue_mv" does not exist'));
    const r = await checkJsVsMvCurrentMonth();
    expect(r.count).toBe(0);
    expect(r.sample[0]).toMatchObject({ note: expect.stringContaining('unavailable') });
  });

  // ───────────────────────────────────────────────────────────────────────
  // Bug A : the JS path must mirror the MV's source CTE exactly. Both
  // sides exclude CANCELLED invoices and scope by Payment-in-window
  // (no booking-derived path). These tests pin that contract.
  // ───────────────────────────────────────────────────────────────────────

  it('JS query filters status != CANCELLED and payments.some in window (Bug A)', async () => {
    mocks.prisma.invoice.findMany.mockResolvedValue([]);
    mocks.prisma.$queryRaw.mockResolvedValue([]);
    await checkJsVsMvCurrentMonth();
    expect(mocks.prisma.invoice.findMany).toHaveBeenCalledTimes(1);
    const where = mocks.prisma.invoice.findMany.mock.calls[0][0].where;
    // Must exclude CANCELLED invoices (parity with MV's CTE).
    expect(where.status).toEqual({ not: 'CANCELLED' });
    // Must scope by at least one payment in the current month — same as
    // the MV's WHERE clause + closed_invoices gate semantic.
    expect(where.payments).toEqual({
      some: { paymentDate: { gte: expect.any(Date), lte: expect.any(Date) } },
    });
    // Must NOT use the `getMonthlyInvoicesWhere` OR-union path. After
    // Bug A, the JS where clause is exactly { status, payments } — no
    // booking-derived branch.
    expect(where).not.toHaveProperty('OR');
    expect(where).not.toHaveProperty('booking');
  });

  it('CANCELLED full-paid invoice does not contribute to JS (Bug A)', async () => {
    // The new `findMany` filter excludes CANCELLED rows server-side,
    // so the mock returns [] when the helper queries for the month.
    // Same row is also excluded from the MV by the parallel migration
    // (20260516_revenue_mv_skip_cancelled), so MV returns [] too. No
    // divergence flagged.
    mocks.prisma.invoice.findMany.mockResolvedValue([]);
    mocks.prisma.$queryRaw.mockResolvedValue([]);
    const r = await checkJsVsMvCurrentMonth();
    expect(r.count).toBe(0);
    expect(r.sample).toEqual([]);
  });

  it('MV query uses Casa-anchored year/month, not getMonth() of monthStart (TZ bug regression)', async () => {
    // Reproduces the production failure mode : on a UTC runtime,
    // `monthStart` from startOfMonthCasa() is 2026-04-30T23:00Z and its
    // `.getMonth()` returns 3 (April). Before this fix the invariant
    // queried MV for (year=2026, month=4) but JS ran for May, producing
    // a permanent false-positive divergence flag.
    //
    // After the fix, the MV-side year/month come from `currentMonthCasa()`
    // (mocked to return { year: 2026, month: 5 }) and the raw SQL is
    // parameterized with those values.
    mocks.prisma.invoice.findMany.mockResolvedValue([]);
    mocks.prisma.$queryRaw.mockResolvedValue([]);
    await checkJsVsMvCurrentMonth();
    // tagged-template call shape : [stringsArray, ...interpolatedValues]
    // Find the call that targets `monthly_revenue_mv` (sample/count/MV).
    const mvCall = mocks.prisma.$queryRaw.mock.calls.find(
      (c: unknown[]) => Array.isArray(c[0]) && (c[0] as string[]).join(' ').includes('monthly_revenue_mv'),
    );
    expect(mvCall, 'MV query was issued').toBeTruthy();
    const [, year, month] = mvCall!;
    expect(year).toBe(2026);
    expect(month).toBe(5); // ← was 4 (April) before the fix
  });
});

describe('checkItemAllocatedOverflow — DISCOUNT exclusion (Bug B)', () => {
  it('SQL keeps the `total > 0` guard on both sample and count queries', async () => {
    mocks.prisma.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ c: BigInt(0) }]);
    await checkItemAllocatedOverflow();
    expect(mocks.prisma.$queryRaw).toHaveBeenCalledTimes(2);
    // tagged-template first arg is the TemplateStringsArray — join the
    // pieces to inspect the raw SQL the function actually issued.
    const sqlSample = mocks.prisma.$queryRaw.mock.calls[0][0].join(' ');
    const sqlCount = mocks.prisma.$queryRaw.mock.calls[1][0].join(' ');
    expect(sqlSample).toMatch(/total > 0/);
    expect(sqlCount).toMatch(/total > 0/);
  });

  it('does NOT flag DISCOUNT items (total=-150, allocatedAmount=0)', async () => {
    // Server-side filter excludes negative-total rows before they reach
    // the application — mocks the WHERE-clause-filtered result.
    mocks.prisma.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ c: BigInt(0) }]);
    const r = await checkItemAllocatedOverflow();
    expect(r.key).toBe('item_allocated_overflow');
    expect(r.count).toBe(0);
    expect(r.sample).toEqual([]);
    expect(r.severity).toBe('critical');
  });

  it('still flags real overflows (total=100, allocatedAmount=150.50)', async () => {
    mocks.prisma.$queryRaw
      .mockResolvedValueOnce([
        { id: 'item-real-bug', invoiceId: 'inv-x', total: '100', allocatedAmount: '150.5' },
      ])
      .mockResolvedValueOnce([{ c: BigInt(1) }]);
    const r = await checkItemAllocatedOverflow();
    expect(r.count).toBe(1);
    expect(r.sample[0]).toMatchObject({
      id: 'item-real-bug',
      total: '100',
      allocatedAmount: '150.5',
    });
  });

  it('returns count=0 when SUM rows are empty (no items at all)', async () => {
    mocks.prisma.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const r = await checkItemAllocatedOverflow();
    expect(r.count).toBe(0);
  });
});
