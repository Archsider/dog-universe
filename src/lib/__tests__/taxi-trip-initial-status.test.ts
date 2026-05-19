import { describe, it, expect } from 'vitest';
import {
  initialTaxiTripStatus,
  isTerminalInitialStatus,
} from '../taxi-trip-initial-status';

describe('initialTaxiTripStatus', () => {
  describe('booking is live (PENDING/CONFIRMED/IN_PROGRESS)', () => {
    it.each(['PENDING', 'CONFIRMED', 'IN_PROGRESS'])(
      'returns PLANNED for OUTBOUND on %s',
      (status) => {
        expect(initialTaxiTripStatus(status, 'OUTBOUND')).toBe('PLANNED');
      },
    );

    it.each(['PENDING', 'CONFIRMED', 'IN_PROGRESS'])(
      'returns PLANNED for RETURN on %s',
      (status) => {
        expect(initialTaxiTripStatus(status, 'RETURN')).toBe('PLANNED');
      },
    );

    it.each(['PENDING', 'CONFIRMED', 'IN_PROGRESS'])(
      'returns PLANNED for STANDALONE on %s',
      (status) => {
        expect(initialTaxiTripStatus(status, 'STANDALONE')).toBe('PLANNED');
      },
    );
  });

  describe('booking is already COMPLETED (retroactive walk-in)', () => {
    it('returns ARRIVED_AT_PENSION for OUTBOUND', () => {
      expect(initialTaxiTripStatus('COMPLETED', 'OUTBOUND')).toBe('ARRIVED_AT_PENSION');
    });

    it('returns ARRIVED_AT_PENSION for STANDALONE', () => {
      expect(initialTaxiTripStatus('COMPLETED', 'STANDALONE')).toBe('ARRIVED_AT_PENSION');
    });

    it('returns ARRIVED_AT_CLIENT for RETURN', () => {
      expect(initialTaxiTripStatus('COMPLETED', 'RETURN')).toBe('ARRIVED_AT_CLIENT');
    });
  });

  describe('booking CANCELLED / REJECTED / NO_SHOW', () => {
    // Defensive : these statuses shouldn't lead to taxi addon creation in
    // practice (the UI gates it), but if they ever do, defaulting to PLANNED
    // is the safer choice — the admin can use the force-complete shortcut
    // to correct it.
    it.each(['CANCELLED', 'REJECTED', 'NO_SHOW'])('falls back to PLANNED on %s', (status) => {
      expect(initialTaxiTripStatus(status, 'OUTBOUND')).toBe('PLANNED');
    });
  });
});

describe('isTerminalInitialStatus', () => {
  it('returns true only for COMPLETED bookings', () => {
    expect(isTerminalInitialStatus('COMPLETED')).toBe(true);
    expect(isTerminalInitialStatus('PENDING')).toBe(false);
    expect(isTerminalInitialStatus('CONFIRMED')).toBe(false);
    expect(isTerminalInitialStatus('IN_PROGRESS')).toBe(false);
    expect(isTerminalInitialStatus('CANCELLED')).toBe(false);
  });
});
