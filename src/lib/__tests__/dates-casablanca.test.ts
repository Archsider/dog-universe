import { describe, it, expect } from 'vitest';
import {
  casablancaDateOnly,
  casablancaStartOfDay,
  daysUntilCasablanca,
  isDepartureTomorrowCasablanca,
  isSameDayCasablanca,
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
