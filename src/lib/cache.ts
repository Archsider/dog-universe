// Redis cache layer (Upstash REST). All helpers are fail-open: any Redis
// error → caller proceeds with the source-of-truth (DB) read so an outage
// degrades latency but never availability.
//
// SECURITY: keys for user-scoped data MUST include the userId. Never read
// a user-private cache entry whose key isn't bound to the requesting user
// — that would be classic cache-poisoning / cross-user data leak.

import * as Sentry from '@sentry/nextjs';
import { Redis } from '@upstash/redis';
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
    console.error(JSON.stringify({ level: 'error', service: 'cache', message: 'tryAcquireFlag failed', key, error: err instanceof Error ? err.message : String(err), timestamp: new Date().toISOString() }));
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
    console.error(JSON.stringify({ level: 'error', service: 'cache', message: 'GET failed', key, error: err instanceof Error ? err.message : String(err), timestamp: new Date().toISOString() }));
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
    console.error(JSON.stringify({ level: 'error', service: 'cache', message: 'SET failed', key, error: err instanceof Error ? err.message : String(err), timestamp: new Date().toISOString() }));
  }
}

export async function cacheDel(key: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(key);
  } catch (err) {
    breadcrumb('del', key, 'DEL failed, failing open');
    console.error(JSON.stringify({ level: 'error', service: 'cache', message: 'DEL failed', key, error: err instanceof Error ? err.message : String(err), timestamp: new Date().toISOString() }));
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
    console.error(JSON.stringify({ level: 'error', service: 'cache', message: 'markWorkerRun failed', error: err instanceof Error ? err.message : String(err), timestamp: new Date().toISOString() }));
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
    console.error(JSON.stringify({ level: 'error', service: 'cache', message: 'getWorkerLastRun failed', error: err instanceof Error ? err.message : String(err), timestamp: new Date().toISOString() }));
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
