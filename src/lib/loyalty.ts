// Dog Universe — Loyalty system
// Grades: MEMBER → SILVER → GOLD → PLATINUM
// Criteria: 24-month rolling window, nights OR amount (MAD)
// BRONZE is kept as an alias for MEMBER (backward compatibility)

export type Grade = 'MEMBER' | 'SILVER' | 'GOLD' | 'PLATINUM';

export const GRADE_THRESHOLDS: Record<Grade, { nights: number; amount: number }> = {
  MEMBER:   { nights: 0,   amount: 0 },
  SILVER:   { nights: 40,  amount: 10000 },
  GOLD:     { nights: 90,  amount: 25000 },
  PLATINUM: { nights: 160, amount: 40000 },
};

export type GradeBenefit = { textFr: string; textEn: string };

export const GRADE_BENEFITS: Record<Grade, GradeBenefit[]> = {
  MEMBER: [],
  SILVER: [
    { textFr: 'Priorité sur les demandes de réservation',         textEn: 'Priority on booking requests' },
    { textFr: '1 check-up vétérinaire offert par an',             textEn: '1 complimentary vet check-up per year' },
  ],
  GOLD: [
    { textFr: '-10% sur les séances de toilettage',               textEn: '-10% on all grooming sessions' },
    { textFr: '1 transport animalier offert par an',              textEn: '1 complimentary pet transport per year' },
    { textFr: 'Réservation anticipée haute saison',               textEn: 'Early access to peak season booking' },
  ],
  PLATINUM: [
    { textFr: '-15% sur les séances de toilettage',               textEn: '-15% on all grooming sessions' },
    { textFr: '2 transports animaliers offerts par an',           textEn: '2 complimentary pet transports per year' },
    { textFr: 'Check-in prioritaire à chaque séjour',             textEn: 'Priority check-in for every stay' },
    { textFr: 'Surprise anniversaire annuelle pour votre animal', textEn: 'Annual birthday surprise for your pet' },
  ],
};

/** Normalize grade — treat BRONZE as MEMBER */
export function normalizeGrade(grade: string): Grade {
  if (grade === 'BRONZE') return 'MEMBER';
  if (['MEMBER', 'SILVER', 'GOLD', 'PLATINUM'].includes(grade)) return grade as Grade;
  return 'MEMBER';
}

/** Compute the grade from rolling 24-month stats */
export function computeGradeFromStats(nights: number, amount: number): Grade {
  if (nights >= GRADE_THRESHOLDS.PLATINUM.nights || amount >= GRADE_THRESHOLDS.PLATINUM.amount) return 'PLATINUM';
  if (nights >= GRADE_THRESHOLDS.GOLD.nights     || amount >= GRADE_THRESHOLDS.GOLD.amount)     return 'GOLD';
  if (nights >= GRADE_THRESHOLDS.SILVER.nights   || amount >= GRADE_THRESHOLDS.SILVER.amount)   return 'SILVER';
  return 'MEMBER';
}

export function getGradeOrder(grade: string): number {
  const map: Record<string, number> = { MEMBER: 1, BRONZE: 1, SILVER: 2, GOLD: 3, PLATINUM: 4 };
  return map[grade] ?? 1;
}

export function isUpgrade(oldGrade: string, newGrade: string): boolean {
  return getGradeOrder(newGrade) > getGradeOrder(oldGrade);
}

export function getNextGrade(grade: Grade): Grade | null {
  const next: Record<Grade, Grade | null> = { MEMBER: 'SILVER', SILVER: 'GOLD', GOLD: 'PLATINUM', PLATINUM: null };
  return next[grade];
}

export interface LoyaltyProgress {
  percent: number;
  nightsNeeded: number;
  amountNeeded: number;
}

export function getProgressToNext(nights: number, amount: number, currentGrade: Grade): LoyaltyProgress {
  const next = getNextGrade(currentGrade);
  if (!next) return { percent: 100, nightsNeeded: 0, amountNeeded: 0 };

  const cur = GRADE_THRESHOLDS[currentGrade];
  const tgt = GRADE_THRESHOLDS[next];

  const nightsRange = tgt.nights - cur.nights;
  const amountRange = tgt.amount - cur.amount;
  const nightsPct   = nightsRange > 0 ? Math.min(100, Math.round(((nights - cur.nights) / nightsRange) * 100)) : 0;
  const amountPct   = amountRange > 0 ? Math.min(100, Math.round(((amount - cur.amount) / amountRange) * 100)) : 0;

  return {
    percent:      Math.max(0, Math.max(nightsPct, amountPct)),
    nightsNeeded: Math.max(0, tgt.nights - nights),
    amountNeeded: Math.max(0, tgt.amount - amount),
  };
}

export function getGradeLabel(grade: string, locale: string = 'fr'): string {
  const labels: Record<string, Record<string, string>> = {
    MEMBER:   { fr: 'Member',  en: 'Member' },
    BRONZE:   { fr: 'Member',  en: 'Member' },
    SILVER:   { fr: 'Silver',  en: 'Silver' },
    GOLD:     { fr: 'Gold',    en: 'Gold' },
    PLATINUM: { fr: 'Platine', en: 'Platinum' },
  };
  return labels[grade]?.[locale] ?? labels[grade]?.['fr'] ?? grade;
}

export const ALL_GRADES: Grade[] = ['MEMBER', 'SILVER', 'GOLD', 'PLATINUM'];
