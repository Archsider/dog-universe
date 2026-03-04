// Dog Universe — Loyalty system
// Grades: MEMBER → SILVER → GOLD → PLATINUM
// Criteria: 24-month rolling window, nights OR points
// Points: 10 pts/boarding night · 15 pts/grooming · 10 pts/transport
// BRONZE is kept as an alias for MEMBER (backward compatibility)

export type Grade = 'MEMBER' | 'SILVER' | 'GOLD' | 'PLATINUM';

export const POINTS_PER_SERVICE = {
  BOARDING_PER_NIGHT: 10,
  GROOMING: 15,
  PET_TAXI: 10,
} as const;

export const GRADE_THRESHOLDS: Record<Grade, { nights: number; points: number }> = {
  MEMBER:   { nights: 0,   points: 0 },
  SILVER:   { nights: 40,  points: 500 },
  GOLD:     { nights: 90,  points: 1500 },
  PLATINUM: { nights: 160, points: 3000 },
};

export type ClaimableBenefitKey = 'VET_CHECKUP' | 'PET_TRANSPORT' | 'BIRTHDAY_SURPRISE';

export const CLAIMABLE_BENEFIT_META: Record<ClaimableBenefitKey, {
  minGrade: Grade;
  /** Max allowed APPROVED claims per calendar year, per grade */
  quotaByGrade: Partial<Record<Grade, number>>;
  labelFr: string;
  labelEn: string;
}> = {
  VET_CHECKUP: {
    minGrade: 'SILVER',
    quotaByGrade: { SILVER: 1, GOLD: 1, PLATINUM: 1 },
    labelFr: '1 check-up vétérinaire offert par an',
    labelEn: '1 complimentary vet check-up per year',
  },
  PET_TRANSPORT: {
    minGrade: 'GOLD',
    quotaByGrade: { GOLD: 1, PLATINUM: 2 },
    labelFr: 'Transport animalier offert par an',
    labelEn: 'Complimentary pet transport per year',
  },
  BIRTHDAY_SURPRISE: {
    minGrade: 'PLATINUM',
    quotaByGrade: { PLATINUM: 1 },
    labelFr: 'Surprise anniversaire annuelle pour votre animal',
    labelEn: 'Annual birthday surprise for your pet',
  },
};

export type GradeBenefit = { textFr: string; textEn: string; claimKey?: ClaimableBenefitKey };

export const GRADE_BENEFITS: Record<Grade, GradeBenefit[]> = {
  MEMBER: [],
  SILVER: [
    { textFr: 'Priorité sur les demandes de réservation',         textEn: 'Priority on booking requests' },
    { textFr: '1 check-up vétérinaire offert par an',             textEn: '1 complimentary vet check-up per year',         claimKey: 'VET_CHECKUP' },
  ],
  GOLD: [
    { textFr: '-10% sur les séances de toilettage',               textEn: '-10% on all grooming sessions' },
    { textFr: '1 transport animalier offert par an',              textEn: '1 complimentary pet transport per year',         claimKey: 'PET_TRANSPORT' },
    { textFr: 'Réservation anticipée haute saison',               textEn: 'Early access to peak season booking' },
  ],
  PLATINUM: [
    { textFr: '-15% sur les séances de toilettage',               textEn: '-15% on all grooming sessions' },
    { textFr: '2 transports animaliers offerts par an',           textEn: '2 complimentary pet transports per year',        claimKey: 'PET_TRANSPORT' },
    { textFr: 'Check-in prioritaire à chaque séjour',             textEn: 'Priority check-in for every stay' },
    { textFr: 'Surprise anniversaire annuelle pour votre animal', textEn: 'Annual birthday surprise for your pet',          claimKey: 'BIRTHDAY_SURPRISE' },
  ],
};

/** Normalize grade — treat BRONZE as MEMBER */
export function normalizeGrade(grade: string): Grade {
  if (grade === 'BRONZE') return 'MEMBER';
  if (['MEMBER', 'SILVER', 'GOLD', 'PLATINUM'].includes(grade)) return grade as Grade;
  return 'MEMBER';
}

/** Compute the grade from rolling 24-month stats */
export function computeGradeFromStats(nights: number, points: number): Grade {
  if (nights >= GRADE_THRESHOLDS.PLATINUM.nights || points >= GRADE_THRESHOLDS.PLATINUM.points) return 'PLATINUM';
  if (nights >= GRADE_THRESHOLDS.GOLD.nights     || points >= GRADE_THRESHOLDS.GOLD.points)     return 'GOLD';
  if (nights >= GRADE_THRESHOLDS.SILVER.nights   || points >= GRADE_THRESHOLDS.SILVER.points)   return 'SILVER';
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
  pointsNeeded: number;
}

export function getProgressToNext(nights: number, points: number, currentGrade: Grade): LoyaltyProgress {
  const next = getNextGrade(currentGrade);
  if (!next) return { percent: 100, nightsNeeded: 0, pointsNeeded: 0 };

  const cur = GRADE_THRESHOLDS[currentGrade];
  const tgt = GRADE_THRESHOLDS[next];

  const nightsRange = tgt.nights - cur.nights;
  const pointsRange = tgt.points - cur.points;
  const nightsPct   = nightsRange > 0 ? Math.min(100, Math.round(((nights - cur.nights) / nightsRange) * 100)) : 0;
  const pointsPct   = pointsRange > 0 ? Math.min(100, Math.round(((points - cur.points) / pointsRange) * 100)) : 0;

  return {
    percent:      Math.max(0, Math.max(nightsPct, pointsPct)),
    nightsNeeded: Math.max(0, tgt.nights - nights),
    pointsNeeded: Math.max(0, tgt.points - points),
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
