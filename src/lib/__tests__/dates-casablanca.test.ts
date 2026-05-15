import { describe, it, expect } from 'vitest';
import {
  casablancaDateOnly,
  casablancaStartOfDay,
  casablancaYMD,
  currentMonthCasa,
  daysUntilCasablanca,
  isDepartureTomorrowCasablanca,
  isSameDayCasablanca,
  nowCasa,
  startOfDayCasa,
  endOfDayCasa,
  startOfMonthCasa,
  endOfMonthCasa,
  dayRangeCasa,
} from '../dates-casablanca';

// Wave-1 bug #2 regression suite. Every case here is one a naive
// `Math.round((endMs - nowMs) / 86_400_000)` would get wrong because
// it conflates UTC instants with Casablanca calendar days.

describe('casablancaDateOnly', () => {
  it('returns the UTC date when both midnights line up', () => {
    expect(casablancaDateOnly(new Date('2026-05-14T12:00:00Z'))).toBe('2026-05-14');
  });

  it('handles the day-rollover at 23:00 UTC (= 00:00 Casablanca next day)', () => {
    // 23:00 UTC on May 14 is 00:00 Casablanca on May 15.
    expect(casablancaDateOnly(new Date('2026-05-14T23:00:00Z'))).toBe('2026-05-15');
  });

  it('keeps the same UTC day at 22:59 UTC (= 23:59 Casablanca same day)', () => {
    expect(casablancaDateOnly(new Date('2026-05-14T22:59:00Z'))).toBe('2026-05-14');
  });

  it('accepts an ISO string input', () => {
    expect(casablancaDateOnly('2026-05-16T00:00:00+01:00')).toBe('2026-05-16');
  });
});

describe('casablancaStartOfDay', () => {
  it('returns 00:00 Casablanca for an arbitrary intra-day instant', () => {
    const sod = casablancaStartOfDay(new Date('2026-05-14T16:30:00Z')); // 17:30 Casa
    // 00:00 Casablanca on 14-May is 23:00 UTC on 13-May
    expect(sod.toISOString()).toBe('2026-05-13T23:00:00.000Z');
  });

  it('is idempotent on a value already at 00:00 Casablanca', () => {
    const a = new Date('2026-05-14T00:00:00+01:00');
    expect(casablancaStartOfDay(a).getTime()).toBe(a.getTime());
  });
});

describe('daysUntilCasablanca — the bug-#2 regression matrix', () => {
  it('returns 2 for the exact reported case (14-May afternoon → 16-May)', () => {
    // Reproducing the production bug: today is 14-May (afternoon), Imane's
    // booking endDate is 16-May (open, midnight Casa). Naive Math.round
    // gave 1 → showed "Départ demain". The fix returns 2 → "Dans 2 j".
    const today = new Date('2026-05-14T13:00:00Z'); // 14:00 Casa
    const endDate = new Date('2026-05-15T23:00:00Z'); // 00:00 Casa on 16-May
    expect(daysUntilCasablanca(endDate, today)).toBe(2);
  });

  it('returns 1 only when endDate is actually the calendar day after today', () => {
    const today = new Date('2026-05-14T13:00:00Z');
    const endDate = new Date('2026-05-14T23:00:00Z'); // 00:00 Casa on 15-May
    expect(daysUntilCasablanca(endDate, today)).toBe(1);
  });

  it('returns 0 when both fall on the same Casablanca day', () => {
    const morning = new Date('2026-05-14T07:00:00Z'); // 08:00 Casa
    const evening = new Date('2026-05-14T19:00:00Z'); // 20:00 Casa
    expect(daysUntilCasablanca(evening, morning)).toBe(0);
  });

  it('returns a negative value when endDate is before from', () => {
    const today = new Date('2026-05-14T12:00:00Z');
    const yesterday = new Date('2026-05-13T12:00:00Z');
    expect(daysUntilCasablanca(yesterday, today)).toBe(-1);
  });

  it('handles the day-rollover boundary precisely', () => {
    // 22:30 UTC = 23:30 Casa on 14-May ; 23:30 UTC = 00:30 Casa on 15-May.
    // Same instant difference (1h), different calendar-day deltas: 0 vs 1.
    const a = new Date('2026-05-14T22:30:00Z');
    const b = new Date('2026-05-14T23:30:00Z');
    expect(daysUntilCasablanca(b, a)).toBe(1);
    expect(daysUntilCasablanca(a, b)).toBe(-1);
  });
});

describe('isDepartureTomorrowCasablanca', () => {
  it('false for the 2-day-out case from the production bug', () => {
    const today = new Date('2026-05-14T13:00:00Z');
    const endDate = new Date('2026-05-15T23:00:00Z'); // 00:00 Casa on 16-May
    expect(isDepartureTomorrowCasablanca(endDate, today)).toBe(false);
  });

  it('true for an actual next-calendar-day departure', () => {
    const today = new Date('2026-05-14T13:00:00Z');
    const tomorrow = new Date('2026-05-14T23:30:00Z'); // 00:30 Casa next day
    expect(isDepartureTomorrowCasablanca(tomorrow, today)).toBe(true);
  });

  it('false when departure is today', () => {
    const today = new Date('2026-05-14T08:00:00Z');
    const laterToday = new Date('2026-05-14T18:00:00Z');
    expect(isDepartureTomorrowCasablanca(laterToday, today)).toBe(false);
  });

  it('false when departure is in 2+ days', () => {
    const today = new Date('2026-05-14T12:00:00Z');
    const inThreeDays = new Date('2026-05-17T12:00:00Z');
    expect(isDepartureTomorrowCasablanca(inThreeDays, today)).toBe(false);
  });
});

describe('isSameDayCasablanca', () => {
  it('true for two instants on the same Casablanca date', () => {
    expect(
      isSameDayCasablanca(
        new Date('2026-05-14T08:00:00Z'),
        new Date('2026-05-14T19:00:00Z'),
      ),
    ).toBe(true);
  });

  it('false when one crosses the Casablanca-local midnight (= 23:00 UTC)', () => {
    expect(
      isSameDayCasablanca(
        new Date('2026-05-14T22:59:00Z'), // 23:59 Casa 14-May
        new Date('2026-05-14T23:01:00Z'), // 00:01 Casa 15-May
      ),
    ).toBe(false);
  });
});

// ─── Day / month range helpers — the "dashboard 1-day-behind" fix ─────────

describe('startOfDayCasa / endOfDayCasa', () => {
  it('returns 00:00 Casa as 23:00 UTC the previous day for an arbitrary intra-day instant', () => {
    // 14:30 Casa on 2026-05-15 → 13:30 UTC. Day start should snap to
    // 00:00 Casa 15-May = 23:00 UTC on 14-May.
    const intraDay = new Date('2026-05-15T13:30:00Z');
    expect(startOfDayCasa(intraDay).toISOString()).toBe('2026-05-14T23:00:00.000Z');
    expect(endOfDayCasa(intraDay).toISOString()).toBe('2026-05-15T22:59:59.999Z');
  });

  it('handles the late-evening Casa boundary correctly', () => {
    // 23:30 Casa 14-May = 22:30 UTC. Still Casa-day 14-May.
    const lateEvening = new Date('2026-05-14T22:30:00Z');
    expect(casablancaDateOnly(startOfDayCasa(lateEvening))).toBe('2026-05-14');
  });

  it('handles the post-midnight Casa boundary correctly — the BUG case', () => {
    // 00:15 Casa 15-May = 23:15 UTC 14-May. The buggy `setUTCHours(0,0,0,0)`
    // would have returned `2026-05-14T00:00:00Z` (yesterday Casa). The
    // Casa-aware helper returns 23:00 UTC 14-May = 00:00 Casa 15-May.
    const afterMidnight = new Date('2026-05-14T23:15:00Z');
    expect(startOfDayCasa(afterMidnight).toISOString()).toBe('2026-05-14T23:00:00.000Z');
    expect(casablancaDateOnly(startOfDayCasa(afterMidnight))).toBe('2026-05-15');
  });
});

describe('startOfMonthCasa / endOfMonthCasa', () => {
  it('returns 00:00 Casa on the 1st for an arbitrary mid-month instant', () => {
    const midMonth = new Date('2026-05-14T13:30:00Z'); // 14:30 Casa 14-May
    expect(startOfMonthCasa(midMonth).toISOString()).toBe('2026-04-30T23:00:00.000Z'); // 00:00 Casa 1-May
  });

  it('returns 23:59:59.999 Casa on the last day of the month for endOfMonthCasa', () => {
    const may = new Date('2026-05-14T13:30:00Z');
    const eom = endOfMonthCasa(may);
    // 23:59:59.999 Casa 31-May = 22:59:59.999 UTC 31-May
    expect(eom.toISOString()).toBe('2026-05-31T22:59:59.999Z');
  });

  it('December → January year rollover', () => {
    const dec = new Date('2026-12-14T12:00:00Z');
    expect(endOfMonthCasa(dec).toISOString()).toBe('2026-12-31T22:59:59.999Z');
    const jan = new Date('2027-01-14T12:00:00Z');
    expect(startOfMonthCasa(jan).toISOString()).toBe('2026-12-31T23:00:00.000Z'); // 00:00 Casa 1-Jan
  });

  it('handles "00:30 Casa on the 1st" boundary (the BUG case for monthly KPIs)', () => {
    // 00:30 Casa 1-May = 23:30 UTC 30-Apr. The buggy `startOfMonth(new Date())`
    // would have returned 1-Apr 00:00 UTC (= April month start) because UTC
    // was still April. The Casa helper correctly returns 1-May Casa.
    const postMidnight1st = new Date('2026-04-30T23:30:00Z');
    expect(casablancaDateOnly(startOfMonthCasa(postMidnight1st))).toBe('2026-05-01');
    expect(startOfMonthCasa(postMidnight1st).toISOString()).toBe('2026-04-30T23:00:00.000Z');
  });
});

describe('dayRangeCasa', () => {
  it('produces a 24-hour window aligned on Casa midnight', () => {
    const noon = new Date('2026-05-14T11:00:00Z'); // 12:00 Casa
    const { start, end } = dayRangeCasa(noon);
    expect(end.getTime() - start.getTime()).toBe(86_400_000 - 1);
    expect(start.toISOString()).toBe('2026-05-13T23:00:00.000Z');
    expect(end.toISOString()).toBe('2026-05-14T22:59:59.999Z');
  });
});

describe('nowCasa', () => {
  it('returns a Date (smoke — just confirms exported and callable)', () => {
    expect(nowCasa()).toBeInstanceOf(Date);
  });
});

describe('casablancaYMD — Casa-anchored year/month/day extraction', () => {
  it('returns Casa values, not UTC, for an instant just before Casa midnight', () => {
    // 22:30 UTC on 14 May = 23:30 Casa on 14 May → still May 14 both sides
    const beforeCasaMidnight = new Date('2026-05-14T22:30:00Z');
    expect(casablancaYMD(beforeCasaMidnight)).toEqual({ year: 2026, month: 5, day: 14 });
  });

  it('rolls to the next Casa day when UTC is still on the previous day', () => {
    // 23:30 UTC on 14 May = 00:30 Casa on 15 May → Casa is already May 15
    // even though `(new Date(...)).getUTCDate()` would return 14.
    const afterCasaMidnight = new Date('2026-05-14T23:30:00Z');
    expect(casablancaYMD(afterCasaMidnight)).toEqual({ year: 2026, month: 5, day: 15 });
  });

  it('rolls to the next Casa MONTH at the month-boundary midnight (the bug case)', () => {
    // 23:30 UTC on 30 April = 00:30 Casa on 1 May.
    // The buggy pattern (`monthStart = startOfMonthCasa(...)` then
    // `.getMonth()`) returned 3 (April, 0-indexed) on a UTC runtime;
    // this helper correctly returns May.
    const postMidnightFirstOfMay = new Date('2026-04-30T23:30:00Z');
    expect(casablancaYMD(postMidnightFirstOfMay)).toEqual({ year: 2026, month: 5, day: 1 });
  });

  it('rolls year on Casa Jan 1 even when UTC is still 31 December', () => {
    // 23:30 UTC on 31 December 2026 = 00:30 Casa on 1 January 2027
    const postMidnightNewYear = new Date('2026-12-31T23:30:00Z');
    expect(casablancaYMD(postMidnightNewYear)).toEqual({ year: 2027, month: 1, day: 1 });
  });

  it('accepts a `startOfMonthCasa(d)` return value and yields the correct Casa month', () => {
    // The exact production failure mode that Bug A surfaced. The Date
    // returned by startOfMonthCasa for May is 2026-04-30T23:00:00Z;
    // calling .getMonth() on it returns 3 (April). casablancaYMD must
    // bypass that and return May (5).
    const monthStart = startOfMonthCasa(new Date('2026-05-14T12:00:00Z'));
    expect(monthStart.toISOString()).toBe('2026-04-30T23:00:00.000Z');
    // Sanity: confirm the buggy pattern indeed reports April on this Date.
    expect(monthStart.getUTCMonth()).toBe(3); // April 0-indexed — this is the bug
    // The correct helper returns May.
    expect(casablancaYMD(monthStart)).toEqual({ year: 2026, month: 5, day: 1 });
  });
});

describe('currentMonthCasa — runtime-safe "this month" extraction', () => {
  it('returns { year, month } as a Casa-anchored tuple, callable without args', () => {
    const r = currentMonthCasa();
    expect(typeof r.year).toBe('number');
    expect(typeof r.month).toBe('number');
    expect(r.month).toBeGreaterThanOrEqual(1);
    expect(r.month).toBeLessThanOrEqual(12);
  });

  it('matches casablancaYMD(new Date()) — single source of truth', () => {
    const a = currentMonthCasa();
    const b = casablancaYMD(new Date());
    expect(a.year).toBe(b.year);
    expect(a.month).toBe(b.month);
  });
});
