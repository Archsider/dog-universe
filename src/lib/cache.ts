// Redis cache layer (Upstash REST). All helpers are fail-open: any Redis
// error → caller proceeds with the source-of-truth (DB) read so an outage
// degrades latency but never availability.
//
// SECURITY: keys for user-scoped data MUST include the userId. Never read
// a user-private cache entry whose key isn't bound to the requesting user
// — that would be classic cache-poisoning / cross-user data leak.

import { Redis } from '@upstash/redis';

let cached: Redis | null | undefined;

function getRedis(): Redis | null {
  if (cached !== undefined) return cached;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    cached = null;
    return null;
  }
  cached = new Redis({ url, token });
  return cached;
}

// ─── Generic JSON helpers ──────────────────────────────────────────────────

export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get<T>(key);
    return raw ?? null;
  } catch (err) {
    console.error(`[cache] GET ${key} failed:`, err);
    return null;
  }
}

export async function cacheSet<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(key, value, { ex: ttlSeconds });
  } catch (err) {
    console.error(`[cache] SET ${key} failed:`, err);
  }
}

export async function cacheDel(key: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(key);
  } catch (err) {
    console.error(`[cache] DEL ${key} failed:`, err);
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
