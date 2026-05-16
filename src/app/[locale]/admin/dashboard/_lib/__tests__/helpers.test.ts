import { describe, it, expect } from 'vitest';
import {
  occupancyLevel,
  occupancyPercent,
  daysSinceCasa,
  nextSevenCasaDays,
  upcomingBirthdays,
  formatCasaShortDate,
  daysAgoLabel,
} from '../helpers';

describe('occupancyPercent', () => {
  it('returns 0 when limit is zero (defensive)', () => {
    expect(occupancyPercent(5, 0)).toBe(0);
  });
  it('rounds to nearest integer', () => {
    expect(occupancyPercent(7, 10)).toBe(70);
    expect(occupancyPercent(11, 50)).toBe(22); // 22.0
    expect(occupancyPercent(13, 50)).toBe(26); // 26.0
  });
  it('does not cap at 100 (over-allocation surfaces visually)', () => {
    expect(occupancyPercent(55, 50)).toBe(110);
  });
});

describe('occupancyLevel — traffic light thresholds', () => {
  it('green below 70 %', () => {
    expect(occupancyLevel(0)).toBe('green');
    expect(occupancyLevel(69)).toBe('green');
  });
  it('orange at or above 70 %, below 90 %', () => {
    expect(occupancyLevel(70)).toBe('orange');
    expect(occupancyLevel(89)).toBe('orange');
  });
  it('red at or above 90 %', () => {
    expect(occupancyLevel(90)).toBe('red');
    expect(occupancyLevel(150)).toBe('red');
  });
});

describe('daysSinceCasa', () => {
  it('returns 0 when from = to', () => {
    const d = new Date('2026-05-16T10:00:00Z');
    expect(daysSinceCasa(d, d)).toBe(0);
  });
  it('counts calendar days in Casa, not raw ms', () => {
    // 14 mai 22:00 UTC = 23:00 Casa (still May 14)
    // 16 mai 00:00 UTC = 01:00 Casa (May 16)
    // Casa delta = 2 days, even though raw ms ≈ 26h.
    const from = new Date('2026-05-14T22:00:00Z');
    const to = new Date('2026-05-16T00:00:00Z');
    expect(daysSinceCasa(from, to)).toBe(2);
  });
  it('never returns negative (clamps at zero)', () => {
    const later = new Date('2026-05-16T10:00:00Z');
    const earlier = new Date('2026-05-15T10:00:00Z');
    expect(daysSinceCasa(later, earlier)).toBe(0);
  });
});

describe('nextSevenCasaDays', () => {
  it('emits 7 windows starting from today Casa-midnight', () => {
    const now = new Date('2026-05-16T12:00:00Z');
    const days = nextSevenCasaDays(now);
    expect(days).toHaveLength(7);
    expect(days[0].ymd).toBe('2026-05-16');
    expect(days[6].ymd).toBe('2026-05-22');
  });
  it('weekdayShortFr is correct on the seed date (May 16 2026 = Saturday)', () => {
    const now = new Date('2026-05-16T12:00:00Z');
    const days = nextSevenCasaDays(now);
    // 2026-05-16 is a Saturday. The chart shows a single uppercase letter
    // in French abbreviation : S.
    expect(days[0].weekdayShortFr).toBe('S');
    expect(days[1].weekdayShortFr).toBe('D'); // Sunday
    expect(days[2].weekdayShortFr).toBe('L'); // Monday
  });
  it('windows are 24h-1ms, non-overlapping', () => {
    const days = nextSevenCasaDays(new Date('2026-05-16T12:00:00Z'));
    for (let i = 0; i < days.length; i++) {
      expect(days[i].endUtc.getTime() - days[i].startUtc.getTime()).toBe(86_400_000 - 1);
      if (i < days.length - 1) {
        // Next day starts exactly 1 ms after this one ends.
        expect(days[i + 1].startUtc.getTime() - days[i].endUtc.getTime()).toBe(1);
      }
    }
  });
});

describe('upcomingBirthdays', () => {
  const baseDate = new Date('2026-05-16T12:00:00Z');

  it('returns empty list for pets without dateOfBirth', () => {
    const out = upcomingBirthdays(
      [
        { id: '1', name: 'Max', dateOfBirth: null, owner: { name: 'Foo' } },
      ],
      baseDate,
    );
    expect(out).toEqual([]);
  });

  it('includes a pet whose DOB month/day falls within today→today+6', () => {
    // Today = 2026-05-16. Window = May 16 → May 22.
    // Théo born on 2020-05-17 → birthday May 17, in window.
    const out = upcomingBirthdays(
      [
        { id: 'p1', name: 'Théo', dateOfBirth: new Date('2020-05-17T00:00:00Z'), owner: { name: 'Rim Kabli' } },
      ],
      baseDate,
    );
    expect(out).toHaveLength(1);
    expect(out[0].birthdayYmd).toBe('2026-05-17');
    expect(out[0].petName).toBe('Théo');
    expect(out[0].ownerName).toBe('Rim Kabli');
  });

  it('excludes pets whose DOB day is outside the 7-day window', () => {
    // Bali born May 25 — outside window (May 16 → May 22).
    const out = upcomingBirthdays(
      [
        { id: 'p1', name: 'Bali', dateOfBirth: new Date('2021-05-25T00:00:00Z'), owner: { name: 'Foo' } },
      ],
      baseDate,
    );
    expect(out).toEqual([]);
  });

  it('handles year wrap : window crosses Dec 31 → Jan 6', () => {
    const yearEnd = new Date('2026-12-31T12:00:00Z');
    const out = upcomingBirthdays(
      [
        // Born Jan 3 — window is Dec 31 → Jan 6, so this is in window
        // and falls in YEAR + 1.
        { id: 'p1', name: 'Snow', dateOfBirth: new Date('2020-01-03T00:00:00Z'), owner: { name: 'Foo' } },
      ],
      yearEnd,
    );
    expect(out).toHaveLength(1);
    expect(out[0].birthdayYmd).toBe('2027-01-03');
  });

  it('sorts results chronologically', () => {
    const out = upcomingBirthdays(
      [
        { id: 'p1', name: 'Late', dateOfBirth: new Date('2020-05-20T00:00:00Z'), owner: { name: 'A' } },
        { id: 'p2', name: 'Early', dateOfBirth: new Date('2019-05-17T00:00:00Z'), owner: { name: 'B' } },
      ],
      baseDate,
    );
    expect(out.map((b) => b.petName)).toEqual(['Early', 'Late']);
  });
});

describe('formatCasaShortDate', () => {
  it('formats YYYY-MM-DD into "16 mai" (FR)', () => {
    expect(formatCasaShortDate('2026-05-16', 'fr')).toBe('16 mai');
    expect(formatCasaShortDate('2026-12-04', 'fr')).toBe('4 déc.');
  });
  it('formats into "May 16" (EN)', () => {
    expect(formatCasaShortDate('2026-05-16', 'en')).toBe('May 16');
  });
  it('accepts a Date and projects to Casa calendar', () => {
    // 23:30 UTC on May 14 = 00:30 Casa on May 15
    const d = new Date('2026-05-14T23:30:00Z');
    expect(formatCasaShortDate(d, 'fr')).toBe('15 mai');
  });
});

describe('daysAgoLabel', () => {
  it('returns short FR label', () => {
    const past = new Date('2026-05-10T10:00:00Z');
    expect(daysAgoLabel(past, 'fr', new Date('2026-05-16T10:00:00Z'))).toBe('6 j');
  });
  it('returns "1 j" / "1 d" on the singular case', () => {
    const past = new Date('2026-05-15T10:00:00Z');
    expect(daysAgoLabel(past, 'fr', new Date('2026-05-16T10:00:00Z'))).toBe('1 j');
    expect(daysAgoLabel(past, 'en', new Date('2026-05-16T10:00:00Z'))).toBe('1 d');
  });
});
