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
import {
  checkMonthlyRevenueMvFresh,
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

// `checkJsVsMvCurrentMonth` was removed 2026-05-17 — see
// CLAUDE.md DETTE TECHNIQUE. The 9-test block (parity contract, TZ
// regression, CANCELLED exclusion) is preserved in git history at
// commit 22521bf if a future invariant needs the same pattern.

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
