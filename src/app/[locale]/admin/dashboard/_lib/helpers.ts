// Pure helpers for the cockpit dashboard. Zero DB access here — all of
// these are deterministic transforms over already-fetched data, so they
// stay easy to unit-test and to swap into Storybook fixtures.

import { addDays } from 'date-fns';
import {
  casablancaDateOnly,
  casablancaStartOfDay,
  casablancaYMD,
} from '@/lib/dates-casablanca';

/**
 * Bucket an occupancy percentage into a 3-level traffic-light category.
 * Thresholds match the design brief : red ≥ 90 %, orange ≥ 70 %, else green.
 */
export type OccupancyLevel = 'green' | 'orange' | 'red';
export function occupancyLevel(percentage: number): OccupancyLevel {
  if (percentage >= 90) return 'red';
  if (percentage >= 70) return 'orange';
  return 'green';
}

export function occupancyPercent(current: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.round((current / limit) * 100);
}

/**
 * Days-since for the "long stay" / "inactive client" cards. Anchored on the
 * Casablanca calendar so it matches what a human at the kennel would count.
 * `from` and `to` can be any UTC Date — they're each projected to their
 * Casa calendar day before subtracting.
 */
export function daysSinceCasa(from: Date | string, to: Date | string = new Date()): number {
  const a = casablancaStartOfDay(from).getTime();
  const b = casablancaStartOfDay(to).getTime();
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/**
 * Yields 7 Casa-anchored day windows starting today : { date: Date,
 * dayLabel: 'V', dateLabel: '16', startUtc: Date, endUtc: Date }.
 * Used by the 7-day capacity chart.
 */
export interface DayWindow {
  /** Midnight Casa of this day, expressed as a UTC instant. */
  startUtc: Date;
  /** 23:59:59.999 Casa of this day, expressed as a UTC instant. */
  endUtc: Date;
  /** YYYY-MM-DD in Casa — useful as a stable key in React lists. */
  ymd: string;
  /** Day of month for the X-axis label (1-31). */
  dayOfMonth: number;
  /** First letter of the weekday in French (L M M J V S D). */
  weekdayShortFr: string;
}

const WEEKDAY_FR = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

export function nextSevenCasaDays(now: Date = new Date()): DayWindow[] {
  const today = casablancaStartOfDay(now);
  const out: DayWindow[] = [];
  for (let i = 0; i < 7; i++) {
    const start = addDays(today, i);
    const end = new Date(start.getTime() + 86_400_000 - 1);
    const ymd = casablancaDateOnly(start);
    const { day } = casablancaYMD(start);
    // Casa-anchored weekday : reading `.getUTCDay()` on `start` gives the
    // weekday of midnight-Casa-projected-to-UTC, which is the same
    // weekday a wall clock in Casa would show because Morocco is on a
    // fixed +1 hour offset (no DST).
    const wkIdx = new Date(`${ymd}T12:00:00+01:00`).getUTCDay();
    out.push({
      startUtc: start,
      endUtc: end,
      ymd,
      dayOfMonth: day,
      weekdayShortFr: WEEKDAY_FR[wkIdx],
    });
  }
  return out;
}

/**
 * Pets whose birthday (month/day) falls within [today, today+6] in the
 * Casa calendar. Filters out missing dateOfBirth. Pure transform — caller
 * provides the pet list from Prisma.
 */
export interface PetWithDob {
  id: string;
  name: string;
  dateOfBirth: Date | null;
  owner: { name: string | null } | null;
}

export interface UpcomingBirthday {
  petId: string;
  petName: string;
  ownerName: string;
  /** YYYY-MM-DD of the upcoming birthday (this year or next year if wrap). */
  birthdayYmd: string;
}

export function upcomingBirthdays(
  pets: readonly PetWithDob[],
  now: Date = new Date(),
): UpcomingBirthday[] {
  const todayYmd = casablancaDateOnly(now);
  const todayKey = todayYmd.slice(5); // 'MM-DD'
  const startCasa = casablancaStartOfDay(now);
  const horizonCasa = new Date(startCasa.getTime() + 7 * 86_400_000 - 1);
  const horizonYmd = casablancaDateOnly(horizonCasa);
  const horizonKey = horizonYmd.slice(5);
  const currentYear = Number(todayYmd.slice(0, 4));

  // Year wraps at end of December — windows touching January need a
  // 2-segment comparison.
  const wrapsYear = horizonKey < todayKey;

  const out: UpcomingBirthday[] = [];
  for (const pet of pets) {
    if (!pet.dateOfBirth) continue;
    const dobYmd = casablancaDateOnly(pet.dateOfBirth);
    const dobKey = dobYmd.slice(5);
    const inWindow = wrapsYear
      ? dobKey >= todayKey || dobKey <= horizonKey
      : dobKey >= todayKey && dobKey <= horizonKey;
    if (!inWindow) continue;
    // If the birthday already happened earlier this year on the current
    // day-of-month (e.g. dob = 2020-05-16 and today = 2026-05-16), we
    // show it as this year ; otherwise still this year unless we wrapped.
    const birthdayYear = wrapsYear && dobKey < todayKey ? currentYear + 1 : currentYear;
    out.push({
      petId: pet.id,
      petName: pet.name,
      ownerName: pet.owner?.name ?? '',
      birthdayYmd: `${birthdayYear}-${dobKey}`,
    });
  }
  // Order chronologically.
  out.sort((a, b) => a.birthdayYmd.localeCompare(b.birthdayYmd));
  return out;
}

/**
 * "Il y a N jours" formatter, FR/EN. Anchored on Casa days, not on raw
 * millisecond difference.
 */
export function daysAgoLabel(date: Date | string, locale: 'fr' | 'en' = 'fr', now: Date = new Date()): string {
  const n = daysSinceCasa(date, now);
  if (locale === 'fr') return n === 1 ? '1 j' : `${n} j`;
  return n === 1 ? '1 d' : `${n} d`;
}

const MONTHS_FR_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MONTHS_EN_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Format a Date (or YYYY-MM-DD) into "16 mai" / "May 16" in Casa terms.
 * Used by anniversary / arrival / departure lists.
 */
export function formatCasaShortDate(d: Date | string, locale: 'fr' | 'en' = 'fr'): string {
  const ymd = typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d) ? d : casablancaDateOnly(d);
  const day = Number(ymd.slice(8, 10));
  const monthIdx = Number(ymd.slice(5, 7)) - 1;
  const months = locale === 'fr' ? MONTHS_FR_SHORT : MONTHS_EN_SHORT;
  return locale === 'fr' ? `${day} ${months[monthIdx]}` : `${months[monthIdx]} ${day}`;
}
