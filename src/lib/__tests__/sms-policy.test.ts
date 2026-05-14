import { describe, it, expect } from 'vitest';
import {
  decideSmsPolicy,
  isQuietHoursCasablanca,
  delayUntilBusinessHoursMs,
  classifyRecipient,
  QUIET_HOUR_START,
  QUIET_HOUR_END,
} from '../sms-policy';

// Helper: construct a Date at a given Casablanca-local hour.
// Casablanca is UTC+1 year-round (no DST since 2018), so a given Casa hour
// maps to (hour - 1) UTC on the same calendar day.
function casaHourToDate(hour: number, dateBase = new Date('2026-05-14T00:00:00Z')): Date {
  const d = new Date(dateBase);
  d.setUTCHours(hour - 1, 0, 0, 0);
  return d;
}

describe('isQuietHoursCasablanca', () => {
  // Quiet window: [21:00 → 09:00) Casablanca local.
  // Below the lower bound and above the upper bound are quiet; the interior
  // [09:00 → 21:00) is business hours.
  it.each([
    { hour: 0, expected: true },
    { hour: 5, expected: true },
    { hour: 8, expected: true },
    { hour: 8.99, expected: true }, // 8:59
    { hour: 9, expected: false }, // boundary inclusive on the open side
    { hour: 12, expected: false },
    { hour: 18, expected: false },
    { hour: 20, expected: false },
    { hour: 20.99, expected: false }, // 20:59
    { hour: 21, expected: true }, // boundary inclusive on the quiet side
    { hour: 22, expected: true },
    { hour: 23, expected: true },
  ])('hour $hour Casa → quiet=$expected', ({ hour, expected }) => {
    const casaHour = Math.floor(hour);
    const casaMinute = Math.round((hour - casaHour) * 60);
    // Convert Casa local → UTC (offset +1)
    const utcHour = casaHour - 1;
    const d = new Date('2026-05-14T00:00:00Z');
    if (utcHour < 0) {
      // 0:xx Casa → 23:xx UTC previous day
      d.setUTCDate(d.getUTCDate() - 1);
      d.setUTCHours(utcHour + 24, casaMinute, 0, 0);
    } else {
      d.setUTCHours(utcHour, casaMinute, 0, 0);
    }
    expect(isQuietHoursCasablanca(d)).toBe(expected);
  });

  it('uses the exported boundary constants', () => {
    expect(QUIET_HOUR_START).toBe(21);
    expect(QUIET_HOUR_END).toBe(9);
  });
});

describe('delayUntilBusinessHoursMs', () => {
  it('returns 0 during business hours', () => {
    const noon = casaHourToDate(12);
    expect(delayUntilBusinessHoursMs(noon)).toBe(0);
  });

  it('returns ~2h delay at 7:00 Casa (same day → 9:00 Casa)', () => {
    const morn = casaHourToDate(7);
    const ms = delayUntilBusinessHoursMs(morn);
    expect(ms).toBe(2 * 3600 * 1000);
  });

  it('returns ~10h delay at 23:00 Casa (next day 9:00 Casa)', () => {
    const night = casaHourToDate(23);
    const ms = delayUntilBusinessHoursMs(night);
    expect(ms).toBe(10 * 3600 * 1000);
  });

  it('returns ~9h delay at 00:00 Casa (same UTC day → next 8:00 UTC)', () => {
    // 00:00 Casa = 23:00 UTC previous day. Need to handle the day rollover.
    const base = new Date('2026-05-14T23:00:00Z'); // = May 15 00:00 Casa
    const ms = delayUntilBusinessHoursMs(base);
    expect(ms).toBe(9 * 3600 * 1000);
  });

  it('handles 8:59:59 Casa → just over 0 ms (about 1 second)', () => {
    const justBefore = new Date('2026-05-14T07:59:59Z'); // 08:59:59 Casa
    const ms = delayUntilBusinessHoursMs(justBefore);
    expect(ms).toBeGreaterThanOrEqual(0);
    expect(ms).toBeLessThan(2000); // less than 2 seconds
  });
});

describe('classifyRecipient', () => {
  it('walk-in flag → walkin', () => {
    expect(classifyRecipient({ isWalkIn: true })).toBe('walkin');
  });

  it('non-walk-in → standard', () => {
    expect(classifyRecipient({ isWalkIn: false })).toBe('standard');
  });

  it('missing field → standard (conservative default)', () => {
    expect(classifyRecipient({})).toBe('standard');
  });

  it('null/undefined → standard', () => {
    expect(classifyRecipient(null)).toBe('standard');
    expect(classifyRecipient(undefined)).toBe('standard');
  });
});

describe('decideSmsPolicy — full matrix', () => {
  const noon = casaHourToDate(13); // unambiguously business hours
  const midnight = casaHourToDate(0); // unambiguously quiet hours

  // OPS category — always send-now, regardless of recipient or hour.
  describe('OPS always sends immediately', () => {
    it.each([
      { recipient: 'standard', now: noon, label: 'standard / day' },
      { recipient: 'standard', now: midnight, label: 'standard / night' },
      { recipient: 'walkin', now: noon, label: 'walkin / day' },
      { recipient: 'walkin', now: midnight, label: 'walkin / night' },
      { recipient: 'admin', now: noon, label: 'admin / day' },
      { recipient: 'admin', now: midnight, label: 'admin / night' },
    ] as const)('OPS + $label → send-now', ({ recipient, now }) => {
      expect(decideSmsPolicy({ category: 'OPS', recipient, now })).toEqual({ kind: 'send-now' });
    });
  });

  // ADMIN recipient — always send-now, regardless of category or hour.
  describe('ADMIN recipient always sends immediately', () => {
    it.each([
      { category: 'OPS', now: noon },
      { category: 'OPS', now: midnight },
      { category: 'COMPTA', now: noon },
      { category: 'COMPTA', now: midnight },
    ] as const)('admin + $category + $now → send-now', ({ category, now }) => {
      expect(decideSmsPolicy({ category, recipient: 'admin', now })).toEqual({ kind: 'send-now' });
    });
  });

  // Walk-in + COMPTA → SKIP regardless of hour. The signature behaviour.
  describe('walk-in + COMPTA → skip', () => {
    it('walk-in + COMPTA + day → skip', () => {
      expect(decideSmsPolicy({ category: 'COMPTA', recipient: 'walkin', now: noon })).toEqual({
        kind: 'skip',
        reason: 'walkin_compta',
      });
    });

    it('walk-in + COMPTA + night → skip', () => {
      expect(decideSmsPolicy({ category: 'COMPTA', recipient: 'walkin', now: midnight })).toEqual({
        kind: 'skip',
        reason: 'walkin_compta',
      });
    });
  });

  // Standard + COMPTA → send during day, defer during night.
  describe('standard + COMPTA → respects quiet hours', () => {
    it('standard + COMPTA + day → send-now', () => {
      expect(decideSmsPolicy({ category: 'COMPTA', recipient: 'standard', now: noon })).toEqual({
        kind: 'send-now',
      });
    });

    it('standard + COMPTA + night → defer with positive delayMs', () => {
      const decision = decideSmsPolicy({ category: 'COMPTA', recipient: 'standard', now: midnight });
      expect(decision.kind).toBe('defer');
      if (decision.kind !== 'defer') return; // narrow
      expect(decision.reason).toBe('quiet_hours');
      expect(decision.delayMs).toBeGreaterThan(0);
    });

    it('standard + COMPTA + 23:00 → defer ~10 hours', () => {
      const night = casaHourToDate(23);
      const decision = decideSmsPolicy({ category: 'COMPTA', recipient: 'standard', now: night });
      expect(decision.kind).toBe('defer');
      if (decision.kind !== 'defer') return;
      expect(decision.delayMs).toBe(10 * 3600 * 1000);
    });

    it('standard + COMPTA + 8:59 → defer (still quiet)', () => {
      const earlyMorn = new Date('2026-05-14T07:59:00Z'); // 8:59 Casa
      const decision = decideSmsPolicy({ category: 'COMPTA', recipient: 'standard', now: earlyMorn });
      expect(decision.kind).toBe('defer');
    });

    it('standard + COMPTA + 9:00 → send-now (back to business)', () => {
      const businessOpen = casaHourToDate(9);
      const decision = decideSmsPolicy({ category: 'COMPTA', recipient: 'standard', now: businessOpen });
      expect(decision.kind).toBe('send-now');
    });

    it('standard + COMPTA + 20:59 → send-now (just before quiet starts)', () => {
      const beforeQuiet = new Date('2026-05-14T19:59:00Z'); // 20:59 Casa
      const decision = decideSmsPolicy({ category: 'COMPTA', recipient: 'standard', now: beforeQuiet });
      expect(decision.kind).toBe('send-now');
    });

    it('standard + COMPTA + 21:00 → defer (quiet starts)', () => {
      const quietStart = casaHourToDate(21);
      const decision = decideSmsPolicy({ category: 'COMPTA', recipient: 'standard', now: quietStart });
      expect(decision.kind).toBe('defer');
    });
  });
});
