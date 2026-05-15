import { vi, describe, it, expect, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  cacheDel: vi.fn(),
  tryAcquireFlag: vi.fn(),
  getCronLastRun: vi.fn(),
}));

vi.mock('@/lib/cache', () => ({
  cacheGet: mocks.cacheGet,
  cacheSet: mocks.cacheSet,
  cacheDel: mocks.cacheDel,
  tryAcquireFlag: mocks.tryAcquireFlag,
}));

// We expose a smaller CRON_NAMES list to make the tests deterministic — the
// classifier just iterates over it. The real list (in observability.ts) is
// longer but the contract under test is the same.
vi.mock('@/lib/observability', () => ({
  CRON_NAMES: ['reminders', 'purge-anonymized', 'db-backup'],
  getCronLastRun: mocks.getCronLastRun,
}));

import { classifyCronFreshness, STALENESS_THRESHOLD_HOURS } from '../cron-freshness';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cacheGet.mockResolvedValue(null);
  mocks.cacheSet.mockResolvedValue(undefined);
  mocks.cacheDel.mockResolvedValue(undefined);
  mocks.tryAcquireFlag.mockResolvedValue(true);
  mocks.getCronLastRun.mockResolvedValue(null);
});

describe('classifyCronFreshness — happy path: every cron has run recently', () => {
  it('marks every row stale=false, anchorStampedNow=false, clears stale anchors', async () => {
    mocks.getCronLastRun.mockResolvedValue('2026-05-15T10:00:00Z');
    const rows = await classifyCronFreshness(new Date('2026-05-15T12:00:00Z'));
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.stale === false)).toBe(true);
    expect(rows.every((r) => r.anchorStampedNow === false)).toBe(true);
    expect(rows.every((r) => r.lastRun === '2026-05-15T10:00:00Z')).toBe(true);
    // Defensive: clears the anchor even if the cron is now healthy (in case
    // a previous run had stamped one).
    expect(mocks.cacheDel).toHaveBeenCalledTimes(3);
    expect(mocks.cacheDel).toHaveBeenCalledWith('cron:first-seen:reminders');
    expect(mocks.cacheDel).toHaveBeenCalledWith('cron:first-seen:purge-anonymized');
    expect(mocks.cacheDel).toHaveBeenCalledWith('cron:first-seen:db-backup');
    expect(mocks.tryAcquireFlag).not.toHaveBeenCalled();
  });
});

describe('classifyCronFreshness — first observation of a never-run cron', () => {
  it('stamps the anchor and does NOT alert yet', async () => {
    mocks.getCronLastRun.mockResolvedValue(null);
    mocks.cacheGet.mockResolvedValue(null); // no anchor yet
    const now = new Date('2026-05-15T12:00:00Z');
    const rows = await classifyCronFreshness(now);

    expect(rows.every((r) => r.anchorStampedNow === true)).toBe(true);
    expect(rows.every((r) => r.firstSeen === now.toISOString())).toBe(true);
    expect(rows.every((r) => r.stale === false)).toBe(true);
    // Anchor was set for all 3 crons. cacheSet TTL must be the 90j value
    // (consistent with cron:last_run TTL — anchors must outlive the longest
    // possible cron period or we'd loop forever on a monthly cron).
    expect(mocks.cacheSet).toHaveBeenCalledTimes(3);
    for (const call of mocks.cacheSet.mock.calls) {
      expect(call[0]).toMatch(/^cron:first-seen:/);
      expect(call[1]).toBe(now.toISOString());
      expect(call[2]).toBe(90 * 24 * 3600);
    }
    // tryAcquireFlag never called — we don't dedup-flag the first observation.
    expect(mocks.tryAcquireFlag).not.toHaveBeenCalled();
  });
});

describe('classifyCronFreshness — anchor exists but below threshold', () => {
  it(`stale=false at ${STALENESS_THRESHOLD_HOURS - 1}h since first observation`, async () => {
    const now = new Date('2026-05-15T12:00:00Z');
    const anchor = new Date(now.getTime() - (STALENESS_THRESHOLD_HOURS - 1) * 3_600_000).toISOString();
    mocks.cacheGet.mockResolvedValue(anchor);

    const rows = await classifyCronFreshness(now);
    expect(rows.every((r) => r.stale === false)).toBe(true);
    // Anchor stayed put (no re-stamp).
    expect(mocks.cacheSet).not.toHaveBeenCalled();
    expect(mocks.tryAcquireFlag).not.toHaveBeenCalled();
  });
});

describe('classifyCronFreshness — anchor crosses the staleness threshold', () => {
  it(`alerts at ${STALENESS_THRESHOLD_HOURS}h exact (boundary)`, async () => {
    const now = new Date('2026-05-15T12:00:00Z');
    const anchor = new Date(now.getTime() - STALENESS_THRESHOLD_HOURS * 3_600_000).toISOString();
    mocks.cacheGet.mockResolvedValue(anchor);
    mocks.tryAcquireFlag.mockResolvedValue(true);

    const rows = await classifyCronFreshness(now);
    expect(rows.every((r) => r.stale === true)).toBe(true);
    // The dedup flag is acquired with 24h TTL.
    expect(mocks.tryAcquireFlag).toHaveBeenCalledTimes(3);
    for (const call of mocks.tryAcquireFlag.mock.calls) {
      expect(call[0]).toMatch(/^cron:first-seen-alert:/);
      expect(call[1]).toBe(24 * 3600);
    }
  });

  it('does NOT re-alert when the dedup flag is already set', async () => {
    const now = new Date('2026-05-15T12:00:00Z');
    const anchor = new Date(now.getTime() - 100 * 3_600_000).toISOString(); // way past
    mocks.cacheGet.mockResolvedValue(anchor);
    mocks.tryAcquireFlag.mockResolvedValue(false); // dedup says NO

    const rows = await classifyCronFreshness(now);
    expect(rows.every((r) => r.stale === false)).toBe(true);
    // We still attempted to claim the flag (rate-limit gate).
    expect(mocks.tryAcquireFlag).toHaveBeenCalledTimes(3);
  });
});

describe('classifyCronFreshness — mixed state across crons', () => {
  it('handles per-row state independently', async () => {
    const now = new Date('2026-05-15T12:00:00Z');
    // reminders: ran 1h ago → healthy
    // purge-anonymized: never ran, anchor is 60h old → stale
    // db-backup: never ran, anchor is 2h old → not yet stale
    mocks.getCronLastRun.mockImplementation(async (name: string) => {
      if (name === 'reminders') return '2026-05-15T11:00:00Z';
      return null;
    });
    mocks.cacheGet.mockImplementation(async (key: string) => {
      if (key === 'cron:first-seen:purge-anonymized') {
        return new Date(now.getTime() - 60 * 3_600_000).toISOString();
      }
      if (key === 'cron:first-seen:db-backup') {
        return new Date(now.getTime() - 2 * 3_600_000).toISOString();
      }
      return null;
    });
    mocks.tryAcquireFlag.mockResolvedValue(true);

    const rows = await classifyCronFreshness(now);
    const byName = new Map(rows.map((r) => [r.name, r]));

    expect(byName.get('reminders')!.stale).toBe(false);
    expect(byName.get('reminders')!.lastRun).toBe('2026-05-15T11:00:00Z');
    expect(byName.get('reminders')!.firstSeen).toBeNull();

    expect(byName.get('purge-anonymized')!.stale).toBe(true);
    expect(byName.get('purge-anonymized')!.anchorStampedNow).toBe(false);

    expect(byName.get('db-backup')!.stale).toBe(false);
    expect(byName.get('db-backup')!.anchorStampedNow).toBe(false);
  });
});

describe('classifyCronFreshness — fail-open on Redis hiccups', () => {
  it('does not crash if cacheSet throws (anchor stamp fails)', async () => {
    mocks.getCronLastRun.mockResolvedValue(null);
    mocks.cacheGet.mockResolvedValue(null);
    mocks.cacheSet.mockRejectedValue(new Error('redis down'));

    await expect(classifyCronFreshness(new Date())).resolves.not.toThrow();
  });
});
