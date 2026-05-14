// Slow-query monitor — Redis-backed ring buffer of the most recent slow
// Prisma queries. Surfaced on /admin/health so the operator can spot a
// regression (eg. a missing index, an N+1 burst) WITHOUT having to dig
// into Vercel logs or Sentry traces.
//
// Why Redis (not in-memory):
//   Vercel Lambda is per-instance; a slow query observed in instance A
//   would never reach the /admin/health request hitting instance B. Redis
//   is shared so the surface is consistent.
//
// Storage: LIST `slow:queries` capped at MAX_ENTRIES via LPUSH + LTRIM.
// Each entry is a JSON-encoded SlowQueryEntry. TTL on the key is renewed
// on every write so it never expires while there's traffic.

import { Redis } from '@upstash/redis';
import * as Sentry from '@sentry/nextjs';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

/**
 * A query is "slow" above this threshold. Tuned to catch joins / large
 * aggregates without flooding the buffer with normal index-served reads.
 * Bump if the buffer fills up too fast in normal traffic.
 */
export const SLOW_QUERY_THRESHOLD_MS = 500;

const KEY = 'slow:queries';
const MAX_ENTRIES = 50;
const TTL_SECONDS = 7 * 24 * 3600; // 7 days

export interface SlowQueryEntry {
  at: string;       // ISO timestamp
  durationMs: number;
  sql: string;      // truncated to 500 chars upstream
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

/**
 * Push a slow query to the Redis ring buffer + add a Sentry breadcrumb so
 * it shows up in the request transaction. Fail-open: any Redis error is
 * swallowed (we never block the route on monitor I/O).
 */
export async function recordSlowQuery(entry: Omit<SlowQueryEntry, 'at'>): Promise<void> {
  const full: SlowQueryEntry = { at: new Date().toISOString(), ...entry };

  Sentry.addBreadcrumb({
    category: 'db.slow-query',
    level: 'warning',
    message: `Slow query (${entry.durationMs}ms)`,
    data: { sql: entry.sql, durationMs: entry.durationMs },
  });

  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.lpush(KEY, JSON.stringify(full));
    await redis.ltrim(KEY, 0, MAX_ENTRIES - 1);
    await redis.expire(KEY, TTL_SECONDS);
  } catch (err) {
    logger.warn('slow-query-monitor', 'recordSlowQuery failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Read the current ring buffer (newest first). Returns [] if Redis is
 * unconfigured/down — the /admin/health page interprets that as "no data
 * available" instead of "no slow queries".
 */
export async function getRecentSlowQueries(): Promise<SlowQueryEntry[]> {
  const redis = getRedis();
  if (!redis) return [];
  try {
    const raw = await redis.lrange<string | SlowQueryEntry>(KEY, 0, MAX_ENTRIES - 1);
    return raw
      .map((r) => {
        if (typeof r === 'object' && r !== null) return r as SlowQueryEntry;
        try {
          return JSON.parse(r as string) as SlowQueryEntry;
        } catch {
          return null;
        }
      })
      .filter((e): e is SlowQueryEntry => e !== null);
  } catch (err) {
    logger.warn('slow-query-monitor', 'getRecentSlowQueries failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * Aggregate stats over the buffer — useful for the dashboard health card.
 * Returns null when the buffer is empty.
 */
export interface SlowQueryStats {
  count: number;
  newest: string;        // ISO timestamp of most recent slow query
  maxDurationMs: number;
  avgDurationMs: number;
}

export async function getSlowQueryStats(): Promise<SlowQueryStats | null> {
  const entries = await getRecentSlowQueries();
  if (entries.length === 0) return null;
  const total = entries.reduce((s, e) => s + e.durationMs, 0);
  const max = entries.reduce((m, e) => Math.max(m, e.durationMs), 0);
  return {
    count: entries.length,
    newest: entries[0].at,
    maxDurationMs: max,
    avgDurationMs: Math.round(total / entries.length),
  };
}
