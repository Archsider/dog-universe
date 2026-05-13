// In-memory sliding-window rate limiter — used as a defense-in-depth
// fallback when Upstash Redis is unreachable or replies with malformed
// payloads. Without this layer, an Upstash latency spike forces the
// middleware into "fail-closed" mode and rejects every legitimate
// request for the duration of the outage.
//
// Trade-offs vs. Redis-backed limiter:
//   - State is per-Lambda-instance (Vercel can have hundreds in parallel).
//     A user could in theory get N × limit total across instances. Acceptable
//     because (a) we only fall back when Upstash is down — a transient
//     window — and (b) Vercel re-uses warm Lambdas heavily, so the spread
//     is in practice closer to 5–20×, not 100×.
//   - Process restarts wipe state. Acceptable for the same reason.
//   - No persistence across regions. Acceptable.
//
// Behaviour: per (bucket, key) pair we track timestamps within a window.
// Pruning happens lazily on every check. Map size is capped per bucket
// to avoid unbounded growth under attack — when the cap is reached, the
// oldest key is evicted (LRU).

const MAX_KEYS_PER_BUCKET = 5000;

interface BucketConfig {
  maxRequests: number;
  windowMs: number;
}

// Mirror the Upstash buckets we want to protect during an outage.
// Numbers tuned to the same per-IP / per-userId scale as the Redis bucket
// so behaviour is consistent — slightly looser since we may double-count
// across instances. A ~20 % overshoot is the safer trade-off.
export const FALLBACK_BUCKETS: Record<string, BucketConfig> = {
  auth:               { maxRequests: 12, windowMs: 15 * 60_000 },   // 10/15min ×1.2
  totp:               { maxRequests: 12, windowMs: 15 * 60_000 },
  passwordReset:      { maxRequests: 6,  windowMs: 60 * 60_000 },
  bookings:           { maxRequests: 24, windowMs: 60 * 60_000 },
  uploads:            { maxRequests: 36, windowMs: 60 * 60_000 },
  adminMutation:      { maxRequests: 360, windowMs: 60 * 60_000 },
  taxiStream:         { maxRequests: 72, windowMs: 60 * 60_000 },
  taxiTracking:       { maxRequests: 720, windowMs: 60 * 60_000 },
  rgpd:               { maxRequests: 6,  windowMs: 60 * 60_000 },
  addonRequest:       { maxRequests: 12, windowMs: 60 * 60_000 },
  payment:            { maxRequests: 6,  windowMs: 60 * 60_000 },
  invoiceCreate:      { maxRequests: 24, windowMs: 60 * 60_000 },
  vaccinationExtract: { maxRequests: 12, windowMs: 60 * 60_000 },
  productOrder:       { maxRequests: 36, windowMs: 60 * 60_000 },
  geocode:            { maxRequests: 36, windowMs: 60 * 60_000 },
};

// bucket → key → array of timestamps (ms). LRU eviction by Map iteration order.
const stores: Map<string, Map<string, number[]>> = new Map();

function getStore(bucket: string): Map<string, number[]> {
  let s = stores.get(bucket);
  if (!s) {
    s = new Map();
    stores.set(bucket, s);
  }
  return s;
}

export interface FallbackResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number; // Date.now() + windowMs at next reset
}

/**
 * Check whether the (bucket, key) pair may proceed under the in-memory
 * fallback limit. If the bucket is unknown, returns success=true (no
 * configured fallback for that bucket — the caller chose its own policy).
 */
export function checkFallback(bucket: string, key: string): FallbackResult {
  const cfg = FALLBACK_BUCKETS[bucket];
  if (!cfg) {
    return { success: true, limit: Infinity, remaining: Infinity, reset: 0 };
  }
  const store = getStore(bucket);
  const now = Date.now();
  const windowStart = now - cfg.windowMs;

  // LRU eviction: if we're at cap and the key is new, drop the first
  // (oldest-touched) entry. Map iteration order is insertion order, so
  // the first key was either inserted longest ago OR not re-touched
  // recently — either way safe to drop.
  if (!store.has(key) && store.size >= MAX_KEYS_PER_BUCKET) {
    const oldestKey = store.keys().next().value;
    if (oldestKey !== undefined) store.delete(oldestKey);
  }

  // Promote on access: delete-then-set keeps Map iteration order so the
  // most recently used key is last (and the first key is genuinely the
  // least recently used).
  const existing = store.get(key) ?? [];
  store.delete(key);

  // Prune timestamps outside the sliding window.
  const fresh = existing.filter((ts) => ts > windowStart);

  if (fresh.length >= cfg.maxRequests) {
    // Rate-limited. Re-store without adding the new timestamp so retries
    // don't extend the window further than they should.
    store.set(key, fresh);
    const oldestInWindow = fresh[0] ?? now;
    return {
      success: false,
      limit: cfg.maxRequests,
      remaining: 0,
      reset: oldestInWindow + cfg.windowMs,
    };
  }

  fresh.push(now);
  store.set(key, fresh);
  return {
    success: true,
    limit: cfg.maxRequests,
    remaining: cfg.maxRequests - fresh.length,
    reset: now + cfg.windowMs,
  };
}

/**
 * Test-only helper — wipes all in-memory state. NOT exported via index;
 * import directly from this file in tests.
 */
export function _resetFallbackStore(): void {
  stores.clear();
}
