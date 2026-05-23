// Loyalty grade — server-only cache layer.
//
// The pure logic (thresholds, label maps, calculateSuggestedGrade) lives in
// `loyalty.ts` and is safe to import from client components. Anything that
// touches Prisma or Redis lives here so it never gets bundled to the browser.
import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { cacheReadThrough, cacheDel, CacheKeys, CacheTTL } from './cache';
import { toNumber } from './decimal';
import type { Grade } from './loyalty';

type PrismaLike = typeof prisma | Prisma.TransactionClient;

/**
 * Lifetime revenue for a client, on the CASH basis (Sémantique B) — the input
 * to `calculateSuggestedGrade` for the revenue-based PLATINUM threshold.
 *
 * Sums `Payment.amount` across the client's invoices (net of refunds, includes
 * partial payments), plus the migrated `historicalSpendMAD`. Excludes invoices
 * attached to a soft-deleted booking; bookingless invoices (walk-in / manual
 * product sales) ARE counted — they're real cash.
 *
 * Replaces the old `SUM(PAID Invoice.amount)` which used the BILLED total and
 * diverged from the cash basis used everywhere else (could grant PLATINUM on
 * money that was invoiced but never collected, or miss partial collections).
 */
export async function computeClientCashCollected(
  client: PrismaLike,
  clientId: string,
  historicalSpendMAD: Prisma.Decimal | number | null | undefined,
): Promise<number> {
  const agg = await client.payment.aggregate({
    _sum: { amount: true },
    where: {
      invoice: {
        clientId,
        OR: [{ bookingId: null }, { booking: { deletedAt: null } }],
      },
    },
  });
  return toNumber(agg._sum.amount) + toNumber(historicalSpendMAD);
}

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
