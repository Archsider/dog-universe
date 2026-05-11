// Helpers timezone Maroc — toute logique métier "horaire local" passe par
// ce fichier. Vercel runs en UTC, le Maroc est UTC+1 (Africa/Casablanca).
// Ne JAMAIS utiliser getDay/getHours/getDate sur un Date directement
// pour des règles métier — toujours via ces helpers.
import { toZonedTime, fromZonedTime } from 'date-fns-tz';

export const CASA_TZ = 'Africa/Casablanca';
const TZ = CASA_TZ;

/**
 * Returns the UTC instant corresponding to 00:00:00.000 *local Casablanca*
 * on the same calendar day as `date`. Replaces `setHours(0,0,0,0)` which
 * interprets the day in the server (UTC) timezone — wrong for cron windows
 * and "today" comparisons in a Morocco-only product.
 */
export function getCasaStartOfDay(date: Date = new Date()): Date {
  const zoned = toZonedTime(date, CASA_TZ);
  zoned.setHours(0, 0, 0, 0);
  return fromZonedTime(zoned, CASA_TZ);
}

/** Upper-bound complement of `getCasaStartOfDay`. */
export function getCasaEndOfDay(date: Date = new Date()): Date {
  const zoned = toZonedTime(date, CASA_TZ);
  zoned.setHours(23, 59, 59, 999);
  return fromZonedTime(zoned, CASA_TZ);
}

export function getDayOfWeekMaroc(date: Date): number {
  // 0 = dimanche, 6 = samedi
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' });
  const day = fmt.format(date);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(day);
}

export function getHourMaroc(date: Date): number {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hour12: false });
  // Intl peut retourner "24" à minuit dans certains environnements ; normaliser à 0.
  const h = parseInt(fmt.format(date), 10);
  return h === 24 ? 0 : h;
}

export function getMinuteMaroc(date: Date): number {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, minute: 'numeric' });
  return parseInt(fmt.format(date), 10);
}

export function getMonthMaroc(date: Date): number {
  // 0 = janvier
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, month: 'numeric' });
  return parseInt(fmt.format(date), 10) - 1;
}

export function getYearMaroc(date: Date): number {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric' });
  return parseInt(fmt.format(date), 10);
}

/** Retourne YYYY-MM-DD dans le fuseau Maroc */
export function toDateStringMaroc(date: Date): string {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }); // en-CA → YYYY-MM-DD
  return fmt.format(date);
}

/** Construit un Date qui représente midi UTC du jour Y-M-D au Maroc (ie 11h Maroc en hiver). */
export function utcNoonOfMarocDay(year: number, monthIndex: number, day: number): Date {
  // 12h Maroc = 11h UTC (Maroc UTC+1 constant, pas de DST depuis 2018).
  return new Date(Date.UTC(year, monthIndex, day, 11, 0, 0, 0));
}
