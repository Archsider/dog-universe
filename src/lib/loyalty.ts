// Loyalty grade calculation for Dog Universe

export type Grade = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';

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

export function getGradeOrder(grade: Grade): number {
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
  labelFr: string;
  labelEn: string;
}

export const GRADE_BENEFITS: Record<Grade, GradeBenefit[]> = {
  BRONZE: [],
  SILVER: [
    { labelFr: 'Priorité de réservation', labelEn: 'Booking priority' },
    { labelFr: '5% de réduction sur le toilettage', labelEn: '5% grooming discount' },
  ],
  GOLD: [
    { labelFr: 'Priorité de réservation', labelEn: 'Booking priority' },
    { labelFr: '10% de réduction sur le toilettage', labelEn: '10% grooming discount' },
    { labelFr: '1 séance de toilettage offerte / an', labelEn: '1 free grooming session / year' },
    { labelFr: '2 trajets Pet Taxi offerts / an', labelEn: '2 free Pet Taxi rides / year' },
  ],
  PLATINUM: [
    { labelFr: 'Priorité absolue de réservation', labelEn: 'Absolute booking priority' },
    { labelFr: '15% de réduction sur le toilettage', labelEn: '15% grooming discount' },
    { labelFr: '2 séances de toilettage offertes / an', labelEn: '2 free grooming sessions / year' },
    { labelFr: '3 trajets Pet Taxi offerts / an', labelEn: '3 free Pet Taxi rides / year' },
    { labelFr: 'Assistance vétérinaire prioritaire', labelEn: 'Priority veterinary assistance' },
  ],
};

export interface NextGradeInfo {
  nextGrade: Grade | null;
  staysToNext: number;
  currentStays: number;
  progressPercent: number; // 0-100
}

export function getNextGradeInfo(totalStays: number): NextGradeInfo {
  if (totalStays >= STAY_THRESHOLDS.PLATINUM.min) {
    return { nextGrade: null, staysToNext: 0, currentStays: totalStays, progressPercent: 100 };
  }
  if (totalStays >= STAY_THRESHOLDS.GOLD.min) {
    const staysToNext = STAY_THRESHOLDS.PLATINUM.min - totalStays;
    const progress = Math.round(((totalStays - STAY_THRESHOLDS.GOLD.min) / (STAY_THRESHOLDS.PLATINUM.min - STAY_THRESHOLDS.GOLD.min)) * 100);
    return { nextGrade: 'PLATINUM', staysToNext, currentStays: totalStays, progressPercent: Math.min(progress, 99) };
  }
  if (totalStays >= STAY_THRESHOLDS.SILVER.min) {
    const staysToNext = STAY_THRESHOLDS.GOLD.min - totalStays;
    const progress = Math.round(((totalStays - STAY_THRESHOLDS.SILVER.min) / (STAY_THRESHOLDS.GOLD.min - STAY_THRESHOLDS.SILVER.min)) * 100);
    return { nextGrade: 'GOLD', staysToNext, currentStays: totalStays, progressPercent: Math.min(progress, 99) };
  }
  const staysToNext = STAY_THRESHOLDS.SILVER.min - totalStays;
  const progress = Math.round((totalStays / STAY_THRESHOLDS.SILVER.min) * 100);
  return { nextGrade: 'SILVER', staysToNext, currentStays: totalStays, progressPercent: Math.min(progress, 99) };
}
