// Respectful SMS policy — decides whether a transactional SMS goes out
// immediately, gets deferred to business hours, or is suppressed entirely.
//
// Three independent rules combine in `decideSmsPolicy`:
//
//   1. Walk-in + COMPTA = SKIP
//      Walk-ins paid cash on the spot, have no client account, and don't
//      expect ongoing communication. A "your payment of 1500 MAD has been
//      received" SMS the next day looks like spam from a one-off vendor.
//
//   2. Quiet hours (21h–9h Casablanca) + COMPTA = DEFER until 9h
//      Accounting catch-up at night is a real use case for a solo founder.
//      The SMS itself is non-urgent — it can wait until the client is
//      awake. Operations SMS (taxi arrival, urgent admin alerts) bypass.
//
//   3. ADMIN recipient OR OPS category = SEND NOW
//      Admin notifications and operational events (taxi tracking, animal
//      en route, booking confirmation right after submission) must be
//      real-time. No delay, no skip, no consideration of hour.
//
// Casablanca is UTC+1 year-round (no DST since Morocco's 2018 reform).
// All time math is anchored on that fixed offset.

export type SmsCategory =
  /** Operations event — taxi tracking, urgent admin alerts, booking confirms.
   *  Always immediate. Never deferred, never suppressed by recipient type. */
  | 'OPS'
  /** Accounting / billing event — payment received, stay completed,
   *  invoice issued. Subject to quiet hours and walk-in suppression. */
  | 'COMPTA';

export type SmsRecipientType =
  /** Has a client account, expects ongoing communication. */
  | 'standard'
  /** One-off cash payer, no account, no follow-up communication expected. */
  | 'walkin'
  /** The 'ADMIN' sentinel — routes to env.ADMIN_PHONE. Always real-time. */
  | 'admin';

export interface SmsPolicyInput {
  category: SmsCategory;
  recipient: SmsRecipientType;
  /** Defaults to `new Date()`. Injected for tests. */
  now?: Date;
}

export type SmsPolicyDecision =
  | { kind: 'send-now' }
  | { kind: 'defer'; delayMs: number; reason: 'quiet_hours' }
  | { kind: 'skip'; reason: 'walkin_compta' };

// Casablanca = UTC+1 fixed (Morocco abolished DST in 2018, then pinned the
// clock to permanent +01:00). If that ever changes, this constant is the
// ONE place to update — every quiet-hours computation flows through here.
const CASA_OFFSET_MINUTES = 60;

// Business window: 9:00 (inclusive) to 21:00 (exclusive) Casablanca local.
// 21:00 is "the clients are starting to settle in"; 9:00 is "phones are
// awake again". Tunable here without touching the rest.
export const QUIET_HOUR_START = 21; // 21:00 Casa = SMS go quiet
export const QUIET_HOUR_END = 9;    // 09:00 Casa = SMS resume

function casaLocalHour(now: Date): number {
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  return Math.floor((utcMinutes + CASA_OFFSET_MINUTES) / 60) % 24;
}

/** True iff `now` falls inside the Casablanca-local quiet window. */
export function isQuietHoursCasablanca(now: Date = new Date()): boolean {
  const h = casaLocalHour(now);
  return h < QUIET_HOUR_END || h >= QUIET_HOUR_START;
}

/**
 * Milliseconds from `now` until the next 9:00 Casablanca opening.
 * Returns 0 if we are already in business hours.
 *
 * Examples (Casa offset UTC+1):
 *   now=23:00 Casa → +10h until 09:00 Casa tomorrow
 *   now=07:00 Casa → +2h until 09:00 Casa same day
 *   now=14:00 Casa → 0 (business hours, no delay)
 */
export function delayUntilBusinessHoursMs(now: Date = new Date()): number {
  if (!isQuietHoursCasablanca(now)) return 0;

  // 9:00 Casa = 8:00 UTC (offset +1).
  const target = new Date(now);
  target.setUTCHours(QUIET_HOUR_END - CASA_OFFSET_MINUTES / 60, 0, 0, 0);
  if (target.getTime() <= now.getTime()) {
    // Today's 8:00 UTC already passed — schedule for tomorrow.
    target.setUTCDate(target.getUTCDate() + 1);
  }
  return target.getTime() - now.getTime();
}

/**
 * Classify a client object based on its persisted properties.
 * Defensive: any nullish/missing value collapses to 'standard' so callers
 * with partial data err on the safer side (a non-walk-in receives normal
 * SMS — never the other way around).
 *
 * `isWalkIn` is the canonical source. The previous workaround that
 * relied on the `User.isWalkIn` AND `Booking.isWalkIn` OR-pattern is
 * expected upstream of this function (caller decides which flag to pass).
 */
export function classifyRecipient(client: { isWalkIn?: boolean | null } | null | undefined): SmsRecipientType {
  if (!client) return 'standard';
  return client.isWalkIn ? 'walkin' : 'standard';
}

/**
 * Pure policy decision. Inputs in, decision out. Side-effect free; the
 * caller (`sendSmsRespectful`) translates the decision into actions.
 *
 * Decision matrix:
 *
 *               | Standard           | Walk-in         | Admin    |
 *   ------------+--------------------+-----------------+----------+
 *   OPS         | send-now           | send-now        | send-now |
 *   COMPTA      | send-now (day)     | skip            | send-now |
 *               | defer 9h (night)   |                 |          |
 *
 * Admin recipient always wins — the operator needs operational
 * awareness regardless of category or hour.
 */
export function decideSmsPolicy(input: SmsPolicyInput): SmsPolicyDecision {
  const now = input.now ?? new Date();

  // Admin sentinel: always immediate. The operator needs to know what
  // happened on their account; respecting their own quiet hours when
  // they themselves are doing the action would be perverse.
  if (input.recipient === 'admin') {
    return { kind: 'send-now' };
  }

  // Operations: always immediate (taxi tracking, booking confirms…).
  // These exist because the user is actively waiting on the event.
  if (input.category === 'OPS') {
    return { kind: 'send-now' };
  }

  // From here: category === 'COMPTA' (non-urgent finance/admin SMS).

  // Walk-in + COMPTA: skip outright. A one-off cash customer should not
  // receive an "your payment of X has been received" SMS the next day.
  if (input.recipient === 'walkin') {
    return { kind: 'skip', reason: 'walkin_compta' };
  }

  // Standard client + COMPTA: respect quiet hours.
  if (isQuietHoursCasablanca(now)) {
    return {
      kind: 'defer',
      delayMs: delayUntilBusinessHoursMs(now),
      reason: 'quiet_hours',
    };
  }

  return { kind: 'send-now' };
}
