// Wave-1 bug #3 regression suite. The cascade lives inside
// status-transitions.ts (private helper), so we test by spinning up a
// mock Prisma client that records the writes and asserting the resulting
// SQL-shaped intent. The integration test that actually round-trips a
// transaction is the real-PG one (skipped locally, runs in CI when the
// INTEGRATION_DATABASE_URL env var is set).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  // Booking + cron + queues + everything else mocked into harmless no-ops
  // so we can import status-transitions.ts without dragging the whole world.
  findMany: vi.fn(),
  update: vi.fn(),
  historyCreate: vi.fn(),
  $transaction: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    taxiTrip: {
      findMany: mocks.findMany,
      // The IN_PROGRESS branch calls findFirst — stub to a benign noop so
      // those test cases don't reach for a missing method.
      findFirst: vi.fn().mockResolvedValue(null),
    },
    booking: {
      count: vi.fn().mockResolvedValue(0),
    },
    invoice: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { amount: 0 } }),
    },
    loyaltyGrade: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
    },
    // The transaction callback receives a tx object with the same shape
    // we use inside finalizeTaxiTripsForBooking.
    $transaction: mocks.$transaction,
  },
}));

vi.mock('@/lib/log', () => ({
  logAction: vi.fn(),
  LOG_ACTIONS: { BOOKING_COMPLETED: 'BOOKING_COMPLETED' },
}));

vi.mock('@/lib/email', () => ({ getEmailTemplate: vi.fn(() => ({ subject: '', html: '' })) }));
vi.mock('@/lib/notify-now', () => ({
  sendEmailNow: vi.fn(),
  sendSmsNow: vi.fn(),
  sendSmsRespectful: vi.fn(),
}));
vi.mock('@/lib/notifications', () => ({
  createBookingValidationNotification: vi.fn(),
  createBookingRefusalNotification: vi.fn(),
  createBookingInProgressNotification: vi.fn(),
  createBookingCompletedNotification: vi.fn(),
  createBookingNoShowNotification: vi.fn(),
  promoteWaitlistedBooking: vi.fn(),
}));
vi.mock('@sentry/nextjs', () => ({
  startSpan: vi.fn((_opts, fn) => fn()),
}));

// runStatusSideEffects is the public entry point; we exercise it with a
// minimal "BookingForStatus" payload and assert the cascade fired.
import { runStatusSideEffects } from '@/lib/services/booking-admin/status-transitions';

beforeEach(() => {
  mocks.findMany.mockReset();
  mocks.update.mockReset();
  mocks.historyCreate.mockReset();
  mocks.$transaction.mockReset();
  // Default: $transaction immediately invokes the callback with a tx
  // object built from update/historyCreate mocks.
  mocks.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      taxiTrip: { update: mocks.update },
      taxiStatusHistory: { create: mocks.historyCreate },
    };
    return cb(tx);
  });
});

const baseBooking = {
  id: 'bk-1',
  status: 'IN_PROGRESS',
  serviceType: 'BOARDING',
  startDate: new Date('2026-05-11T00:00:00Z'),
  endDate: new Date('2026-05-14T00:00:00Z'),
  arrivalTime: '10:00',
  clientId: 'cl-1',
  client: {
    name: 'Benjamin Boksenbaum',
    email: 'b@x.test',
    phone: '+212600000001',
    language: 'fr',
    isWalkIn: false,
  },
  bookingPets: [{ pet: { id: 'p1', name: 'Elvis', species: 'DOG', gender: 'MALE' } }],
  boardingDetail: { includeGrooming: false },
  taxiDetail: null,
};

describe('Booking → COMPLETED cascades all active TaxiTrips to terminal', () => {
  it('OUTBOUND active trip becomes ARRIVED_AT_PENSION', async () => {
    mocks.findMany.mockResolvedValueOnce([
      { id: 'tt-1', tripType: 'OUTBOUND' },
    ]);
    await runStatusSideEffects({ booking: baseBooking, newStatus: 'COMPLETED', actorId: 'admin-1' });

    expect(mocks.findMany).toHaveBeenCalledWith({
      where: {
        bookingId: 'bk-1',
        status: { in: ['EN_ROUTE_TO_CLIENT', 'ON_SITE_CLIENT', 'ANIMAL_ON_BOARD'] },
      },
      select: { id: true, tripType: true },
    });
    expect(mocks.update).toHaveBeenCalledTimes(1);
    const updateArg = mocks.update.mock.calls[0][0];
    expect(updateArg.where.id).toBe('tt-1');
    expect(updateArg.data.status).toBe('ARRIVED_AT_PENSION');
    expect(updateArg.data.trackingActive).toBe(false);
    expect(updateArg.data.trackingToken).toBeNull();
    expect(mocks.historyCreate).toHaveBeenCalledWith({
      data: { taxiTripId: 'tt-1', status: 'ARRIVED_AT_PENSION', updatedBy: 'admin-1' },
    });
  });

  it('RETURN active trip becomes ARRIVED_AT_CLIENT (the right terminal for return legs)', async () => {
    mocks.findMany.mockResolvedValueOnce([
      { id: 'tt-2', tripType: 'RETURN' },
    ]);
    await runStatusSideEffects({ booking: baseBooking, newStatus: 'COMPLETED', actorId: 'admin-1' });
    const updateArg = mocks.update.mock.calls[0][0];
    expect(updateArg.data.status).toBe('ARRIVED_AT_CLIENT');
  });

  it('STANDALONE active trip becomes ARRIVED_AT_PENSION (default terminal)', async () => {
    mocks.findMany.mockResolvedValueOnce([
      { id: 'tt-3', tripType: 'STANDALONE' },
    ]);
    await runStatusSideEffects({ booking: baseBooking, newStatus: 'COMPLETED', actorId: 'admin-1' });
    const updateArg = mocks.update.mock.calls[0][0];
    expect(updateArg.data.status).toBe('ARRIVED_AT_PENSION');
  });

  it('PLANNED trip is left untouched — we never fabricate a delivery that never happened', async () => {
    // findMany filter excludes PLANNED upstream, so the cascade simply
    // sees zero rows and does nothing.
    mocks.findMany.mockResolvedValueOnce([]);
    await runStatusSideEffects({ booking: baseBooking, newStatus: 'COMPLETED', actorId: 'admin-1' });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.historyCreate).not.toHaveBeenCalled();
  });

  it('multiple active legs are all cascaded in one transaction', async () => {
    mocks.findMany.mockResolvedValueOnce([
      { id: 'tt-out', tripType: 'OUTBOUND' },
      { id: 'tt-ret', tripType: 'RETURN' },
    ]);
    await runStatusSideEffects({ booking: baseBooking, newStatus: 'COMPLETED', actorId: 'admin-1' });
    expect(mocks.$transaction).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledTimes(2);
    expect(mocks.historyCreate).toHaveBeenCalledTimes(2);
    const statuses = mocks.update.mock.calls.map((c) => (c[0] as { data: { status: string } }).data.status);
    expect(statuses).toEqual(['ARRIVED_AT_PENSION', 'ARRIVED_AT_CLIENT']);
  });

  it('does not run the cascade for non-COMPLETED transitions', async () => {
    mocks.findMany.mockResolvedValue([{ id: 'tt-1', tripType: 'OUTBOUND' }]);
    await runStatusSideEffects({ booking: baseBooking, newStatus: 'IN_PROGRESS', actorId: 'admin-1' });
    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('failures in the cascade are non-fatal — booking completion is preserved', async () => {
    mocks.findMany.mockRejectedValueOnce(new Error('db blip'));
    // Should NOT throw — the caller's main flow (loyalty recompute,
    // notifications, etc.) must continue even if the cascade fails.
    await expect(
      runStatusSideEffects({ booking: baseBooking, newStatus: 'COMPLETED', actorId: 'admin-1' }),
    ).resolves.toBeUndefined();
  });
});
