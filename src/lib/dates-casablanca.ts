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

// ─── Day / month range helpers (UTC instants for Prisma `gte/lte`) ─────────
//
// CONVENTION (read once, follow everywhere)
// =========================================
//   - The DB stores instants in UTC (Postgres `timestamp` columns).
//   - Business filters ("today", "this month", "next 7 days") are calendar
//     bounds in **Africa/Casablanca** (UTC+1 fixed, no DST since 2018).
//   - To query Prisma we convert Casa-local bounds → UTC instants:
//
//        startOfTodayCasa() → first instant of today in Casa, as a UTC Date
//        endOfTodayCasa()   → last  instant of today in Casa, as a UTC Date
//        startOfMonthCasa() / endOfMonthCasa()       — same idea, monthly
//        startOfDayCasa(d) / endOfDayCasa(d)         — for an arbitrary d
//
//     Each returns a `Date` that JS prints in UTC but represents the right
//     Casa wall-clock boundary. Pass these directly to Prisma's `gte / lte`.
//
//     Concrete example: "today" at 00:30 Casa on 2026-05-15:
//        startOfTodayCasa() === 2026-05-14T23:00:00.000Z  (= 2026-05-15 00:00 Casa)
//        endOfTodayCasa()   === 2026-05-15T22:59:59.999Z  (= 2026-05-15 23:59 Casa)
//
//     Compare with the buggy `setUTCHours(0,0,0,0)`, which at the same
//     instant would yield 2026-05-15T00:00:00Z and silently include the
//     last hour of the 14th in "today". This is the root cause of the
//     "dashboard one day behind" bug observed at 00:15 Casa.

/**
 * Current wall-clock instant. Just a wrapper around `new Date()` —
 * exists so call sites read self-documenting (`nowCasa()` flags that
 * the developer is doing Casa-local arithmetic, not naive UTC).
 */
export function nowCasa(): Date {
  return new Date();
}

/**
 * First instant of the Casablanca-local day containing `d`, returned as
 * a UTC Date directly usable in Prisma filters.
 */
export function startOfDayCasa(d: Date | string = new Date()): Date {
  return casablancaStartOfDay(d);
}

/**
 * Last instant of the Casablanca-local day containing `d`. Returns
 * 23:59:59.999 Casa as a UTC Date.
 */
export function endOfDayCasa(d: Date | string = new Date()): Date {
  const start = casablancaStartOfDay(d);
  // Add 24h - 1ms via UTC arithmetic (no DST in Casa → safe).
  return new Date(start.getTime() + 86_400_000 - 1);
}

/** Convenience: today's start in Casa, as a UTC instant. */
export function startOfTodayCasa(): Date {
  return startOfDayCasa(new Date());
}

/** Convenience: today's end in Casa, as a UTC instant. */
export function endOfTodayCasa(): Date {
  return endOfDayCasa(new Date());
}

/**
 * First instant of the Casablanca-local month containing `d`. Implemented
 * by projecting `d` onto the Casa calendar day, snapping to day 01, and
 * converting back to a UTC Date.
 */
export function startOfMonthCasa(d: Date | string = new Date()): Date {
  const ymd = casablancaDateOnly(d); // 'YYYY-MM-DD' in Casa
  const firstOfMonth = `${ymd.slice(0, 7)}-01`;
  return new Date(`${firstOfMonth}T00:00:00+01:00`);
}

/**
 * Last instant of the Casablanca-local month containing `d`. Computes
 * the start of the NEXT month and subtracts 1 ms.
 */
export function endOfMonthCasa(d: Date | string = new Date()): Date {
  const ymd = casablancaDateOnly(d);
  const year = Number(ymd.slice(0, 4));
  const monthIdx = Number(ymd.slice(5, 7)); // 1-12
  // Next month, year wrap. Use Date.UTC arithmetic via ISO construction:
  // "year-(month+1)-01" with overflow handled by Date constructor.
  const nextYear = monthIdx === 12 ? year + 1 : year;
  const nextMonth = monthIdx === 12 ? 1 : monthIdx + 1;
  const nextMonthIso = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
  const nextMonthStart = new Date(`${nextMonthIso}T00:00:00+01:00`);
  return new Date(nextMonthStart.getTime() - 1);
}

/**
 * Return both bounds of the Casablanca-local day for `d`. Convenient for
 * Prisma filters that want both ends without two calls.
 *   prisma.booking.findMany({ where: { startDate: { gte, lte } } })
 */
export function dayRangeCasa(d: Date | string = new Date()): { start: Date; end: Date } {
  return { start: startOfDayCasa(d), end: endOfDayCasa(d) };
}

/**
 * Like `dayRangeCasa` but for a calendar month. Use for "this month",
 * "last month" KPIs, billing summaries, etc.
 */
export function monthRangeCasa(d: Date | string = new Date()): { start: Date; end: Date } {
  return { start: startOfMonthCasa(d), end: endOfMonthCasa(d) };
}

/**
 * Year/month/day integers for `d` as seen by a Casablanca-local wall clock.
 * Use this everywhere you'd otherwise call `.getMonth() / .getFullYear() /
 * .getDate()` on a Date — those return the runtime's local timezone (UTC
 * on Vercel), which is off-by-one across the Casa midnight boundary
 * (00:00 Casa = 23:00 UTC the previous day).
 *
 * Returns `{ year: number, month: 1..12, day: 1..31 }`. The integers are
 * the Casa calendar values, ready to feed into Prisma queries that key on
 * (year, month, day) tuples (e.g. monthly_revenue_mv, MonthlyRevenueSummary).
 *
 * Examples on a UTC-runtime server:
 *   casablancaYMD(new Date('2026-04-30T23:00:00Z'))
 *     → { year: 2026, month: 5, day: 1 }   ← Casa already in May
 *   `(new Date('2026-04-30T23:00:00Z')).getMonth()` → 3 (April) ← the bug
 */
export function casablancaYMD(d: Date | string = new Date()): { year: number; month: number; day: number } {
  const ymd = casablancaDateOnly(d);
  return {
    year: Number(ymd.slice(0, 4)),
    month: Number(ymd.slice(5, 7)),
    day: Number(ymd.slice(8, 10)),
  };
}

/**
 * Convenience: current Casablanca year + month as integers (month 1-12).
 * Replaces the unsafe pattern:
 *   const now = new Date();
 *   const year = now.getFullYear(); const month = now.getMonth() + 1;
 *
 * On a UTC runtime, that pattern returns the *previous* Casa month during
 * the 23:00→00:00 UTC window. This helper is timezone-correct on every
 * runtime.
 */
export function currentMonthCasa(): { year: number; month: number } {
  const { year, month } = casablancaYMD(new Date());
  return { year, month };
}
