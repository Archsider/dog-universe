/**
 * Booking lifecycle state machine.
 *
 * Centralises the legal transitions between booking statuses so admin mutation
 * paths cannot accidentally jump from a terminal state (e.g. COMPLETED) back
 * to an earlier one. Used by `PATCH /api/admin/bookings/[id]` before any
 * `prisma.booking.update({ data: { status } })`.
 *
 * Conventions:
 *   - Transitioning to the same status is a no-op (allowed).
 *   - CANCELLED, REJECTED, COMPLETED, NO_SHOW are terminal: no outbound edges.
 *     Restore-from-cancelled flows must NOT pass through this guard — they
 *     have their own audit trail.
 *   - WAITLIST → CANCELLED supports a client desisting before promotion.
 *   - PENDING_EXTENSION lives in its own sub-flow and resolves to either
 *     CONFIRMED (merged into original) or CANCELLED (rejected/withdrawn).
 *
 * The machine is deliberately conservative — when in doubt, the admin can
 * still call the underlying service path that owns the transition.
 */

export type BookingStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REJECTED'
  | 'WAITLIST'
  | 'PENDING_EXTENSION'
  | 'NO_SHOW';

const TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  PENDING: ['CONFIRMED', 'REJECTED', 'CANCELLED', 'WAITLIST'],
  CONFIRMED: ['IN_PROGRESS', 'CANCELLED', 'NO_SHOW', 'PENDING_EXTENSION'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED', 'NO_SHOW'],
  COMPLETED: [], // terminal
  CANCELLED: [], // terminal — restore is an out-of-band admin action
  REJECTED: [],
  WAITLIST: ['PENDING', 'CANCELLED'],
  PENDING_EXTENSION: ['CONFIRMED', 'CANCELLED'],
  NO_SHOW: [],
};

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  if (from === to) return true; // self-transition is a no-op
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: BookingStatus, to: BookingStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`INVALID_TRANSITION:${from}->${to}`);
  }
}

export function isBookingStatus(s: string): s is BookingStatus {
  return s in TRANSITIONS;
}
