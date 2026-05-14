/**
 * Integration tests — POST /api/bookings Idempotency-Key support.
 *
 * Focus:
 *  - 1st call → 201; replay with same key → 409 DUPLICATE_REQUEST
 *  - malformed Idempotency-Key → 400 IDEMPOTENCY_KEY_INVALID
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  class IdempotencyKeyInvalidError extends Error {
    constructor() {
      super('IDEMPOTENCY_KEY_INVALID');
      this.name = 'IdempotencyKeyInvalidError';
    }
  }
  return {
    auth: vi.fn(),
    tryAcquireIdempotency: vi.fn(),
    IdempotencyKeyInvalidError,
    prisma: {
      pet: { findMany: vi.fn() },
      booking: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn() },
      user: { findMany: vi.fn().mockResolvedValue([]) },
    },
    createBookingTx: vi.fn(),
    runWithSerializableRetry: vi.fn(async (fn: () => unknown) => fn()),
    validateTaxiSlot: vi.fn(),
    validateBoardingTaxiAddons: vi.fn(),
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
vi.mock('@/lib/email', () => ({
  sendEmail: mocks.sendEmail,
  getEmailTemplate: mocks.getEmailTemplate,
}));
vi.mock('@/lib/notify-now', () => ({
  sendEmailNow: mocks.sendEmailNow,
  sendSmsNow: mocks.sendSmsNow,
}));
vi.mock('@/lib/sms', () => ({
  sendAdminSMS: mocks.sendAdminSMS, normalizePhone: (p: string) => p,
  formatDateFR: mocks.formatDateFR,
}));
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
  petIds: ['pet-1'],
  startDate: '2099-06-01',
  endDate: '2099-06-05',
};

function makeReq(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/bookings', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: 'client-1', role: 'CLIENT' } });
  mocks.prisma.pet.findMany.mockResolvedValue([
    { id: 'pet-1', name: 'Max', species: 'DOG' },
  ]);
  mocks.prisma.booking.findFirst.mockResolvedValue(null);
  mocks.createBookingTx.mockResolvedValue({
    id: 'booking-uuid-12345678',
    clientId: 'client-1',
    serviceType: 'BOARDING',
    status: 'PENDING',
    startDate: new Date('2099-06-01'),
    endDate: new Date('2099-06-05'),
    bookingPets: [{ pet: { name: 'Max' } }],
    client: { name: 'Foo', email: 'foo@x.com', language: 'fr' },
  });
});

describe('POST /api/bookings — Idempotency-Key', () => {
  it('1st call → 201, replay with same key → 409 DUPLICATE_REQUEST', async () => {
    // 1st: lock acquired
    mocks.tryAcquireIdempotency.mockResolvedValueOnce({ acquired: true, redisAvailable: true });
    const r1 = await POST(makeReq(validBody, { 'idempotency-key': 'abcd1234efgh5678' }), { params: Promise.resolve({}) });
    expect(r1.status).toBe(201);

    // 2nd: lock NOT acquired → 409
    mocks.tryAcquireIdempotency.mockResolvedValueOnce({ acquired: false, redisAvailable: true });
    const r2 = await POST(makeReq(validBody, { 'idempotency-key': 'abcd1234efgh5678' }), { params: Promise.resolve({}) });
    expect(r2.status).toBe(409);
    expect((await r2.json()).error).toBe('DUPLICATE_REQUEST');
  });

  it('rejects malformed Idempotency-Key with 400 IDEMPOTENCY_KEY_INVALID', async () => {
    mocks.tryAcquireIdempotency.mockRejectedValueOnce(new mocks.IdempotencyKeyInvalidError());
    const res = await POST(makeReq(validBody, { 'idempotency-key': 'too-short' }), { params: Promise.resolve({}) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('IDEMPOTENCY_KEY_INVALID');
  });
});
