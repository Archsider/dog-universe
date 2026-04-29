// Loyalty grade calculation for Dog Universe
import { Redis } from '@upstash/redis';
import { prisma } from '@/lib/prisma';

export type Grade = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';

// ── Redis cache for LoyaltyGrade reads ───────────────────────────────────────

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
const CACHE_TTL = 300; // 5 minutes

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

// Auto-suggestion thresholds (based on number of stays)
// Note: Manual override by admin is always possible
// Internal calculation rules are NOT shown to clients
const STAY_THRESHOLDS = {
  BRONZE: { min: 1, max: 3 },
  SILVER: { min: 4, max: 9 },
  GOLD: { min: 10, max: 19 },
  PLATINUM: { min: 20, max: Infinity },
};

const REVENUE_THRESHOLD_PLATINUM = 5000 * 11; // 5000 EUR ≈ 55,000 MAD (approx)

export function calculateSuggestedGrade(
  totalStays: number,
  totalRevenueMAD: number
): Grade {
  // Platinum: 20+ stays OR total revenue > 5000 EUR
  if (totalStays >= STAY_THRESHOLDS.PLATINUM.min || totalRevenueMAD >= REVENUE_THRESHOLD_PLATINUM) {
    return 'PLATINUM';
  }
  if (totalStays >= STAY_THRESHOLDS.GOLD.min) {
    return 'GOLD';
  }
  if (totalStays >= STAY_THRESHOLDS.SILVER.min) {
    return 'SILVER';
  }
  return 'BRONZE';
}

export function getGradeLabel(grade: Grade, locale: string = 'fr'): string {
  const labels: Record<Grade, Record<string, string>> = {
    BRONZE: { fr: 'Bronze', en: 'Bronze' },
    SILVER: { fr: 'Argent', en: 'Silver' },
    GOLD: { fr: 'Or', en: 'Gold' },
    PLATINUM: { fr: 'Platine', en: 'Platinum' },
  };
  return labels[grade][locale] ?? labels[grade]['fr'];
}

// Internal helper — non exporté (utilisé seulement par isUpgrade ci-dessous)
function getGradeOrder(grade: Grade): number {
  const orders: Record<Grade, number> = {
    BRONZE: 1,
    SILVER: 2,
    GOLD: 3,
    PLATINUM: 4,
  };
  return orders[grade];
}

export function isUpgrade(oldGrade: Grade, newGrade: Grade): boolean {
  return getGradeOrder(newGrade) > getGradeOrder(oldGrade);
}

export const ALL_GRADES: Grade[] = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM'];

export interface GradeBenefit {
  key: string;       // unique identifier for claiming
  labelFr: string;
  labelEn: string;
  claimable: boolean; // false = automatic perk (booking priority), true = can be manually claimed
}

export const GRADE_BENEFITS: Record<Grade, GradeBenefit[]> = {
  BRONZE: [],
  SILVER: [
    { key: 'booking_priority', labelFr: 'Priorité de réservation', labelEn: 'Booking priority', claimable: false },
    { key: 'grooming_discount_5', labelFr: '5% de réduction sur le toilettage', labelEn: '5% grooming discount', claimable: true },
  ],
  GOLD: [
    { key: 'booking_priority', labelFr: 'Priorité de réservation', labelEn: 'Booking priority', claimable: false },
    { key: 'grooming_discount_10', labelFr: '10% de réduction sur le toilettage', labelEn: '10% grooming discount', claimable: true },
    { key: 'free_grooming', labelFr: '1 séance de toilettage offerte / an', labelEn: '1 free grooming session / year', claimable: true },
    { key: 'free_taxi_2', labelFr: '2 trajets Pet Taxi offerts / an', labelEn: '2 free Pet Taxi rides / year', claimable: true },
  ],
  PLATINUM: [
    { key: 'booking_priority_absolute', labelFr: 'Priorité absolue de réservation', labelEn: 'Absolute booking priority', claimable: false },
    { key: 'grooming_discount_15', labelFr: '15% de réduction sur le toilettage', labelEn: '15% grooming discount', claimable: true },
    { key: 'free_grooming_2', labelFr: '2 séances de toilettage offertes / an', labelEn: '2 free grooming sessions / year', claimable: true },
    { key: 'free_taxi_3', labelFr: '3 trajets Pet Taxi offerts / an', labelEn: '3 free Pet Taxi rides / year', claimable: true },
    { key: 'vet_priority', labelFr: 'Assistance vétérinaire prioritaire', labelEn: 'Priority veterinary assistance', claimable: true },
  ],
};

export interface NextGradeInfo {
  nextGrade: Grade | null;
  staysToNext: number;
  currentStays: number;
  progressPercent: number; // 0-100
}

export function getNextGradeInfo(totalStays: number, currentGrade?: Grade): NextGradeInfo {
  // If the actual grade (including manual overrides) is PLATINUM → max level
  if (currentGrade === 'PLATINUM' || totalStays >= STAY_THRESHOLDS.PLATINUM.min) {
    return { nextGrade: null, staysToNext: 0, currentStays: totalStays, progressPercent: 100 };
  }
  // Progress is always computed toward the grade above the current actual grade
  if (currentGrade === 'GOLD' || totalStays >= STAY_THRESHOLDS.GOLD.min) {
    const staysToNext = STAY_THRESHOLDS.PLATINUM.min - totalStays;
    const progress = Math.round(((totalStays - STAY_THRESHOLDS.GOLD.min) / (STAY_THRESHOLDS.PLATINUM.min - STAY_THRESHOLDS.GOLD.min)) * 100);
    return { nextGrade: 'PLATINUM', staysToNext, currentStays: totalStays, progressPercent: Math.min(Math.max(progress, 0), 99) };
  }
  if (currentGrade === 'SILVER' || totalStays >= STAY_THRESHOLDS.SILVER.min) {
    const staysToNext = STAY_THRESHOLDS.GOLD.min - totalStays;
    const progress = Math.round(((totalStays - STAY_THRESHOLDS.SILVER.min) / (STAY_THRESHOLDS.GOLD.min - STAY_THRESHOLDS.SILVER.min)) * 100);
    return { nextGrade: 'GOLD', staysToNext, currentStays: totalStays, progressPercent: Math.min(Math.max(progress, 0), 99) };
  }
  const staysToNext = STAY_THRESHOLDS.SILVER.min - totalStays;
  const progress = Math.round((totalStays / STAY_THRESHOLDS.SILVER.min) * 100);
  return { nextGrade: 'SILVER', staysToNext, currentStays: totalStays, progressPercent: Math.min(Math.max(progress, 0), 99) };
}
