/**
 * Tests for POST /api/admin/bookings/[id]/checkout (close open-ended stay).
 * Focus: auth gate, body validation, only-open-ended bookings,
 * happy path transitions to COMPLETED with new endDate.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- test stubs */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  prisma: {
    booking: { findFirst: vi.fn() },
    $transaction: vi.fn(async (cb: any) => {
      const tx = {
        booking: {
          update: vi.fn().mockResolvedValue({}),
          // Optimistic-lock path : updateMany returns { count: 1 } on success.
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        invoice: { update: vi.fn().mockResolvedValue({}) },
        invoiceItem: {
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      };
      return cb(tx);
    }),
  },
  getPricingSettings: vi.fn().mockResolvedValue({}),
  getPensionPrice: vi.fn(),
  invalidateAvailabilityCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../../../../../../auth', () => ({ auth: mocks.auth }));
vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/pricing', () => ({
  getPricingSettings: mocks.getPricingSettings,
  getPensionPrice: mocks.getPensionPrice,
}));
vi.mock('@/lib/availability-cache', () => ({
  invalidateAvailabilityCache: mocks.invalidateAvailabilityCache,
}));
vi.mock('@/lib/observability', () => ({
  withSpan: vi.fn(async (_n: string, _a: unknown, fn: () => unknown) => fn()),
  logServerError: vi.fn(),
}));
// allocatePayments opens its own Serializable tx — stub it so the
// checkout test can assert the tx count it actually cares about (1 for
// the checkout itself).  Coverage of allocate stays in payments.test.
vi.mock('@/lib/payments', () => ({
  allocatePayments: vi.fn(async () => undefined),
}));

import { POST } from '@/app/api/admin/bookings/[id]/checkout/route';

function makeReq(body: unknown) {
  return new NextRequest('http://localhost/api/admin/bookings/b1/checkout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const adminSession = { user: { id: 'admin1', role: 'ADMIN' } };

const openBookingRow = {
  id: 'b1',
  startDate: new Date('2026-05-01T08:00:00Z'),
  isOpenEnded: true,
  status: 'IN_PROGRESS',
  version: 1,
  boardingDetail: {},
  bookingPets: [
    { pet: { id: 'p1', name: 'Rex', species: 'DOG' } },
  ],
  invoice: {
    id: 'inv1',
    items: [],
  },
};

describe('POST /api/admin/bookings/[id]/checkout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPricingSettings.mockResolvedValue({});
    mocks.getPensionPrice.mockReturnValue(new Prisma.Decimal(120));
  });

  it('401 without session', async () => {
    mocks.auth.mockResolvedValue(null);
    const res = await POST(makeReq({ endDate: '2026-05-10' }), { params: Promise.resolve({ id: 'b1' }) });
    expect(res.status).toBe(401);
  });

  it('403 when role is CLIENT', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'c1', role: 'CLIENT' } });
    const res = await POST(makeReq({ endDate: '2026-05-10' }), { params: Promise.resolve({ id: 'b1' }) });
    expect(res.status).toBe(403);
  });

  it('400 INVALID_BODY when JSON is malformed', async () => {
    mocks.auth.mockResolvedValue(adminSession);
    const req = new NextRequest('http://localhost/api/admin/bookings/b1/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not-json',
    });
    const res = await POST(req, { params: Promise.resolve({ id: 'b1' }) });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'INVALID_BODY' });
  });

  it('400 INVALID_END_DATE when missing', async () => {
    mocks.auth.mockResolvedValue(adminSession);
    const res = await POST(makeReq({}), { params: Promise.resolve({ id: 'b1' }) });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'INVALID_END_DATE' });
  });

  it('400 INVALID_END_DATE when not a date string', async () => {
    mocks.auth.mockResolvedValue(adminSession);
    const res = await POST(makeReq({ endDate: 'not-a-date' }), { params: Promise.resolve({ id: 'b1' }) });
    expect(res.status).toBe(400);
  });

  it('404 when booking not found', async () => {
    mocks.auth.mockResolvedValue(adminSession);
    mocks.prisma.booking.findFirst.mockResolvedValue(null);
    const res = await POST(makeReq({ endDate: '2026-05-10' }), { params: Promise.resolve({ id: 'b1' }) });
    expect(res.status).toBe(404);
  });

  it('400 NOT_IN_PROGRESS when booking is already terminal', async () => {
    mocks.auth.mockResolvedValue(adminSession);
    mocks.prisma.booking.findFirst.mockResolvedValue({ ...openBookingRow, status: 'COMPLETED' });
    const res = await POST(makeReq({ endDate: '2026-05-10' }), { params: Promise.resolve({ id: 'b1' }) });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'NOT_IN_PROGRESS' });
  });

  it('non-open-ended IN_PROGRESS booking checks out successfully (no recompute)', async () => {
    mocks.auth.mockResolvedValue(adminSession);
    // Fixed-date stay : isOpenEnded false but physically present. Must close
    // without recomputing the (already-issued, possibly discounted) invoice.
    mocks.prisma.booking.findFirst.mockResolvedValue({
      ...openBookingRow,
      isOpenEnded: false,
      totalPrice: new Prisma.Decimal(1780),
      invoice: { id: 'inv1', amount: new Prisma.Decimal(1780), items: [] },
    });
    const res = await POST(makeReq({ endDate: '2026-05-10' }), { params: Promise.resolve({ id: 'b1' }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    // Amount preserved (invoice not recomputed for a fixed-date stay).
    expect(json.invoiceAmount).toBe(1780);
  });

  it('400 END_BEFORE_START when endDate < startDate', async () => {
    mocks.auth.mockResolvedValue(adminSession);
    mocks.prisma.booking.findFirst.mockResolvedValue(openBookingRow);
    const res = await POST(makeReq({ endDate: '2026-04-01' }), { params: Promise.resolve({ id: 'b1' }) });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'END_BEFORE_START' });
  });

  it('happy path: transitions to COMPLETED + invalidates cache', async () => {
    mocks.auth.mockResolvedValue(adminSession);
    mocks.prisma.booking.findFirst.mockResolvedValue(openBookingRow);

    const res = await POST(
      makeReq({ endDate: '2026-05-10' }),
      { params: Promise.resolve({ id: 'b1' }) },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.bookingId).toBe('b1');
    expect(typeof json.realNights).toBe('number');
    expect(json.realNights).toBeGreaterThanOrEqual(1);

    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mocks.invalidateAvailabilityCache).toHaveBeenCalled();
  });

  it('SUPERADMIN can also checkout', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'super1', role: 'SUPERADMIN' } });
    mocks.prisma.booking.findFirst.mockResolvedValue(openBookingRow);

    const res = await POST(makeReq({ endDate: '2026-05-10' }), { params: Promise.resolve({ id: 'b1' }) });
    expect(res.status).toBe(200);
  });

  it('500 when transaction throws unknown error', async () => {
    mocks.auth.mockResolvedValue(adminSession);
    mocks.prisma.booking.findFirst.mockResolvedValue(openBookingRow);
    mocks.prisma.$transaction.mockRejectedValueOnce(new Error('boom'));

    const res = await POST(makeReq({ endDate: '2026-05-10' }), { params: Promise.resolve({ id: 'b1' }) });
    expect(res.status).toBe(500);
  });
});
