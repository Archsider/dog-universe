/**
 * Tests for PATCH /api/admin/bookings/[id] (admin status transitions + edits).
 * Focus: auth gate, basic transitions, INVALID_TRANSITION guard,
 * CANCELLATION_REASON_REQUIRED, VERSION_CONFLICT, status side effects.
 *
 * Note: this route has 13 dispatch branches (patchBoardingDetail, addBookingItems,
 * approveExtension, rejectExtension, editDates, extendEndDate, status, etc.).
 * Core happy paths are tested ; complex extension flows are out of scope here
 * (covered by the booking-admin service layer tests).
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- test stubs */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { z } from 'zod';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  prisma: {
    booking: { findFirst: vi.fn() },
  },
  applyStatusUpdate: vi.fn().mockResolvedValue({ id: 'b1', status: 'CONFIRMED' }),
  handleNoShowInvoice: vi.fn().mockResolvedValue(undefined),
  runStatusSideEffects: vi.fn().mockResolvedValue(undefined),
  invalidateAvailabilityCache: vi.fn().mockResolvedValue(undefined),
  revalidateTag: vi.fn(),
  canTransition: vi.fn().mockReturnValue(true),
  isBookingStatus: vi.fn().mockReturnValue(true),
}));

vi.mock('../../../../../../../auth', () => ({ auth: mocks.auth }));
vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/services/booking-admin', () => ({
  patchBoardingDetail: vi.fn(),
  addBookingItems: vi.fn(),
  rejectExtensionRequest: vi.fn(),
  approveExtensionMerge: vi.fn(),
  rejectExtensionMerge: vi.fn(),
  applyExtension: vi.fn(),
  editDates: vi.fn(),
  applyStatusUpdate: mocks.applyStatusUpdate,
  handleNoShowInvoice: mocks.handleNoShowInvoice,
  runStatusSideEffects: mocks.runStatusSideEffects,
  adminBookingPatchSchema: z.any(),
  adminBookingParamsSchema: z.object({ id: z.string() }),
}));
vi.mock('@/lib/availability-cache', () => ({
  invalidateAvailabilityCache: mocks.invalidateAvailabilityCache,
}));
vi.mock('next/cache', () => ({ revalidateTag: mocks.revalidateTag }));
vi.mock('@/lib/booking-state-machine', () => ({
  canTransition: (...a: any[]) => mocks.canTransition(...a),
  isBookingStatus: (...a: any[]) => mocks.isBookingStatus(...a),
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/log', () => ({ logAction: vi.fn() }));
vi.mock('@/lib/services/booking-errors', () => ({
  BookingError: class BookingError extends Error {
    constructor(public code: string, message?: string) {
      super(message ?? code);
    }
  },
}));

import { PATCH } from '@/app/api/admin/bookings/[id]/route';

function makeReq(body: unknown) {
  return new NextRequest('http://localhost/api/admin/bookings/b1', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const adminSession = { user: { id: 'admin1', role: 'ADMIN' } };

const baseBooking = {
  id: 'b1',
  status: 'PENDING',
  serviceType: 'BOARDING',
  startDate: new Date('2026-05-01'),
  endDate: new Date('2026-05-05'),
  version: 1,
  cancellationReason: null,
  extensionRequestedEndDate: null,
  client: { id: 'c1', name: 'Mehdi', email: 'm@x.test' },
  bookingPets: [],
  boardingDetail: null,
  taxiDetail: null,
  invoice: null,
};

describe('PATCH /api/admin/bookings/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.canTransition.mockReturnValue(true);
    mocks.isBookingStatus.mockReturnValue(true);
    mocks.applyStatusUpdate.mockResolvedValue({ id: 'b1', status: 'CONFIRMED' });
  });

  it('401 without session', async () => {
    mocks.auth.mockResolvedValue(null);
    const res = await PATCH(makeReq({ status: 'CONFIRMED' }), { params: Promise.resolve({ id: 'b1' }) });
    expect(res.status).toBe(401);
  });

  it('403 when role is CLIENT', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'c1', role: 'CLIENT' } });
    const res = await PATCH(makeReq({ status: 'CONFIRMED' }), { params: Promise.resolve({ id: 'b1' }) });
    expect(res.status).toBe(403);
  });

  it('404 when booking not found', async () => {
    mocks.auth.mockResolvedValue(adminSession);
    mocks.prisma.booking.findFirst.mockResolvedValue(null);
    const res = await PATCH(makeReq({ status: 'CONFIRMED' }), { params: Promise.resolve({ id: 'b1' }) });
    expect(res.status).toBe(404);
  });

  it('happy path: PENDING → CONFIRMED transition', async () => {
    mocks.auth.mockResolvedValue(adminSession);
    mocks.prisma.booking.findFirst.mockResolvedValue(baseBooking);

    const res = await PATCH(makeReq({ status: 'CONFIRMED' }), { params: Promise.resolve({ id: 'b1' }) });
    expect(res.status).toBe(200);
    expect(mocks.applyStatusUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: 'b1', status: 'CONFIRMED' }),
    );
    expect(mocks.runStatusSideEffects).toHaveBeenCalled();
    expect(mocks.revalidateTag).toHaveBeenCalledWith('admin-counts');
  });

  it('400 INVALID_TRANSITION when canTransition returns false', async () => {
    mocks.auth.mockResolvedValue(adminSession);
    mocks.prisma.booking.findFirst.mockResolvedValue(baseBooking);
    mocks.canTransition.mockReturnValue(false);

    const res = await PATCH(makeReq({ status: 'COMPLETED' }), { params: Promise.resolve({ id: 'b1' }) });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('INVALID_TRANSITION');
    expect(json.from).toBe('PENDING');
    expect(json.to).toBe('COMPLETED');
  });

  it('400 OPEN_ENDED_REQUIRES_CHECKOUT when COMPLETED on an open-ended stay', async () => {
    mocks.auth.mockResolvedValue(adminSession);
    mocks.prisma.booking.findFirst.mockResolvedValue({
      ...baseBooking,
      status: 'IN_PROGRESS',
      isOpenEnded: true,
    });
    const res = await PATCH(makeReq({ status: 'COMPLETED' }), { params: Promise.resolve({ id: 'b1' }) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('OPEN_ENDED_REQUIRES_CHECKOUT');
    // The raw status update must NOT run — would close the stay at a stale price.
    expect(mocks.applyStatusUpdate).not.toHaveBeenCalled();
  });

  it('allows COMPLETED on a fixed-date (non open-ended) stay', async () => {
    mocks.auth.mockResolvedValue(adminSession);
    mocks.prisma.booking.findFirst.mockResolvedValue({
      ...baseBooking,
      status: 'IN_PROGRESS',
      isOpenEnded: false,
    });
    mocks.applyStatusUpdate.mockResolvedValue({ id: 'b1', status: 'COMPLETED' });
    const res = await PATCH(makeReq({ status: 'COMPLETED' }), { params: Promise.resolve({ id: 'b1' }) });
    expect(res.status).toBe(200);
    expect(mocks.applyStatusUpdate).toHaveBeenCalled();
  });

  it('400 CANCELLATION_REASON_REQUIRED when CANCELLED without reason', async () => {
    mocks.auth.mockResolvedValue(adminSession);
    mocks.prisma.booking.findFirst.mockResolvedValue({ ...baseBooking, status: 'CONFIRMED' });

    const res = await PATCH(
      makeReq({ status: 'CANCELLED' }),
      { params: Promise.resolve({ id: 'b1' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('CANCELLATION_REASON_REQUIRED');
  });

  it('400 CANCELLATION_REASON_REQUIRED when reason < 10 chars', async () => {
    mocks.auth.mockResolvedValue(adminSession);
    mocks.prisma.booking.findFirst.mockResolvedValue({ ...baseBooking, status: 'CONFIRMED' });

    const res = await PATCH(
      makeReq({ status: 'CANCELLED', cancellationReason: 'short' }),
      { params: Promise.resolve({ id: 'b1' }) },
    );
    expect(res.status).toBe(400);
  });

  it('happy path: CANCELLED with valid reason', async () => {
    mocks.auth.mockResolvedValue(adminSession);
    mocks.prisma.booking.findFirst.mockResolvedValue({ ...baseBooking, status: 'CONFIRMED' });
    mocks.applyStatusUpdate.mockResolvedValue({ id: 'b1', status: 'CANCELLED' });

    const res = await PATCH(
      makeReq({
        status: 'CANCELLED',
        cancellationReason: 'Client cancelled the booking after extension request',
      }),
      { params: Promise.resolve({ id: 'b1' }) },
    );
    expect(res.status).toBe(200);
  });

  it('409 VERSION_CONFLICT when version mismatch', async () => {
    mocks.auth.mockResolvedValue(adminSession);
    mocks.prisma.booking.findFirst.mockResolvedValue({ ...baseBooking, version: 5 });

    const res = await PATCH(
      makeReq({ status: 'CONFIRMED', version: 3 }),
      { params: Promise.resolve({ id: 'b1' }) },
    );
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe('VERSION_CONFLICT');
    expect(json.currentVersion).toBe(5);
  });

  it('400 INVALID_TRANSITION when NO_SHOW from non-CONFIRMED/IN_PROGRESS', async () => {
    mocks.auth.mockResolvedValue(adminSession);
    mocks.prisma.booking.findFirst.mockResolvedValue({ ...baseBooking, status: 'PENDING' });

    const res = await PATCH(
      makeReq({ status: 'NO_SHOW' }),
      { params: Promise.resolve({ id: 'b1' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVALID_TRANSITION');
  });

  it('NO_SHOW from CONFIRMED triggers handleNoShowInvoice', async () => {
    mocks.auth.mockResolvedValue(adminSession);
    mocks.prisma.booking.findFirst.mockResolvedValue({ ...baseBooking, status: 'CONFIRMED' });
    mocks.applyStatusUpdate.mockResolvedValue({ id: 'b1', status: 'NO_SHOW' });

    const res = await PATCH(makeReq({ status: 'NO_SHOW' }), { params: Promise.resolve({ id: 'b1' }) });
    expect(res.status).toBe(200);
    expect(mocks.handleNoShowInvoice).toHaveBeenCalled();
  });

  it('invalidates availability cache on status change for BOARDING', async () => {
    mocks.auth.mockResolvedValue(adminSession);
    mocks.prisma.booking.findFirst.mockResolvedValue(baseBooking);

    await PATCH(makeReq({ status: 'CONFIRMED' }), { params: Promise.resolve({ id: 'b1' }) });
    expect(mocks.invalidateAvailabilityCache).toHaveBeenCalled();
  });
});
