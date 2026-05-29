import { describe, it, expect } from 'vitest';
import {
  addCalendarDays,
  weekdayUtc,
  isWeekendMorocco,
  isPublicHolidayMorocco,
  isBankBusinessDay,
} from '../morocco-calendar';

describe('morocco-calendar — arithmétique date pure', () => {
  it('avance correctement les jours calendaires (avec passage de mois)', () => {
    expect(addCalendarDays('2026-05-29', 1)).toBe('2026-05-30');
    expect(addCalendarDays('2026-05-31', 1)).toBe('2026-06-01'); // mois suivant
    expect(addCalendarDays('2026-12-31', 1)).toBe('2027-01-01'); // année suivante
    expect(addCalendarDays('2026-06-01', -1)).toBe('2026-05-31'); // recul
  });

  it('rejette un format invalide', () => {
    expect(() => addCalendarDays('2026-5-1', 1)).toThrow();
    expect(() => isPublicHolidayMorocco('not-a-date')).toThrow();
  });

  it('calcule le bon jour de semaine en UTC', () => {
    // 2026-05-29 est un vendredi, 2026-05-30 samedi, 2026-05-31 dimanche.
    expect(weekdayUtc('2026-05-29')).toBe(5);
    expect(weekdayUtc('2026-05-30')).toBe(6);
    expect(weekdayUtc('2026-05-31')).toBe(0);
  });
});

describe('morocco-calendar — weekends', () => {
  it('reconnaît samedi et dimanche comme weekend', () => {
    expect(isWeekendMorocco('2026-05-30')).toBe(true); // samedi
    expect(isWeekendMorocco('2026-05-31')).toBe(true); // dimanche
    expect(isWeekendMorocco('2026-05-29')).toBe(false); // vendredi
    expect(isWeekendMorocco('2026-06-01')).toBe(false); // lundi
  });
});

describe('morocco-calendar — jours fériés', () => {
  it('reconnaît les fériés fixes grégoriens', () => {
    expect(isPublicHolidayMorocco('2026-01-01')).toBe(true); // Nouvel An
    expect(isPublicHolidayMorocco('2026-07-30')).toBe(true); // Fête du Trône
    expect(isPublicHolidayMorocco('2026-11-18')).toBe(true); // Indépendance
    expect(isPublicHolidayMorocco('2027-01-01')).toBe(true); // récurrent
  });

  it("reconnaît l'Aïd al-Adha de fin mai 2026 (le pont du cas réel)", () => {
    expect(isPublicHolidayMorocco('2026-05-27')).toBe(true);
    expect(isPublicHolidayMorocco('2026-05-28')).toBe(true);
  });

  it('un jour ordinaire n\'est pas férié', () => {
    expect(isPublicHolidayMorocco('2026-05-29')).toBe(false);
    expect(isPublicHolidayMorocco('2026-06-02')).toBe(false);
  });
});

describe('morocco-calendar — jours ouvrés bancaires', () => {
  it('un vendredi ordinaire est ouvré', () => {
    expect(isBankBusinessDay('2026-05-29')).toBe(true);
  });
  it('un weekend n\'est pas ouvré', () => {
    expect(isBankBusinessDay('2026-05-30')).toBe(false);
    expect(isBankBusinessDay('2026-05-31')).toBe(false);
  });
  it('un férié n\'est pas ouvré même en semaine', () => {
    expect(isBankBusinessDay('2026-05-28')).toBe(false); // Aïd, un jeudi
    expect(isBankBusinessDay('2026-07-30')).toBe(false); // Fête du Trône
  });
  it('le lundi de reprise est ouvré', () => {
    expect(isBankBusinessDay('2026-06-01')).toBe(true);
  });
});
