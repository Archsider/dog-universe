import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { checkFallback, _resetFallbackStore, FALLBACK_BUCKETS } from '../lru-rate-limit';

beforeEach(() => {
  _resetFallbackStore();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('checkFallback — basic limiting', () => {
  it('allows the first N requests up to the bucket cap', () => {
    const cfg = FALLBACK_BUCKETS.payment; // 6 / 60min
    for (let i = 0; i < cfg.maxRequests; i++) {
      const res = checkFallback('payment', 'user-1');
      expect(res.success).toBe(true);
      expect(res.remaining).toBe(cfg.maxRequests - i - 1);
    }
  });

  it('rejects the (N+1)-th request inside the window', () => {
    for (let i = 0; i < FALLBACK_BUCKETS.payment.maxRequests; i++) {
      checkFallback('payment', 'user-1');
    }
    const res = checkFallback('payment', 'user-1');
    expect(res.success).toBe(false);
    expect(res.remaining).toBe(0);
    expect(res.reset).toBeGreaterThan(Date.now());
  });

  it('isolates buckets — auth quota does not consume payment quota', () => {
    for (let i = 0; i < FALLBACK_BUCKETS.payment.maxRequests; i++) {
      checkFallback('payment', 'user-1');
    }
    expect(checkFallback('payment', 'user-1').success).toBe(false);
    expect(checkFallback('auth', 'user-1').success).toBe(true);
  });

  it('isolates keys within the same bucket', () => {
    for (let i = 0; i < FALLBACK_BUCKETS.payment.maxRequests; i++) {
      checkFallback('payment', 'user-1');
    }
    expect(checkFallback('payment', 'user-1').success).toBe(false);
    expect(checkFallback('payment', 'user-2').success).toBe(true);
  });
});

describe('checkFallback — sliding window expiry', () => {
  it('re-allows the bucket once the window has slid past', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-13T10:00:00Z'));
    for (let i = 0; i < FALLBACK_BUCKETS.payment.maxRequests; i++) {
      checkFallback('payment', 'user-1');
    }
    expect(checkFallback('payment', 'user-1').success).toBe(false);

    // Advance past the window (60 minutes + 1 ms).
    vi.setSystemTime(new Date('2026-05-13T11:00:01Z'));
    expect(checkFallback('payment', 'user-1').success).toBe(true);
  });

  it('partially expires — one slot freed half-way through the window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-13T10:00:00Z'));
    // Use one slot at T=0, then five at T=1 minute.
    checkFallback('auth', 'u'); // slot used at 10:00
    vi.setSystemTime(new Date('2026-05-13T10:01:00Z'));
    for (let i = 0; i < FALLBACK_BUCKETS.auth.maxRequests - 1; i++) {
      checkFallback('auth', 'u');
    }
    // Bucket is full now.
    expect(checkFallback('auth', 'u').success).toBe(false);

    // Advance just past 15 minutes from the FIRST request — the original
    // 10:00 timestamp expires, freeing one slot.
    vi.setSystemTime(new Date('2026-05-13T10:15:01Z'));
    expect(checkFallback('auth', 'u').success).toBe(true);
  });
});

describe('checkFallback — unknown bucket', () => {
  it('returns success=true for buckets not configured for fallback', () => {
    const res = checkFallback('not-a-real-bucket', 'u');
    expect(res.success).toBe(true);
    expect(res.limit).toBe(Infinity);
  });
});

describe('checkFallback — LRU eviction (cap protection)', () => {
  it('caps memory by evicting the oldest key when MAX_KEYS_PER_BUCKET is reached', () => {
    // The cap is 5000; we don't want to allocate that much in a test.
    // Instead: hammer 6000 distinct keys and verify we don't OOM AND
    // that very early keys have been forgotten.
    for (let i = 0; i < 6000; i++) {
      checkFallback('auth', `user-${i}`);
    }
    // user-0 should have been evicted; calling it again should give a
    // fresh bucket with full quota.
    const res = checkFallback('auth', 'user-0');
    expect(res.success).toBe(true);
    expect(res.remaining).toBe(FALLBACK_BUCKETS.auth.maxRequests - 1);
  });
});

describe('checkFallback — does not extend window on rate-limited retries', () => {
  it('subsequent rejected requests do not push the reset further', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-13T10:00:00Z'));
    for (let i = 0; i < FALLBACK_BUCKETS.payment.maxRequests; i++) {
      checkFallback('payment', 'u');
    }
    const firstReject = checkFallback('payment', 'u');
    vi.setSystemTime(new Date('2026-05-13T10:30:00Z'));
    const secondReject = checkFallback('payment', 'u');
    // Reset moment is anchored on the OLDEST timestamp + window — both
    // rejects must agree.
    expect(secondReject.reset).toBe(firstReject.reset);
  });
});
