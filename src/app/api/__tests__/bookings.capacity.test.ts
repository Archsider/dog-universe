/**
 * Integration tests — POST /api/bookings capacity guard.
 *
 * Focus: when `createBookingTx` throws BookingError('CAPACITY_EXCEEDED'),
 * the route maps it to 400 with `{species, available, requested, limit}`.
 *
 * The actual capacity check lives inside `createBookingTx` (Serializable
 * transaction) — we mock the service to throw, then assert the route's
 * BookingError → HTTP mapping is wired correctly.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  class BookingError extends Error {
    code: string;
    status: number;
    payload?: Record<string, unknown>;
    constructor(code: string, opts: { status?: number; payload?: Record<string, unknown> } = {}) {
      super(code);
      this.name = 'BookingError';
      this.code = code;
      this.status = opts.status ?? 400;
      this.payload = opts.payload;
    }
  }
  return {
    auth: vi.fn(),
    tryAcquireIdempotency: vi.fn().mockResolvedValue({ acquired: true, redisAvailable: false }),
    IdempotencyKeyInvalidError: class extends Error {},
    prisma: {
      pet: { findMany: vi.fn() },
      booking: { findFirst: vi.fn().mockResolvedValue(null) },
      user: { findMany: vi.fn().mockResolvedValue([]) },
    },
    createBookingTx: vi.fn(),
    runWithSerializableRetry: vi.fn(async (fn: () => unknown) => fn()),
    validateTaxiSlot: vi.fn(),
    validateBoardingTaxiAddons: vi.fn(),
    BookingError,
    checkBoardingCapacity: vi.fn(),
    getPricingSettings: vi.fn().mockResolvedValue({
      boarding_dog_per_night: 120,
      boarding_dog_long_stay: 100,
      boarding_dog_multi: 100,
      boarding_cat_per_night: 70,
      long_stay_threshold: 32,
    }),
    calculateBoardingBreakdown: vi.fn().mockReturnValue({ total: 600 }),
    calculateTaxiPrice: vi.fn().mockReturnValue({ total: 200 }),
    calculateBoardingTotalForExtension: vi.fn().mockReturnValue(0),
    createBookingConfirmationNotification: vi.fn().mockResolvedValue(undefined),
    createBookingWaitlistedNotification: vi.fn().mockResolvedValue(undefined),
    notifyAdminsNewBooking: vi.fn().mockResolvedValue(undefined),
    sendEmailNow: vi.fn(),
    sendSmsNow: vi.fn(),
    getEmailTemplate: vi.fn().mockReturnValue({ subject: 's', html: 'h' }),
    sendEmail: vi.fn().mockResolvedValue(undefined),
    sendAdminSMS: vi.fn().mockResolvedValue(undefined),
    formatDateFR: vi.fn().mockReturnValue('01/06/2026'),
    log: vi.fn().mockResolvedValue(undefined),
    logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
    logAction: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('../../../../auth', () => ({ auth: mocks.auth }));
vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/idempotency', () => ({
  tryAcquireIdempotency: mocks.tryAcquireIdempotency,
  IdempotencyKeyInvalidError: mocks.IdempotencyKeyInvalidError,
}));
vi.mock('@/lib/capacity', () => ({
  checkBoardingCapacity: mocks.checkBoardingCapacity,
}));
vi.mock('@/lib/services/booking-client.service', () => ({
  createBookingTx: mocks.createBookingTx,
  runWithSerializableRetry: mocks.runWithSerializableRetry,
  validateTaxiSlot: mocks.validateTaxiSlot,
  validateBoardingTaxiAddons: mocks.validateBoardingTaxiAddons,
}));
vi.mock('@/lib/services/booking-errors', () => ({ BookingError: mocks.BookingError }));
vi.mock('@/lib/pricing', () => ({
  getPricingSettings: mocks.getPricingSettings,
  calculateBoardingBreakdown: mocks.calculateBoardingBreakdown,
  calculateTaxiPrice: mocks.calculateTaxiPrice,
  calculateBoardingTotalForExtension: mocks.calculateBoardingTotalForExtension,
}));
vi.mock('@/lib/notifications', () => ({
  createBookingConfirmationNotification: mocks.createBookingConfirmationNotification,
  createBookingWaitlistedNotification: mocks.createBookingWaitlistedNotification,
  notifyAdminsNewBooking: mocks.notifyAdminsNewBooking,
}));
vi.mock('@/lib/email', () => ({ sendEmail: mocks.sendEmail, getEmailTemplate: mocks.getEmailTemplate }));
vi.mock('@/lib/notify-now', () => ({ sendEmailNow: mocks.sendEmailNow, sendSmsNow: mocks.sendSmsNow }));
vi.mock('@/lib/sms', () => ({ sendAdminSMS: mocks.sendAdminSMS, formatDateFR: mocks.formatDateFR }));
vi.mock('@/lib/logger', () => ({ log: mocks.log, logger: mocks.logger }));
vi.mock('@/lib/log', () => ({
  logAction: mocks.logAction,
  LOG_ACTIONS: { BOOKING_CREATED: 'BOOKING_CREATED' },
}));
vi.mock('@/lib/config', () => ({ APP_URL: 'http://localhost' }));
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));

import { POST } from '@/app/api/bookings/route';

const validBody = {
  serviceType: 'BOARDING' as const,
  petIds: ['pet-1', 'pet-2'],
  startDate: '2099-06-01',
  endDate: '2099-06-05',
};

function makeReq(body: unknown) {
  return new Request('http://localhost/api/bookings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
  mocks.prisma.pet.findMany.mockResolvedValue([
    { id: 'pet-1', name: 'Max', species: 'DOG' },
    { id: 'pet-2', name: 'Rex', species: 'DOG' },
  ]);
  mocks.prisma.booking.findFirst.mockResolvedValue(null);
});

describe('POST /api/bookings — capacity exceeded', () => {
  it('returns 400 CAPACITY_EXCEEDED with {species, available, requested, limit}', async () => {
    mocks.createBookingTx.mockRejectedValueOnce(
      new mocks.BookingError('CAPACITY_EXCEEDED', {
        status: 400,
        payload: { species: 'DOG', available: 1, requested: 2, limit: 20 },
      }),
    );

    const res = await POST(makeReq({ ...validBody, clientId: 'client-1', totalPrice: 600 }), { params: Promise.resolve({}) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('CAPACITY_EXCEEDED');
    expect(body.species).toBe('DOG');
    expect(body.available).toBe(1);
    expect(body.requested).toBe(2);
    expect(body.limit).toBe(20);
  });
});
