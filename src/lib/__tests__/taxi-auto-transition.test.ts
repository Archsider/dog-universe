/**
 * Unit tests — maybeAutoTransition (geofence auto status advance).
 *
 * Pins the P0 fix: the dropoff terminal must be the CANONICAL status per trip
 * type (ARRIVED_AT_PENSION for OUTBOUND/STANDALONE, ARRIVED_AT_CLIENT for
 * RETURN) — never the legacy 'ARRIVED_AT_DESTINATION' that no consumer
 * recognised. Terminal transitions must also stop tracking and complete
 * STANDALONE bookings, mirroring the manual status route.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const tx = {
    taxiTrip: { findUnique: vi.fn(), update: vi.fn() },
    taxiStatusHistory: { create: vi.fn() },
    booking: { updateMany: vi.fn() },
  };
  return {
    tx,
    prisma: {
      $transaction: vi.fn(async (fn: unknown) =>
        typeof fn === 'function' ? (fn as (t: typeof tx) => unknown)(tx) : fn,
      ),
      taxiTrip: { findUnique: vi.fn().mockResolvedValue({ booking: { client: {}, bookingPets: [] } }) },
    },
    tryAcquireFlag: vi.fn().mockResolvedValue(true),
    clearLocation: vi.fn().mockResolvedValue(undefined),
    notifyTaxiTransition: vi.fn().mockResolvedValue(undefined),
    // 50 m radius → return a tiny distance so the geofence always fires.
    haversineDistance: vi.fn().mockReturnValue(5),
  };
});

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/geo', () => ({ haversineDistance: mocks.haversineDistance }));
vi.mock('@/lib/cache', () => ({ tryAcquireFlag: mocks.tryAcquireFlag }));
vi.mock('@/lib/taxi-location', () => ({ clearLocation: mocks.clearLocation }));
vi.mock('@/lib/taxi-notifications', () => ({ notifyTaxiTransition: mocks.notifyTaxiTransition }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { maybeAutoTransition } from '@/lib/taxi-auto-transition';

const dropoffArgs = {
  tripId: 't1',
  currentStatus: 'ANIMAL_ON_BOARD',
  currentLat: 33.5,
  currentLng: -7.6,
  pickupLat: 33.4,
  pickupLng: -7.5,
  dropoffLat: 33.5,
  dropoffLng: -7.6,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tryAcquireFlag.mockResolvedValue(true);
  mocks.haversineDistance.mockReturnValue(5);
  mocks.prisma.taxiTrip.findUnique.mockResolvedValue({ booking: { client: {}, bookingPets: [] } });
});

describe('maybeAutoTransition — dropoff terminal is canonical per trip type', () => {
  it('STANDALONE dropoff → ARRIVED_AT_PENSION + stops tracking + completes booking', async () => {
    mocks.tx.taxiTrip.findUnique.mockResolvedValue({ status: 'ANIMAL_ON_BOARD', tripType: 'STANDALONE', bookingId: 'b1' });
    const result = await maybeAutoTransition(dropoffArgs);
    expect(result).toBe('ARRIVED_AT_PENSION');
    expect(mocks.tx.taxiTrip.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { status: 'ARRIVED_AT_PENSION', trackingActive: false, trackingToken: null },
    });
    expect(mocks.tx.booking.updateMany).toHaveBeenCalledWith({
      where: { id: 'b1', status: 'IN_PROGRESS' },
      data: { status: 'COMPLETED' },
    });
    expect(mocks.clearLocation).toHaveBeenCalledWith('b1');
  });

  it('RETURN dropoff → ARRIVED_AT_CLIENT (never ARRIVED_AT_DESTINATION)', async () => {
    mocks.tx.taxiTrip.findUnique.mockResolvedValue({ status: 'ANIMAL_ON_BOARD', tripType: 'RETURN', bookingId: 'b2' });
    const result = await maybeAutoTransition(dropoffArgs);
    expect(result).toBe('ARRIVED_AT_CLIENT');
    // RETURN is a boarding addon — booking must NOT be auto-completed by the leg.
    expect(mocks.tx.booking.updateMany).not.toHaveBeenCalled();
  });

  it('OUTBOUND dropoff → ARRIVED_AT_PENSION', async () => {
    mocks.tx.taxiTrip.findUnique.mockResolvedValue({ status: 'ANIMAL_ON_BOARD', tripType: 'OUTBOUND', bookingId: 'b3' });
    const result = await maybeAutoTransition(dropoffArgs);
    expect(result).toBe('ARRIVED_AT_PENSION');
    expect(mocks.tx.booking.updateMany).not.toHaveBeenCalled();
  });

  it('intermediate EN_ROUTE_TO_CLIENT → ON_SITE_CLIENT does not stop tracking', async () => {
    mocks.tx.taxiTrip.findUnique.mockResolvedValue({ status: 'EN_ROUTE_TO_CLIENT', tripType: 'STANDALONE', bookingId: 'b4' });
    const result = await maybeAutoTransition({ ...dropoffArgs, currentStatus: 'EN_ROUTE_TO_CLIENT' });
    expect(result).toBe('ON_SITE_CLIENT');
    expect(mocks.tx.taxiTrip.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { status: 'ON_SITE_CLIENT' },
    });
    expect(mocks.clearLocation).not.toHaveBeenCalled();
  });

  it('no-op when status advanced manually between read and write', async () => {
    mocks.tx.taxiTrip.findUnique.mockResolvedValue({ status: 'ARRIVED_AT_PENSION', tripType: 'STANDALONE', bookingId: 'b5' });
    const result = await maybeAutoTransition(dropoffArgs);
    expect(result).toBeNull();
    expect(mocks.tx.taxiTrip.update).not.toHaveBeenCalled();
  });

  it('respects the idempotency flag (already fired)', async () => {
    mocks.tryAcquireFlag.mockResolvedValue(false);
    const result = await maybeAutoTransition(dropoffArgs);
    expect(result).toBeNull();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });
});
