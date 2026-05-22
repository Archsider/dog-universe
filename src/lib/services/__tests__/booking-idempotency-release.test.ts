/**
 * Business rule — booking idempotency key (Stripe pattern).
 *
 * Rule: the idempotency key protects against double-submit (same attempt
 * replayed), it is NOT a deterministic natural key. Concretely in
 * `createBookingTx`:
 *   - existing ACTIVE booking with same key → return it (idempotent replay).
 *   - existing SOFT-DELETED booking with same key → release the dead key
 *     (idempotencyKey = null) then create the new booking. Without this the
 *     soft-deleted row's unique key blocks re-creation → P2002 (prod bug
 *     2026-05-22).
 *   - no existing key → create directly.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const tx = {
    booking: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    boardingDetail: { create: vi.fn() },
    taxiTrip: { create: vi.fn() },
    taxiStatusHistory: { create: vi.fn() },
    taxiDetail: { create: vi.fn() },
    timeProposal: { createMany: vi.fn() },
  };
  return {
    tx,
    prisma: { $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)) },
    checkBoardingCapacity: vi.fn(),
    withSpan: vi.fn((_n: string, _a: unknown, fn: () => unknown) => fn()),
  };
});

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/capacity', () => ({ checkBoardingCapacity: mocks.checkBoardingCapacity }));
vi.mock('@/lib/observability', () => ({ withSpan: mocks.withSpan }));
vi.mock('@/lib/timezone', () => ({
  getDayOfWeekMaroc: vi.fn(), getHourMaroc: vi.fn(), getMinuteMaroc: vi.fn(),
}));
vi.mock('@/lib/taxi-trip-initial-status', () => ({
  initialTaxiTripStatus: vi.fn(() => 'SCHEDULED'),
  isTerminalInitialStatus: vi.fn(() => false),
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { createBookingTx } from '@/lib/services/booking-client.service';

const baseArgs = {
  clientId: 'client-1',
  serviceType: 'BOARDING' as const,
  isAdmin: true,
  waitlistFallback: false,
  startDate: new Date('2099-06-01'),
  endDate: new Date('2099-06-05'),
  isOpenEnded: false,
  arrivalTime: null,
  notes: null,
  totalPrice: 600,
  source: 'MANUAL',
  petIds: ['pet-1'],
  idempotencyKey: 'dup-key-12345678',
  includeGrooming: false,
  groomingSize: null,
  groomingPrice: 0,
  pricePerNight: 120,
  taxiGoEnabled: false,
  taxiGoDate: null, taxiGoTime: null, taxiGoAddress: null,
  taxiReturnEnabled: false,
  taxiReturnDate: null, taxiReturnTime: null, taxiReturnAddress: null,
  taxiAddonPrice: 0,
  taxiType: 'STANDARD' as const,
  bookingItems: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.checkBoardingCapacity.mockResolvedValue({ ok: true });
  mocks.tx.booking.create.mockResolvedValue({ id: 'new-booking', bookingPets: [], client: {} });
  mocks.tx.booking.update.mockResolvedValue({});
});

describe('createBookingTx — idempotency key business rule', () => {
  it('ACTIVE duplicate → returns existing (idempotent replay), no create', async () => {
    mocks.tx.booking.findUnique.mockResolvedValue({ id: 'existing-active', deletedAt: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await createBookingTx(baseArgs as any);
    expect((result as { id: string }).id).toBe('existing-active');
    expect(mocks.tx.booking.create).not.toHaveBeenCalled();
    expect(mocks.tx.booking.update).not.toHaveBeenCalled();
  });

  it('SOFT-DELETED duplicate → releases the dead key then creates (no P2002)', async () => {
    mocks.tx.booking.findUnique.mockResolvedValue({ id: 'existing-deleted', deletedAt: new Date() });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await createBookingTx(baseArgs as any);
    expect(mocks.tx.booking.update).toHaveBeenCalledWith({
      where: { id: 'existing-deleted' },
      data: { idempotencyKey: null },
    });
    expect(mocks.tx.booking.create).toHaveBeenCalled();
    expect((result as { id: string }).id).toBe('new-booking');
  });

  it('no existing key → creates directly, no release', async () => {
    mocks.tx.booking.findUnique.mockResolvedValue(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await createBookingTx(baseArgs as any);
    expect(mocks.tx.booking.update).not.toHaveBeenCalled();
    expect(mocks.tx.booking.create).toHaveBeenCalled();
  });
});
