import { describe, it, expect } from 'vitest';
import {
  computeGradeFromStats,
  getProgressToNext,
  normalizeGrade,
  isUpgrade,
  getNextGrade,
  getGradeOrder,
  getGradeLabel,
  GRADE_THRESHOLDS,
  POINTS_PER_SERVICE,
} from '../loyalty';

// ────────────────────────────────────────────────────────────────
// computeGradeFromStats
// ────────────────────────────────────────────────────────────────
describe('computeGradeFromStats', () => {
  describe('MEMBER', () => {
    it('returns MEMBER for 0 nights, 0 points', () => {
      expect(computeGradeFromStats(0, 0)).toBe('MEMBER');
    });

    it('returns MEMBER below all thresholds', () => {
      expect(computeGradeFromStats(39, 499)).toBe('MEMBER');
    });
  });

  describe('SILVER', () => {
    it('returns SILVER when nights meet threshold', () => {
      expect(computeGradeFromStats(40, 0)).toBe('SILVER');
    });

    it('returns SILVER when points meet threshold', () => {
      expect(computeGradeFromStats(0, 500)).toBe('SILVER');
    });

    it('returns SILVER with both at threshold', () => {
      expect(computeGradeFromStats(40, 500)).toBe('SILVER');
    });

    it('returns SILVER just below GOLD thresholds', () => {
      expect(computeGradeFromStats(89, 1499)).toBe('SILVER');
    });
  });

  describe('GOLD', () => {
    it('returns GOLD when nights meet threshold', () => {
      expect(computeGradeFromStats(90, 0)).toBe('GOLD');
    });

    it('returns GOLD when points meet threshold', () => {
      expect(computeGradeFromStats(0, 1500)).toBe('GOLD');
    });

    it('returns GOLD just below PLATINUM thresholds', () => {
      expect(computeGradeFromStats(159, 2999)).toBe('GOLD');
    });
  });

  describe('PLATINUM', () => {
    it('returns PLATINUM when nights meet threshold', () => {
      expect(computeGradeFromStats(160, 0)).toBe('PLATINUM');
    });

    it('returns PLATINUM when points meet threshold', () => {
      expect(computeGradeFromStats(0, 3000)).toBe('PLATINUM');
    });

    it('returns PLATINUM well above threshold', () => {
      expect(computeGradeFromStats(500, 10000)).toBe('PLATINUM');
    });
  });

  it('uses OR logic — one criterion is enough to reach next grade', () => {
    // Has GOLD nights but only SILVER points → still GOLD
    expect(computeGradeFromStats(90, 100)).toBe('GOLD');
    // Has PLATINUM points but low nights → still PLATINUM
    expect(computeGradeFromStats(10, 3000)).toBe('PLATINUM');
  });
});

// ────────────────────────────────────────────────────────────────
// normalizeGrade
// ────────────────────────────────────────────────────────────────
describe('normalizeGrade', () => {
  it('maps BRONZE to MEMBER (backward compat)', () => {
    expect(normalizeGrade('BRONZE')).toBe('MEMBER');
  });

  it('passes through valid grades unchanged', () => {
    expect(normalizeGrade('MEMBER')).toBe('MEMBER');
    expect(normalizeGrade('SILVER')).toBe('SILVER');
    expect(normalizeGrade('GOLD')).toBe('GOLD');
    expect(normalizeGrade('PLATINUM')).toBe('PLATINUM');
  });

  it('falls back to MEMBER for unknown strings', () => {
    expect(normalizeGrade('DIAMOND')).toBe('MEMBER');
    expect(normalizeGrade('')).toBe('MEMBER');
    expect(normalizeGrade('unknown')).toBe('MEMBER');
  });
});

// ────────────────────────────────────────────────────────────────
// getProgressToNext
// ────────────────────────────────────────────────────────────────
describe('getProgressToNext', () => {
  it('returns 100% at no next grade (PLATINUM)', () => {
    const p = getProgressToNext(200, 5000, 'PLATINUM');
    expect(p.percent).toBe(100);
    expect(p.nightsNeeded).toBe(0);
    expect(p.pointsNeeded).toBe(0);
  });

  it('returns 0% at start of MEMBER', () => {
    const p = getProgressToNext(0, 0, 'MEMBER');
    expect(p.percent).toBe(0);
    // Need SILVER: 40 nights or 500 points
    expect(p.nightsNeeded).toBe(40);
    expect(p.pointsNeeded).toBe(500);
  });

  it('returns correct percent based on best dimension', () => {
    // 20 out of 40 nights needed → 50% by nights
    // 0 out of 500 points → 0% by points
    // best = 50%
    const p = getProgressToNext(20, 0, 'MEMBER');
    expect(p.percent).toBe(50);
    expect(p.nightsNeeded).toBe(20);
    expect(p.pointsNeeded).toBe(500);
  });

  it('caps percent at 100', () => {
    const p = getProgressToNext(45, 600, 'MEMBER');
    // nights: >40 → 100%, points: >500 → 100%
    expect(p.percent).toBe(100);
    expect(p.nightsNeeded).toBe(0);
    expect(p.pointsNeeded).toBe(0);
  });

  it('computes SILVER → GOLD progress', () => {
    // At SILVER (40 nights, 500 pts), need 90 nights total → range 50 nights
    // 65 nights → (65-40)/50 = 50%
    const p = getProgressToNext(65, 600, 'SILVER');
    expect(p.percent).toBeGreaterThan(0);
    expect(p.nightsNeeded).toBe(90 - 65); // 25
  });
});

// ────────────────────────────────────────────────────────────────
// isUpgrade
// ────────────────────────────────────────────────────────────────
describe('isUpgrade', () => {
  it('detects upgrades correctly', () => {
    expect(isUpgrade('MEMBER', 'SILVER')).toBe(true);
    expect(isUpgrade('SILVER', 'GOLD')).toBe(true);
    expect(isUpgrade('GOLD', 'PLATINUM')).toBe(true);
    expect(isUpgrade('MEMBER', 'PLATINUM')).toBe(true);
  });

  it('detects non-upgrades correctly', () => {
    expect(isUpgrade('SILVER', 'MEMBER')).toBe(false);
    expect(isUpgrade('GOLD', 'SILVER')).toBe(false);
    expect(isUpgrade('PLATINUM', 'GOLD')).toBe(false);
  });

  it('same grade is not an upgrade', () => {
    expect(isUpgrade('MEMBER', 'MEMBER')).toBe(false);
    expect(isUpgrade('GOLD', 'GOLD')).toBe(false);
  });

  it('BRONZE is equivalent to MEMBER for ordering', () => {
    expect(isUpgrade('BRONZE', 'SILVER')).toBe(true);
    expect(isUpgrade('BRONZE', 'MEMBER')).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────
// getNextGrade
// ────────────────────────────────────────────────────────────────
describe('getNextGrade', () => {
  it('MEMBER → SILVER', () => expect(getNextGrade('MEMBER')).toBe('SILVER'));
  it('SILVER → GOLD',   () => expect(getNextGrade('SILVER')).toBe('GOLD'));
  it('GOLD → PLATINUM', () => expect(getNextGrade('GOLD')).toBe('PLATINUM'));
  it('PLATINUM → null', () => expect(getNextGrade('PLATINUM')).toBeNull());
});

// ────────────────────────────────────────────────────────────────
// getGradeOrder
// ────────────────────────────────────────────────────────────────
describe('getGradeOrder', () => {
  it('returns correct ordinal values', () => {
    expect(getGradeOrder('MEMBER')).toBe(1);
    expect(getGradeOrder('BRONZE')).toBe(1);
    expect(getGradeOrder('SILVER')).toBe(2);
    expect(getGradeOrder('GOLD')).toBe(3);
    expect(getGradeOrder('PLATINUM')).toBe(4);
  });

  it('returns 1 for unknown grades', () => {
    expect(getGradeOrder('DIAMOND')).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────
// getGradeLabel
// ────────────────────────────────────────────────────────────────
describe('getGradeLabel', () => {
  it('returns correct French labels', () => {
    expect(getGradeLabel('MEMBER', 'fr')).toBe('Member');
    expect(getGradeLabel('SILVER', 'fr')).toBe('Silver');
    expect(getGradeLabel('GOLD', 'fr')).toBe('Gold');
    expect(getGradeLabel('PLATINUM', 'fr')).toBe('Platine');
  });

  it('returns correct English labels', () => {
    expect(getGradeLabel('PLATINUM', 'en')).toBe('Platinum');
  });

  it('defaults to French when locale omitted', () => {
    expect(getGradeLabel('PLATINUM')).toBe('Platine');
  });

  it('BRONZE maps to Member label', () => {
    expect(getGradeLabel('BRONZE', 'en')).toBe('Member');
  });
});

// ────────────────────────────────────────────────────────────────
// GRADE_THRESHOLDS & POINTS_PER_SERVICE — constants sanity
// ────────────────────────────────────────────────────────────────
describe('constants', () => {
  it('GRADE_THRESHOLDS has expected values', () => {
    expect(GRADE_THRESHOLDS.MEMBER).toEqual({ nights: 0, points: 0 });
    expect(GRADE_THRESHOLDS.SILVER).toEqual({ nights: 40, points: 500 });
    expect(GRADE_THRESHOLDS.GOLD).toEqual({ nights: 90, points: 1500 });
    expect(GRADE_THRESHOLDS.PLATINUM).toEqual({ nights: 160, points: 3000 });
  });

  it('POINTS_PER_SERVICE has expected values', () => {
    expect(POINTS_PER_SERVICE.BOARDING_PER_NIGHT).toBe(10);
    expect(POINTS_PER_SERVICE.GROOMING).toBe(15);
    expect(POINTS_PER_SERVICE.PET_TAXI).toBe(10);
  });
});
