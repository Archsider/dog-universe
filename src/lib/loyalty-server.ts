import { Redis } from '@upstash/redis';
import { prisma } from '@/lib/prisma';
import type { Grade } from '@/lib/loyalty';

let _redis: Redis | null | undefined;

function getRedis(): Redis | null {
  if (_redis !== undefined) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) { _redis = null; return null; }
  _redis = new Redis({ url, token });
  return _redis;
}

const loyaltyCacheKey = (userId: string) => `cache:loyalty:${userId}`;
const CACHE_TTL = 300;

export interface CachedLoyaltyGrade {
  grade: Grade;
  isOverride: boolean;
}

/** Reads a client's LoyaltyGrade from Redis cache, falling back to DB. */
export async function getLoyaltyGrade(userId: string): Promise<CachedLoyaltyGrade | null> {
  const redis = getRedis();
  if (redis) {
    try {
      const cached = await redis.get<CachedLoyaltyGrade | string>(loyaltyCacheKey(userId));
      if (cached != null) {
        const parsed = typeof cached === 'string'
          ? (JSON.parse(cached) as CachedLoyaltyGrade)
          : cached;
        if (parsed?.grade) return parsed;
      }
    } catch {
      // Redis down — fall through to DB
    }
  }

  try {
    const row = await prisma.loyaltyGrade.findUnique({ where: { clientId: userId } });
    if (!row) return null;
    const result: CachedLoyaltyGrade = {
      grade: row.grade as Grade,
      isOverride: row.isOverride,
    };
    if (redis) {
      redis
        .set(loyaltyCacheKey(userId), JSON.stringify(result), { ex: CACHE_TTL })
        .catch(() => {});
    }
    return result;
  } catch {
    return null;
  }
}

/** Invalidates the loyalty cache for a user. Call after any LoyaltyGrade upsert. */
export async function invalidateLoyaltyCache(userId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(loyaltyCacheKey(userId));
  } catch {
    // Non-critical
  }
}
