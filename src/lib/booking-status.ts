// Booking status & open-ended predicates — single source of truth for the
// rules:
//   1. "Active stay" = status IN ('CONFIRMED', 'IN_PROGRESS'). Never derived
//      from endDate. Admin transitions PENDING→CONFIRMED→IN_PROGRESS→COMPLETED.
//   2. "Open-ended" = isOpenEnded === true OR endDate IS NULL. Walk-ins and
//      registered clients without a known end date are treated identically:
//        - counted active while status is CONFIRMED/IN_PROGRESS,
//        - displayed with "?" in date fields,
//        - provisional total,
//        - excluded from date-window capacity checks (admin manages overbooking),
//        - closed manually by the admin via checkout.
//
// Use these helpers everywhere instead of ad-hoc endDate / isOpenEnded checks.

export const ACTIVE_STAY_STATUSES = ['CONFIRMED', 'IN_PROGRESS'] as const;

export function isActiveStay(b: { status: string }): boolean {
  return b.status === 'CONFIRMED' || b.status === 'IN_PROGRESS';
}

export function isOpenEndedBooking(
  b: { isOpenEnded?: boolean | null; endDate?: Date | string | null },
): boolean {
  return !!b.isOpenEnded || b.endDate == null;
}

const MS_PER_DAY = 86_400_000;

// Whole-day count between two dates (rounded). Stays are stored midnight-aligned
// so this is an integer in practice.
export function nightsBetween(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  return Math.max(0, Math.round(ms / MS_PER_DAY));
}

// Nights of the closed range [bStart, bEnd] that fall inside [wStart, wEnd].
// Returns 0 when there is no overlap or the range is degenerate.
export function nightsOverlap(
  bStart: Date,
  bEnd: Date,
  wStart: Date,
  wEnd: Date,
): number {
  const start = bStart > wStart ? bStart : wStart;
  const end = bEnd < wEnd ? bEnd : wEnd;
  if (end.getTime() <= start.getTime()) return 0;
  return nightsBetween(start, end);
}
