import { describe, it, expect } from 'vitest';

// Tests des fonctions pures de src/lib/loyalty.ts
//
// HORS SCOPE de ce fichier (logique appartenant aux callers, pas a loyalty.ts) :
// - Override admin (isOverride) : logique dans allocatePayments (payments.ts)
// - Periode glissante 24 mois : applique par les API routes qui appellent
//   calculateSuggestedGrade (filtrage des bookings COMPLETED)
// - historicalStays + historicalSpendMAD : sommes par le caller avant
//   d appeler calculateSuggestedGrade. La fonction recoit deja le total.

import {
  calculateSuggestedGrade,
  getGradeLabel,
  isUpgrade,
  getNextGradeInfo,
  GRADE_BENEFITS,
  ALL_GRADES,
  type Grade,
} from '../lib/loyalty';

// ---------------------------------------------------------------------------
// calculateSuggestedGrade — seuils par nombre de sejours
// ---------------------------------------------------------------------------
describe('calculateSuggestedGrade — niveau BRONZE', () => {
  it('0 sejour, 0 MAD — BRONZE par defaut', () => {
    expect(calculateSuggestedGrade(0, 0)).toBe('BRONZE');
  });

  it('1 sejour — BRONZE', () => {
    expect(calculateSuggestedGrade(1, 0)).toBe('BRONZE');
  });

  it('3 sejours — BRONZE (limite haute)', () => {
    expect(calculateSuggestedGrade(3, 0)).toBe('BRONZE');
  });
});

describe('calculateSuggestedGrade — niveau SILVER', () => {
  it('4 sejours — SILVER (limite basse)', () => {
    expect(calculateSuggestedGrade(4, 0)).toBe('SILVER');
  });

  it('5 sejours — SILVER', () => {
    expect(calculateSuggestedGrade(5, 0)).toBe('SILVER');
  });

  it('9 sejours — SILVER (limite haute)', () => {
    expect(calculateSuggestedGrade(9, 0)).toBe('SILVER');
  });
});

describe('calculateSuggestedGrade — niveau GOLD', () => {
  it('10 sejours — GOLD (limite basse)', () => {
    expect(calculateSuggestedGrade(10, 0)).toBe('GOLD');
  });

  it('15 sejours — GOLD', () => {
    expect(calculateSuggestedGrade(15, 0)).toBe('GOLD');
  });

  it('19 sejours — GOLD (limite haute)', () => {
    expect(calculateSuggestedGrade(19, 0)).toBe('GOLD');
  });
});

describe('calculateSuggestedGrade — niveau PLATINUM', () => {
  it('20 sejours — PLATINUM (limite basse)', () => {
    expect(calculateSuggestedGrade(20, 0)).toBe('PLATINUM');
  });

  it('50 sejours — PLATINUM', () => {
    expect(calculateSuggestedGrade(50, 0)).toBe('PLATINUM');
  });

  it('1000 sejours — toujours PLATINUM (pas de cap superieur)', () => {
    expect(calculateSuggestedGrade(1000, 0)).toBe('PLATINUM');
  });
});

describe('calculateSuggestedGrade — PLATINUM via revenu', () => {
  it('0 sejour + exactement 55000 MAD — PLATINUM (limite revenu)', () => {
    expect(calculateSuggestedGrade(0, 55000)).toBe('PLATINUM');
  });

  it('0 sejour + 54999 MAD — BRONZE (sous le seuil revenu)', () => {
    expect(calculateSuggestedGrade(0, 54999)).toBe('BRONZE');
  });

  it('0 sejour + 100000 MAD — PLATINUM (revenu largement au-dessus)', () => {
    expect(calculateSuggestedGrade(0, 100000)).toBe('PLATINUM');
  });

  it('5 sejours (SILVER par sejours) + 55000 MAD — PLATINUM par revenu', () => {
    expect(calculateSuggestedGrade(5, 55000)).toBe('PLATINUM');
  });

  it('15 sejours (GOLD par sejours) + 60000 MAD — PLATINUM par revenu', () => {
    expect(calculateSuggestedGrade(15, 60000)).toBe('PLATINUM');
  });

  it('21 sejours + 0 MAD — PLATINUM par sejours seuls', () => {
    expect(calculateSuggestedGrade(21, 0)).toBe('PLATINUM');
  });
});

describe('calculateSuggestedGrade — cas limites', () => {
  it('exactement 4 sejours — SILVER (transition BRONZE -> SILVER)', () => {
    expect(calculateSuggestedGrade(4, 0)).toBe('SILVER');
  });

  it('exactement 10 sejours — GOLD (transition SILVER -> GOLD)', () => {
    expect(calculateSuggestedGrade(10, 0)).toBe('GOLD');
  });

  it('exactement 20 sejours — PLATINUM (transition GOLD -> PLATINUM)', () => {
    expect(calculateSuggestedGrade(20, 0)).toBe('PLATINUM');
  });

  it('exactement 55000 MAD — PLATINUM (limite revenu inclusive)', () => {
    expect(calculateSuggestedGrade(0, 55000)).toBe('PLATINUM');
  });
});

// ---------------------------------------------------------------------------
// getGradeLabel — traduction FR / EN
// ---------------------------------------------------------------------------
describe('getGradeLabel', () => {
  it('BRONZE en francais', () => {
    expect(getGradeLabel('BRONZE', 'fr')).toBe('Bronze');
  });

  it('SILVER en francais — Argent', () => {
    expect(getGradeLabel('SILVER', 'fr')).toBe('Argent');
  });

  it('GOLD en francais — Or', () => {
    expect(getGradeLabel('GOLD', 'fr')).toBe('Or');
  });

  it('PLATINUM en francais — Platine', () => {
    expect(getGradeLabel('PLATINUM', 'fr')).toBe('Platine');
  });

  it('GOLD en anglais — Gold', () => {
    expect(getGradeLabel('GOLD', 'en')).toBe('Gold');
  });

  it('PLATINUM en anglais — Platinum', () => {
    expect(getGradeLabel('PLATINUM', 'en')).toBe('Platinum');
  });

  it('locale par defaut = francais', () => {
    expect(getGradeLabel('SILVER')).toBe('Argent');
  });

  it('locale inconnue — fallback francais', () => {
    expect(getGradeLabel('GOLD', 'es')).toBe('Or');
  });
});

// ---------------------------------------------------------------------------
// isUpgrade
// ---------------------------------------------------------------------------
describe('isUpgrade', () => {
  it('BRONZE -> SILVER — upgrade', () => {
    expect(isUpgrade('BRONZE', 'SILVER')).toBe(true);
  });

  it('SILVER -> GOLD — upgrade', () => {
    expect(isUpgrade('SILVER', 'GOLD')).toBe(true);
  });

  it('GOLD -> PLATINUM — upgrade', () => {
    expect(isUpgrade('GOLD', 'PLATINUM')).toBe(true);
  });

  it('BRONZE -> PLATINUM — upgrade (saut de grades)', () => {
    expect(isUpgrade('BRONZE', 'PLATINUM')).toBe(true);
  });

  it('SILVER -> BRONZE — downgrade (false)', () => {
    expect(isUpgrade('SILVER', 'BRONZE')).toBe(false);
  });

  it('PLATINUM -> GOLD — downgrade (false)', () => {
    expect(isUpgrade('PLATINUM', 'GOLD')).toBe(false);
  });

  it('SILVER -> SILVER — meme grade, pas un upgrade', () => {
    expect(isUpgrade('SILVER', 'SILVER')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getNextGradeInfo
// ---------------------------------------------------------------------------
describe('getNextGradeInfo', () => {
  it('0 sejour — prochain grade SILVER, 4 sejours restants', () => {
    const info = getNextGradeInfo(0);
    expect(info.nextGrade).toBe('SILVER');
    expect(info.staysToNext).toBe(4);
    expect(info.currentStays).toBe(0);
  });

  it('4 sejours (SILVER atteint) — prochain grade GOLD, 6 sejours restants', () => {
    const info = getNextGradeInfo(4);
    expect(info.nextGrade).toBe('GOLD');
    expect(info.staysToNext).toBe(6);
  });

  it('10 sejours (GOLD atteint) — prochain grade PLATINUM, 10 sejours restants', () => {
    const info = getNextGradeInfo(10);
    expect(info.nextGrade).toBe('PLATINUM');
    expect(info.staysToNext).toBe(10);
  });

  it('20 sejours (PLATINUM atteint) — pas de prochain grade, progress 100', () => {
    const info = getNextGradeInfo(20);
    expect(info.nextGrade).toBeNull();
    expect(info.progressPercent).toBe(100);
  });

  it('currentGrade = PLATINUM (override admin) — pas de prochain grade', () => {
    const info = getNextGradeInfo(5, 'PLATINUM');
    expect(info.nextGrade).toBeNull();
    expect(info.progressPercent).toBe(100);
  });

  it('progressPercent toujours entre 0 et 100', () => {
    [0, 1, 4, 9, 10, 19, 20, 50].forEach(stays => {
      const info = getNextGradeInfo(stays);
      expect(info.progressPercent).toBeGreaterThanOrEqual(0);
      expect(info.progressPercent).toBeLessThanOrEqual(100);
    });
  });

  it('staysToNext toujours positif ou zero', () => {
    [0, 1, 4, 9, 10, 19, 20, 50].forEach(stays => {
      const info = getNextGradeInfo(stays);
      expect(info.staysToNext).toBeGreaterThanOrEqual(0);
    });
  });
});

// ---------------------------------------------------------------------------
// GRADE_BENEFITS — structure (claimable vs automatique)
// ---------------------------------------------------------------------------
describe('GRADE_BENEFITS', () => {
  it('BRONZE — aucun avantage', () => {
    expect(GRADE_BENEFITS.BRONZE).toHaveLength(0);
  });

  it('SILVER — au moins 2 avantages', () => {
    expect(GRADE_BENEFITS.SILVER.length).toBeGreaterThanOrEqual(2);
  });

  it('SILVER — booking_priority est automatique (claimable false)', () => {
    const priority = GRADE_BENEFITS.SILVER.find(b => b.key === 'booking_priority');
    expect(priority).toBeDefined();
    expect(priority!.claimable).toBe(false);
  });

  it('SILVER — grooming_discount_5 est reclamable (claimable true)', () => {
    const discount = GRADE_BENEFITS.SILVER.find(b => b.key === 'grooming_discount_5');
    expect(discount).toBeDefined();
    expect(discount!.claimable).toBe(true);
  });

  it('GOLD — strictement plus avantages que SILVER', () => {
    expect(GRADE_BENEFITS.GOLD.length).toBeGreaterThan(GRADE_BENEFITS.SILVER.length);
  });

  it('PLATINUM — strictement plus avantages que GOLD', () => {
    expect(GRADE_BENEFITS.PLATINUM.length).toBeGreaterThan(GRADE_BENEFITS.GOLD.length);
  });

  it('chaque avantage a labelFr et labelEn non vides', () => {
    ALL_GRADES.forEach(grade => {
      GRADE_BENEFITS[grade].forEach(benefit => {
        expect(benefit.labelFr.length).toBeGreaterThan(0);
        expect(benefit.labelEn.length).toBeGreaterThan(0);
      });
    });
  });

  it('chaque avantage a une cle unique au sein du grade', () => {
    ALL_GRADES.forEach(grade => {
      const keys = GRADE_BENEFITS[grade].map(b => b.key);
      expect(new Set(keys).size).toBe(keys.length);
    });
  });

  it('PLATINUM a une priorite absolue (booking_priority_absolute)', () => {
    const priority = GRADE_BENEFITS.PLATINUM.find(b => b.key === 'booking_priority_absolute');
    expect(priority).toBeDefined();
    expect(priority!.claimable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ALL_GRADES — constante
// ---------------------------------------------------------------------------
describe('ALL_GRADES', () => {
  it('contient les 4 grades dans l ordre croissant', () => {
    expect(ALL_GRADES).toEqual(['BRONZE', 'SILVER', 'GOLD', 'PLATINUM']);
  });

  it('chaque grade dans ALL_GRADES a une entree dans GRADE_BENEFITS', () => {
    ALL_GRADES.forEach((grade: Grade) => {
      expect(GRADE_BENEFITS[grade]).toBeDefined();
    });
  });
});
