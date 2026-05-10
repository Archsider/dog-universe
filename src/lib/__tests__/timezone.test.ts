import { describe, it, expect } from 'vitest';
import {
  getDayOfWeekMaroc,
  getHourMaroc,
  getMinuteMaroc,
  getMonthMaroc,
  getYearMaroc,
  toDateStringMaroc,
  utcNoonOfMarocDay,
} from '../timezone';

describe('timezone (Africa/Casablanca, UTC+1)', () => {
  it('samedi 23h UTC = dimanche 00h Maroc → getDayOfWeekMaroc = 0', () => {
    // 2026-05-09 (samedi) 23:00:00 UTC → 2026-05-10 (dimanche) 00:00 Maroc
    const d = new Date('2026-05-09T23:00:00Z');
    expect(getDayOfWeekMaroc(d)).toBe(0);
  });

  it('vendredi 23h UTC = samedi 00h Maroc → 6', () => {
    const d = new Date('2026-05-08T23:00:00Z');
    expect(getDayOfWeekMaroc(d)).toBe(6);
  });

  it('dimanche 22h UTC = dimanche 23h Maroc (toujours dimanche)', () => {
    const d = new Date('2026-05-10T22:00:00Z');
    expect(getDayOfWeekMaroc(d)).toBe(0);
    expect(getHourMaroc(d)).toBe(23);
  });

  it('getHourMaroc — 09h UTC = 10h Maroc (frontière 10h)', () => {
    const d = new Date('2026-05-12T09:00:00Z');
    expect(getHourMaroc(d)).toBe(10);
  });

  it('getHourMaroc — 16h UTC = 17h Maroc (frontière 17h)', () => {
    const d = new Date('2026-05-12T16:00:00Z');
    expect(getHourMaroc(d)).toBe(17);
  });

  it('getHourMaroc — 23h UTC = 00h Maroc (rollover minuit)', () => {
    const d = new Date('2026-05-12T23:00:00Z');
    expect(getHourMaroc(d)).toBe(0);
  });

  it('getMinuteMaroc — minutes inchangées', () => {
    const d = new Date('2026-05-12T08:37:00Z');
    expect(getMinuteMaroc(d)).toBe(37);
  });

  it('getMonthMaroc / getYearMaroc — frontière nouvelle année', () => {
    // 31 déc 2025 23:30 UTC → 1 jan 2026 00:30 Maroc
    const d = new Date('2025-12-31T23:30:00Z');
    expect(getYearMaroc(d)).toBe(2026);
    expect(getMonthMaroc(d)).toBe(0);
  });

  it('toDateStringMaroc — format YYYY-MM-DD au fuseau Maroc', () => {
    const d = new Date('2026-05-09T23:30:00Z');
    expect(toDateStringMaroc(d)).toBe('2026-05-10');
  });

  it('utcNoonOfMarocDay — midi Maroc = 11h UTC', () => {
    const d = utcNoonOfMarocDay(2026, 4, 10); // 10 mai 2026
    expect(d.toISOString()).toBe('2026-05-10T11:00:00.000Z');
    expect(getHourMaroc(d)).toBe(12);
    expect(getDayOfWeekMaroc(d)).toBe(0);
  });

  it('cas DST hypothétique — Maroc reste UTC+1 (pas de DST depuis 2018)', () => {
    // Été : 2026-07-15 13h UTC = 14h Maroc
    const d = new Date('2026-07-15T13:00:00Z');
    expect(getHourMaroc(d)).toBe(14);
  });
});
