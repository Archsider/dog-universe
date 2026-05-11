/**
 * API tests — PATCH /api/admin/bookings/[id] dispatcher.
 *
 * Covers the contract that matters most after the booking-admin/ split:
 *  - VERSION_CONFLICT on stale version
 *  - INVALID_TRANSITION on a status jump that the state machine forbids
 *  - CANCELLATION_REASON_REQUIRED on REJECTED/CANCELLED without a reason
 *
 * These are HTTP-shape regression tests. The per-branch service logic
 * (extension, editDates, addBookingItems, …) lives in
 * `src/lib/services/booking-admin/*` and is exercised at its own level.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  prisma: {
    booking: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    invoice: { findUnique: vi.fn() },
  },
  logAction: vi.fn().mockResolvedValue(undefined),
  applyStatusUpdate: vi.fn(),
  runStatusSideEffects: vi.fn().mockResolvedValue(undefined),
  handleNoShowInvoice: vi.fn().mockResolvedValue(undefined),
  revalidateTag: vi.fn(),
}));

vi.mock('../../../auth', () => ({ auth: mocks.auth }));
vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/log', () => ({
  logAction: mocks.logAction,
  LOG_ACTIONS: {
    BOOKING_CONFIRMED: 'BOOKING_CONFIRMED',
    BOOKING_CANCELLED: 'BOOKING_CANCELLED',
    BOOKING_REJECTED: 'BOOKING_REJECTED',
    BOOKING_COMPLETED: 'BOOKING_COMPLETED',
  },
}));
vi.mock('next/cache', () => ({ revalidateTag: mocks.revalidateTag }));
vi.mock('@/lib/services/booking-admin', async () => {
  const actual = await vi.importActual<typeof import('@/lib/services/booking-admin')>(
    '@/lib/services/booking-admin',
  );
  return {
    ...actual,
    applyStatusUpdate: mocks.applyStatusUpdate,
    runStatusSideEffects: mocks.runStatusSideEffects,
    handleNoShowInvoice: mocks.handleNoShowInvoice,
  };
});

import { PATCH } from '@/app/api/admin/bookings/[id]/route';

function buildRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/admin/bookings/abc', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function asParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
});

describe('PATCH /api/admin/bookings/[id]', () => {
  it('returns 409 VERSION_CONFLICT when caller version is stale', async () => {
    mocks.prisma.booking.findFirst.mockResolvedValue({
      id: 'b1',
      version: 5,
      status: 'PENDING',
      serviceType: 'BOARDING',
      client: { id: 'c1' },
      bookingPets: [],
    });

    const res = await PATCH(buildRequest({ notes: 'x', version: 2 }), asParams('b1'));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toBe('VERSION_CONFLICT');
    expect(json.currentVersion).toBe(5);
    expect(mocks.applyStatusUpdate).not.toHaveBeenCalled();
  });

  it('returns 400 CANCELLATION_REASON_REQUIRED when REJECTED without a reason', async () => {
    mocks.prisma.booking.findFirst.mockResolvedValue({
      id: 'b1',
      version: 1,
      status: 'PENDING',
      serviceType: 'BOARDING',
      client: { id: 'c1' },
      bookingPets: [],
    });

    const res = await PATCH(buildRequest({ status: 'REJECTED' }), asParams('b1'));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe('CANCELLATION_REASON_REQUIRED');
    expect(mocks.applyStatusUpdate).not.toHaveBeenCalled();
  });

  it('returns 400 INVALID_TRANSITION when NO_SHOW comes from PENDING', async () => {
    mocks.prisma.booking.findFirst.mockResolvedValue({
      id: 'b1',
      version: 1,
      status: 'PENDING',
      serviceType: 'BOARDING',
      client: { id: 'c1' },
      bookingPets: [],
    });

    const res = await PATCH(buildRequest({ status: 'NO_SHOW' }), asParams('b1'));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe('INVALID_TRANSITION');
    expect(mocks.applyStatusUpdate).not.toHaveBeenCalled();
  });
});
