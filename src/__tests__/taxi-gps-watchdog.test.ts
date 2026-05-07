import { describe, it, expect } from 'vitest';
import {
  shouldRestartWatch,
  shouldRestartSse,
  pruneQueue,
  clampQueue,
  gpsHealthFor,
  sseHealthFor,
  WATCH_LOST_MS,
  WATCH_STALE_MS,
  SSE_LOST_MS,
  SSE_STALE_MS,
  QUEUE_MAX,
  QUEUE_MAX_AGE_MS,
} from '@/lib/taxi-gps';

describe('shouldRestartWatch', () => {
  it('returns false when fix is recent', () => {
    const now = 1_000_000;
    expect(shouldRestartWatch(now - 10_000, now)).toBe(false);
  });

  it('returns false at exactly the threshold', () => {
    const now = 1_000_000;
    expect(shouldRestartWatch(now - WATCH_LOST_MS, now)).toBe(false);
  });

  it('returns true past the threshold', () => {
    const now = 1_000_000;
    expect(shouldRestartWatch(now - WATCH_LOST_MS - 1, now)).toBe(true);
  });
});

describe('shouldRestartSse', () => {
  it('returns false when last event is recent', () => {
    const now = 5_000_000;
    expect(shouldRestartSse(now - 30_000, now)).toBe(false);
  });

  it('returns true past 90s', () => {
    const now = 5_000_000;
    expect(shouldRestartSse(now - SSE_LOST_MS - 1, now)).toBe(true);
  });
});

describe('pruneQueue', () => {
  it('keeps recent items', () => {
    const now = 100_000;
    const items = [{ ts: now - 1_000 }, { ts: now - 5_000 }];
    expect(pruneQueue(items, QUEUE_MAX_AGE_MS, now)).toHaveLength(2);
  });

  it('drops items older than maxAge', () => {
    const now = 1_000_000;
    const items = [
      { ts: now - QUEUE_MAX_AGE_MS - 1 }, // obsolète
      { ts: now - 1_000 },                // frais
    ];
    const out = pruneQueue(items, QUEUE_MAX_AGE_MS, now);
    expect(out).toHaveLength(1);
    expect(out[0]?.ts).toBe(now - 1_000);
  });

  it('returns empty when all are obsolete', () => {
    const now = 1_000_000;
    const items = [{ ts: 0 }, { ts: 100 }];
    expect(pruneQueue(items, QUEUE_MAX_AGE_MS, now)).toEqual([]);
  });
});

describe('clampQueue', () => {
  it('passes through under cap', () => {
    expect(clampQueue([1, 2, 3], 100)).toEqual([1, 2, 3]);
  });

  it('keeps the most recent (FIFO drop oldest)', () => {
    const arr = Array.from({ length: QUEUE_MAX + 5 }, (_, i) => i);
    const out = clampQueue(arr, QUEUE_MAX);
    expect(out).toHaveLength(QUEUE_MAX);
    expect(out[0]).toBe(5);
    expect(out[out.length - 1]).toBe(QUEUE_MAX + 4);
  });
});

describe('gpsHealthFor', () => {
  it('live for fresh fix', () => {
    const now = 1_000_000;
    expect(gpsHealthFor(now - 1_000, now)).toBe('live');
  });

  it('stale between WATCH_STALE_MS and WATCH_LOST_MS', () => {
    const now = 1_000_000;
    expect(gpsHealthFor(now - WATCH_STALE_MS - 1, now)).toBe('stale');
  });

  it('lost past WATCH_LOST_MS', () => {
    const now = 1_000_000;
    expect(gpsHealthFor(now - WATCH_LOST_MS - 1, now)).toBe('lost');
  });
});

describe('sseHealthFor', () => {
  it('live when fresh', () => {
    const now = 1_000_000;
    expect(sseHealthFor(now - 1_000, now)).toBe('live');
  });

  it('stale past SSE_STALE_MS', () => {
    const now = 1_000_000;
    expect(sseHealthFor(now - SSE_STALE_MS - 1, now)).toBe('stale');
  });

  it('lost past SSE_LOST_MS', () => {
    const now = 1_000_000;
    expect(sseHealthFor(now - SSE_LOST_MS - 1, now)).toBe('lost');
  });
});
