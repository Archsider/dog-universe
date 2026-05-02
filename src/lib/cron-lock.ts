// Cron idempotency guard backed by Redis (Upstash).
// Prevents the same scheduled cron from doing the work twice on Vercel
// retries. The DB-level dedup queries inside each cron remain in place
// (defence in depth); this lock just avoids the wasted round-trip.
//
// Behaviour:
// - Lock key: `cron:{name}:{period}` where period is YYYY-MM-DD for daily,
//   YYYY-Www for weekly crons (ISO week year + week number), or YYYY-MM for
//   monthly crons.
// - SET NX EX: atomic — first caller wins, subsequent callers in the same
//   period get false back.
// - Fail-open: if Redis is unconfigured or unreachable, returns true so
//   the cron still runs. Better a missed lock than a missed reminder; the
//   per-row dedup inside each cron prevents user-visible duplicates.
import { Redis } from '@upstash/redis';
import { getISOWeek, getISOWeekYear } from 'date-fns';
import { env } from '@/lib/env';

export type CronPeriod = 'daily' | 'weekly' | 'monthly';

let cachedRedis: Redis | null | undefined;

function getRedis(): Redis | null {
  if (cachedRedis !== undefined) return cachedRedis;
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    cachedRedis = null;
    return null;
  }
  cachedRedis = new Redis({ url, token });
  return cachedRedis;
}

export function periodKey(period: CronPeriod, now: Date = new Date()): string {
  if (period === 'weekly') {
    const week = String(getISOWeek(now)).padStart(2, '0');
    return `${getISOWeekYear(now)}-W${week}`;
  }
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Tries to acquire the lock for `name` on the current period.
 * Returns true if this caller should proceed, false if another caller
 * already ran the cron in the same period.
 */
export async function acquireCronLock(
  name: string,
  ttlSeconds: number,
  period: CronPeriod = 'daily',
): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return true; // fail-open: no Redis configured (dev / misconfig)

  const key = `cron:${name}:${periodKey(period)}`;
  try {
    const result = await redis.set(key, '1', { nx: true, ex: ttlSeconds });
    // Upstash returns 'OK' when set succeeded, null when NX prevented the write.
    return result === 'OK';
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', service: 'cron-lock', message: 'Redis SET failed, failing open', key, error: err instanceof Error ? err.message : String(err), timestamp: new Date().toISOString() }));
    return true;
  }
}
