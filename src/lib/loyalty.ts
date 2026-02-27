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
