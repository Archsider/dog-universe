// RGPD helpers — daily export rate limit + active-booking blocker for
// account anonymization. Backed by Upstash Redis (REST). Fail-open : if
// Redis is missing/down, the rate limit is skipped (we'd rather let the
// user exercise their RGPD right than block them silently).
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

export const EXPORT_DAILY_LIMIT = 3;

const exportKey = (userId: string, day: string) => `rgpd:export:${userId}:${day}`;

function todayKey(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Increments the daily export counter for `userId`. Returns:
 *  - { ok: true, remaining }  when under the limit (counter incremented)
 *  - { ok: false, retryAfterSeconds } when the limit has been hit
 *  - { ok: true, remaining: EXPORT_DAILY_LIMIT - 1 } when Redis is down
 *    (fail-open: better to honor a RGPD right than block on infra). */
export async function consumeExportSlot(
  userId: string,
): Promise<{ ok: true; remaining: number } | { ok: false; retryAfterSeconds: number }> {
  const redis = getRedis();
  if (!redis) return { ok: true, remaining: EXPORT_DAILY_LIMIT - 1 };
  const key = exportKey(userId, todayKey());
  try {
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, 86400);
    }
    if (count > EXPORT_DAILY_LIMIT) {
      const ttl = await redis.ttl(key);
      return { ok: false, retryAfterSeconds: ttl > 0 ? ttl : 86400 };
    }
    return { ok: true, remaining: Math.max(0, EXPORT_DAILY_LIMIT - count) };
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', service: 'rgpd', message: 'consumeExportSlot failed, failing open', error: err instanceof Error ? err.message : String(err), timestamp: new Date().toISOString() }));
    return { ok: true, remaining: EXPORT_DAILY_LIMIT - 1 };
  }
}
