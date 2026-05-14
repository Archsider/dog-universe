// Redis cache layer (Upstash REST). All helpers are fail-open: any Redis
// error → caller proceeds with the source-of-truth (DB) read so an outage
// degrades latency but never availability.
//
// SECURITY: keys for user-scoped data MUST include the userId. Never read
// a user-private cache entry whose key isn't bound to the requesting user
// — that would be classic cache-poisoning / cross-user data leak.

import * as Sentry from '@sentry/nextjs';
import { Redis } from '@upstash/redis';
import { logger } from '@/lib/logger';
import { env } from '@/lib/env';

function breadcrumb(op: string, key: string, message: string): void {
  Sentry.addBreadcrumb({
    category: 'redis',
    level: 'warning',
    message: `cache: ${message}`,
    data: { op, key },
  });
}

let cached: Redis | null | undefined;

function getRedis(): Redis | null {
  if (cached !== undefined) return cached;
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    cached = null;
    return null;
  }
  cached = new Redis({ url, token });
  return cached;
}

// ─── Atomic flag (SET NX EX) ───────────────────────────────────────────────

/**
 * Tries to atomically claim a single-use flag. Returns true if the flag was
 * acquired (caller must proceed), false if it was already set.
 *
 * Fail-open: any Redis error (or unconfigured Redis) returns true so the
 * caller behaves as if the flag was newly acquired. Acceptable trade-off
 * for non-critical guards (geofencing, idempotency hints) where missing
 * a side-effect is worse than running it twice.
 */
export async function tryAcquireFlag(key: string, ttlSeconds: number): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return true;
  try {
    const res = await redis.set(key, '1', { nx: true, ex: ttlSeconds });
    return res === 'OK';
  } catch (err) {
    breadcrumb('set-nx', key, 'tryAcquireFlag failed, failing open');
    logger.error('cache', 'tryAcquireFlag failed', { key, error: err instanceof Error ? err.message : String(err) });
    return true;
  }
}

// ─── Generic JSON helpers ──────────────────────────────────────────────────

export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get<T>(key);
    return raw ?? null;
  } catch (err) {
    breadcrumb('get', key, 'GET failed, failing open (returning null)');
    logger.error('cache', 'GET failed', { key, error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

export async function cacheSet<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(key, value, { ex: ttlSeconds });
  } catch (err) {
    breadcrumb('set', key, 'SET failed, failing open');
    logger.error('cache', 'SET failed', { key, error: err instanceof Error ? err.message : String(err) });
  }
}

export async function cacheDel(key: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(key);
  } catch (err) {
    breadcrumb('del', key, 'DEL failed, failing open');
    logger.error('cache', 'DEL failed', { key, error: err instanceof Error ? err.message : String(err) });
  }
}

// ─── Read-through helper ───────────────────────────────────────────────────

/**
 * Reads from cache; on miss, runs the loader and stores its result.
 * Loader errors propagate (we don't want to swallow real DB failures).
 */
export async function cacheReadThrough<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<T> {
  const hit = await cacheGet<T>(key);
  if (hit !== null) return hit;
  const fresh = await loader();
  await cacheSet(key, fresh, ttlSeconds);
  return fresh;
}

// ─── Key builders ──────────────────────────────────────────────────────────
// Centralised so refactors don't desync readers from invalidators.

export const CacheKeys = {
  capacityLimits: () => 'cache:capacity:limits',
  loyaltyGrade: (userId: string) => `cache:loyalty:${userId}`,
  notifCount: (userId: string) => `cache:notif:count:${userId}`,
} as const;

// ─── TTLs ──────────────────────────────────────────────────────────────────

export const CacheTTL = {
  capacityLimits: 300,    // 5 min — settings change <1×/year in practice
  loyaltyGrade: 300,      // 5 min — recomputed on booking COMPLETED
  notifCount: 30,         // 30 s — bell badge can lag briefly
} as const;

// ─── Worker heartbeat (diagnostics) ────────────────────────────────────────

/**
 * Stamps the current ISO timestamp under `worker:lastRun` (TTL 24 h) so the
 * /admin/diagnostics page can surface "last cron run" health. Fail-open: any
 * Redis error is swallowed — the worker never fails because of this signal.
 */
export async function markWorkerRun(): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set('worker:lastRun', new Date().toISOString(), { ex: 86400 });
  } catch (err) {
    breadcrumb('set', 'worker:lastRun', 'markWorkerRun failed, failing open');
    logger.error('cache', 'markWorkerRun failed', { error: err instanceof Error ? err.message : String(err) });
  }
}

/** Reads the last worker heartbeat (ISO string) or null if Redis is unconfigured/down. */
export async function getWorkerLastRun(): Promise<string | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const val = await redis.get<string>('worker:lastRun');
    return val ?? null;
  } catch (err) {
    breadcrumb('get', 'worker:lastRun', 'getWorkerLastRun failed, failing open');
    logger.error('cache', 'getWorkerLastRun failed', { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

// ─── SMS dedup metrics ─────────────────────────────────────────────────────
//
// Counter of duplicates blocked per UTC day. Bumped by `tryReserveSmsSend`
// every time it returns `false` (lost the INSERT race OR found a fresh
// row already within the dedup window). Surfaced on /admin/health so the
// operator can answer "did the dedup do anything today?".
//
// Key shape: `sms:dedup_blocked:YYYY-MM-DD`. TTL 8 days = a week of
// rolling history available for the dashboard. Fail-open: Redis errors
// never block the SMS path.

function dedupBlockedKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `sms:dedup_blocked:${y}-${m}-${d}`;
}

export async function incrDedupBlocked(): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  const key = dedupBlockedKey(new Date());
  try {
    await redis.incr(key);
    // EXPIRE is idempotent and cheap; refresh the TTL on every bump so a
    // long-running calendar day always carries its full 8-day retention.
    await redis.expire(key, 8 * 86400);
  } catch (err) {
    breadcrumb('incr', key, 'incrDedupBlocked failed, failing open');
    logger.warn('cache', 'incrDedupBlocked failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Reads the count of blocked dedup events for a given UTC day. */
export async function getDedupBlockedCount(date: Date = new Date()): Promise<number> {
  const redis = getRedis();
  if (!redis) return 0;
  try {
    const val = await redis.get<number | string>(dedupBlockedKey(date));
    if (val == null) return 0;
    const n = typeof val === 'number' ? val : Number(val);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

// ─── BullMQ enqueue freshness (R4) ─────────────────────────────────────────
//
// The `/api/workers/process` cron used to probe BullMQ on every tick
// (getJobCounts × 2 queues + Postgres count) to decide whether to spin up
// Workers, even on idle apps. We now stamp a single Redis key on every
// successful enqueue and let the worker skip the BullMQ probes when no
// enqueue has happened recently. The cron periodically forces a full
// check anyway, so stuck jobs are never starved.
//
// Both helpers are fail-open: any error returns `null` from the getter,
// which the worker interprets as "unknown → fall through to a full check".

const QUEUE_LAST_ENQUEUE_KEY = 'bullmq:lastEnqueue';
const QUEUE_LAST_FULL_CHECK_KEY = 'bullmq:lastFullCheck';

/**
 * Stamps `bullmq:lastEnqueue = now()` (TTL 1 h). Called from the BullMQ
 * enqueue helpers after a successful `queue.add` — never on fallback direct
 * send, since direct send doesn't touch BullMQ. Errors are swallowed.
 */
export async function markQueueEnqueue(): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(QUEUE_LAST_ENQUEUE_KEY, String(Date.now()), { ex: 3600 });
  } catch (err) {
    breadcrumb('set', QUEUE_LAST_ENQUEUE_KEY, 'markQueueEnqueue failed, failing open');
    logger.error('cache', 'markQueueEnqueue failed', { error: err instanceof Error ? err.message : String(err) });
  }
}

/** Reads `bullmq:lastEnqueue` as a millisecond epoch, or null if unset / unreadable. */
export async function getQueueLastEnqueueMs(): Promise<number | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const val = await redis.get<string | number>(QUEUE_LAST_ENQUEUE_KEY);
    if (val === null || val === undefined) return null;
    const n = typeof val === 'number' ? val : Number(val);
    return Number.isFinite(n) ? n : null;
  } catch (err) {
    breadcrumb('get', QUEUE_LAST_ENQUEUE_KEY, 'getQueueLastEnqueueMs failed, failing open');
    logger.error('cache', 'getQueueLastEnqueueMs failed', { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/**
 * Stamps `bullmq:lastFullCheck = now()` (TTL 2 h) so the worker can guarantee
 * at least one full BullMQ probe per hour even on a perfectly idle app.
 */
export async function markQueueFullCheck(): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(QUEUE_LAST_FULL_CHECK_KEY, String(Date.now()), { ex: 7200 });
  } catch (err) {
    breadcrumb('set', QUEUE_LAST_FULL_CHECK_KEY, 'markQueueFullCheck failed, failing open');
    logger.error('cache', 'markQueueFullCheck failed', { error: err instanceof Error ? err.message : String(err) });
  }
}

/** Reads `bullmq:lastFullCheck` as a millisecond epoch, or null if unset / unreadable. */
export async function getQueueLastFullCheckMs(): Promise<number | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const val = await redis.get<string | number>(QUEUE_LAST_FULL_CHECK_KEY);
    if (val === null || val === undefined) return null;
    const n = typeof val === 'number' ? val : Number(val);
    return Number.isFinite(n) ? n : null;
  } catch (err) {
    breadcrumb('get', QUEUE_LAST_FULL_CHECK_KEY, 'getQueueLastFullCheckMs failed, failing open');
    logger.error('cache', 'getQueueLastFullCheckMs failed', { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

// ─── Health check ──────────────────────────────────────────────────────────

/** Ping Redis with a write+read round-trip. Returns false if unconfigured or on error. */
export async function checkRedisHealth(): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  try {
    await redis.set('health:ping', '1', { ex: 30 });
    const val = await redis.get<string>('health:ping');
    return val === '1';
  } catch {
    return false;
  }
}
