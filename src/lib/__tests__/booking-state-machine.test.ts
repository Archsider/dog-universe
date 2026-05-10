import { describe, it, expect } from 'vitest';
import {
  canTransition,
  assertTransition,
  type BookingStatus,
} from '../booking-state-machine';

const ALL: BookingStatus[] = [
  'PENDING',
  'CONFIRMED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'REJECTED',
  'WAITLIST',
  'PENDING_EXTENSION',
  'NO_SHOW',
];

const ALLOWED: Array<[BookingStatus, BookingStatus]> = [
  ['PENDING', 'CONFIRMED'],
  ['PENDING', 'REJECTED'],
  ['PENDING', 'CANCELLED'],
  ['PENDING', 'WAITLIST'],
  ['CONFIRMED', 'IN_PROGRESS'],
  ['CONFIRMED', 'CANCELLED'],
  ['CONFIRMED', 'NO_SHOW'],
  ['CONFIRMED', 'PENDING_EXTENSION'],
  ['IN_PROGRESS', 'COMPLETED'],
  ['IN_PROGRESS', 'CANCELLED'],
  ['IN_PROGRESS', 'NO_SHOW'],
  ['WAITLIST', 'PENDING'],
  ['WAITLIST', 'CANCELLED'],
  ['PENDING_EXTENSION', 'CONFIRMED'],
  ['PENDING_EXTENSION', 'CANCELLED'],
];

describe('booking-state-machine', () => {
  it('allows every documented transition', () => {
    for (const [from, to] of ALLOWED) {
      expect(canTransition(from, to), `${from} -> ${to} should be allowed`).toBe(true);
    }
  });

  it('allows self-transition for every status (idempotent update)', () => {
    for (const s of ALL) {
      expect(canTransition(s, s)).toBe(true);
    }
  });

  it('rejects every transition not in the whitelist', () => {
    const allowedKeys = new Set(ALLOWED.map(([f, t]) => `${f}->${t}`));
    for (const from of ALL) {
      for (const to of ALL) {
        if (from === to) continue; // self-transition handled above
        const key = `${from}->${to}`;
        if (allowedKeys.has(key)) continue;
        expect(canTransition(from, to), `${from} -> ${to} should be rejected`).toBe(false);
      }
    }
  });

  it('enforces all four terminal statuses', () => {
    for (const terminal of ['COMPLETED', 'REJECTED', 'NO_SHOW'] as BookingStatus[]) {
      for (const to of ALL) {
        if (to === terminal) continue;
        expect(canTransition(terminal, to), `${terminal} -> ${to} should be rejected`).toBe(false);
      }
    }
    // CANCELLED is also terminal in the state machine (restore is out-of-band).
    for (const to of ALL) {
      if (to === 'CANCELLED') continue;
      expect(canTransition('CANCELLED', to)).toBe(false);
    }
  });

  it('assertTransition throws INVALID_TRANSITION:<from>-><to>', () => {
    expect(() => assertTransition('COMPLETED', 'PENDING')).toThrow(
      'INVALID_TRANSITION:COMPLETED->PENDING',
    );
    expect(() => assertTransition('PENDING', 'CONFIRMED')).not.toThrow();
  });
});
