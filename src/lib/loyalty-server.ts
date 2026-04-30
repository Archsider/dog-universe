// Loyalty grade — server-only cache layer.
//
// The pure logic (thresholds, label maps, calculateSuggestedGrade) lives in
// `loyalty.ts` and is safe to import from client components. Anything that
// touches Prisma or Redis lives here so it never gets bundled to the browser.
import { prisma } from './prisma';
import { cacheReadThrough, cacheDel, CacheKeys, CacheTTL } from './cache';
import type { Grade } from './loyalty';

interface LoyaltyGradeCacheEntry {
  grade: Grade;
  isOverride: boolean;
}

/**
 * Reads the user's current loyalty grade from cache (5 min TTL) or the DB.
 * Returns null when no LoyaltyGrade row exists for the user yet.
 */
export async function getLoyaltyGrade(userId: string): Promise<LoyaltyGradeCacheEntry | null> {
  return cacheReadThrough<LoyaltyGradeCacheEntry | null>(
    CacheKeys.loyaltyGrade(userId),
    CacheTTL.loyaltyGrade,
    async () => {
      const row = await prisma.loyaltyGrade.findUnique({
        where: { clientId: userId },
        select: { grade: true, isOverride: true },
      });
      return row ? { grade: row.grade as Grade, isOverride: row.isOverride } : null;
    },
  );
}

/** Invalidate after any LoyaltyGrade mutation (upsert, override, etc). */
export async function invalidateLoyaltyCache(userId: string): Promise<void> {
  await cacheDel(CacheKeys.loyaltyGrade(userId));
}
