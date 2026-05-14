// Calendar-day arithmetic anchored on Casablanca local time.
//
// Why this exists:
//   Plain `Date` math (e.g. `Math.round((end - now) / 86_400_000)`) compares
//   wall-clock INSTANTS, not calendar days. Two timestamps stored at
//   midnight UTC look "1 day apart" if you measure them from a UTC+1
//   afternoon — even though their Casablanca-local dates are 2 days
//   apart. Bug #2 (the "Départ demain" badge showing for a departure
//   2 days away) was exactly that: 16-May 00:00 UTC minus 14-May 13:00
//   UTC = 35h, Math.round → 1 day → wrong badge.
//
//   Morocco abolished DST in 2018 and pinned the clock to permanent
//   UTC+01:00, so we can do all the math with a single fixed offset.
//   No IANA tz library needed.
//
// Convention:
//   "Casablanca calendar day" = the YYYY-MM-DD a wall clock in Casablanca
//   would show. Day boundaries are 00:00:00 Casa (= 23:00:00 UTC the
//   previous day).
//
// Use everywhere we display or branch on "aujourd'hui / demain / cette
// semaine" — `Date.now()` and `differenceInDays` (date-fns naive form)
// are NOT timezone-safe and lead to off-by-one bugs at every boundary.

const CASA_OFFSET_MINUTES = 60;
const MS_PER_DAY = 86_400_000;

/**
 * Returns the YYYY-MM-DD string for `d` as seen by a Casablanca-local
 * wall clock. Example: a `Date` at 2026-05-14T23:30:00Z (= 00:30 Casa
 * on 2026-05-15) returns `'2026-05-15'`.
 *
 * Output is timezone-free — comparable with string equality across any
 * server runtime. Round-trippable via `casablancaDateAtStartOfDay`.
 */
export function casablancaDateOnly(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  // Shift by the Casa offset, then read UTC components — that gives
  // the calendar day a Casa-local viewer would see.
  const shifted = new Date(date.getTime() + CASA_OFFSET_MINUTES * 60_000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * UTC instant corresponding to 00:00 Casablanca on the same calendar
 * day as `d`. Useful for date-only arithmetic without losing the day
 * boundary across timezones.
 */
export function casablancaStartOfDay(d: Date | string): Date {
  const ymd = casablancaDateOnly(d);
  // 00:00 Casa = 23:00 UTC previous day, but it's simpler to express as
  // `${YYYY-MM-DD}T00:00:00+01:00` which the Date constructor resolves
  // to the correct UTC instant.
  return new Date(`${ymd}T00:00:00+01:00`);
}

/**
 * Whole-day delta between two timestamps measured on the Casablanca
 * calendar. Result is an integer (positive when `end` is later than
 * `from`, negative otherwise). The fractional day caused by intra-day
 * times is discarded — both sides are first projected to their Casa
 * calendar day.
 *
 * Examples (UTC ms):
 *   from = 2026-05-14T13:00Z → 14:00 Casa → calendar 2026-05-14
 *   end  = 2026-05-16T00:00Z → 01:00 Casa → calendar 2026-05-16
 *   daysUntilCasablanca(end, from) === 2  (not 1, not 1.5)
 */
export function daysUntilCasablanca(end: Date | string, from: Date | string = new Date()): number {
  const a = casablancaStartOfDay(from).getTime();
  const b = casablancaStartOfDay(end).getTime();
  return Math.round((b - a) / MS_PER_DAY);
}

/**
 * True iff `end` falls on the Casablanca calendar day immediately
 * after `from`. The canonical "Départ demain" test.
 */
export function isDepartureTomorrowCasablanca(end: Date | string, from: Date | string = new Date()): boolean {
  return daysUntilCasablanca(end, from) === 1;
}

/**
 * True iff both timestamps land on the same Casablanca calendar day.
 */
export function isSameDayCasablanca(a: Date | string, b: Date | string): boolean {
  return casablancaDateOnly(a) === casablancaDateOnly(b);
}
