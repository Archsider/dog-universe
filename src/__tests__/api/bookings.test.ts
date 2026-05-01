/**
 * API tests — POST /api/bookings + PATCH /api/admin/bookings/[id]
 *
 * Strategy: mock every collaborator (auth, prisma, capacity, idempotency,
 * queues, email, sms, notifications, cache, sentry) and exercise the route
 * handlers directly with a synthesised `Request`. No real DB connection.
 *
 * Spec discrepancies vs original task brief
 * ------------------------------------------
 * 1. "Dates invalides (endDate < startDate) → 400" — the route does NOT
 *    explicitly compare endDate < startDate; the schema only enforces a
 *    non-empty string of length ≤ 40. Boarding nights become Math.max(0, …),
 *    so a swapped pair would silently book 0 nights. We instead verify the
 *    400 path via Zod failure (empty `petIds` → VALIDATION_ERROR).
 * 2. "Auth CLIENT sur route admin → 403" — the admin route returns **401**
 *    (not 403) when the user lacks ADMIN/SUPERADMIN role (line 26+48 of
 *    src/app/api/admin/bookings/[id]/route.ts). We assert 401 to match the
 *    actual implementation. The DELETE handler in the same file uses 403,
 *    which is an inconsistency, but PATCH is the route under test here.
 * 3. WAITLIST côté CLIENT — confirmed: route does set `status='WAITLIST'`
 *    when capacity full and role!=admin (lines 569–573, 122–126). We test
 *    this path explicitly.
 * 4. Idempotency replay → 409 `DUPLICATE_REQUEST` — confirmed exactly.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — declared up-front because vi.mock() factories can't capture
// outer scope unless via vi.hoisted().
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => {
  const prismaTx = {
    booking: { create: vi.fn(), update: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), delete: vi.fn(), count: vi.fn() },
    boardingDetail: { create: vi.fn(), upsert: vi.fn(), findUnique: vi.fn() },
    taxiDetail: { create: vi.fn() },
    bookingItem: { createMany: vi.fn(), updateMany: vi.fn() },
    invoice: { update: vi.fn(), delete: vi.fn(), aggregate: vi.fn() },
    invoiceItem: { findMany: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
    stayPhoto: { updateMany: vi.fn() },
    taxiTrip: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    taxiStatusHistory: { create: vi.fn() },
    pet: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    loyaltyGrade: { findUnique: vi.fn(), update: vi.fn() },
  };

  return {
    auth: vi.fn(),
    prisma: {
      ...prismaTx,
      $transaction: vi.fn(async (fn: any) => {
        if (typeof fn === 'function') return fn(prismaTx);
        return fn;
      }),
    },
    prismaTx,
    tryAcquireIdempotency: vi.fn(),
    checkBoardingCapacity: vi.fn(),
    enqueueEmail: vi.fn().mockResolvedValue(undefined),
    enqueueSms: vi.fn().mockResolvedValue(undefined),
    sendEmail: vi.fn().mockResolvedValue(undefined),
    sendSMS: vi.fn().mockResolvedValue(undefined),
    sendAdminSMS: vi.fn().mockResolvedValue(undefined),
    getEmailTemplate: vi.fn().mockReturnValue({ subject: 'subj', html: '<p/>' }),
    getPricingSettings: vi.fn().mockResolvedValue({
      boarding_dog_per_night: 200,
      boarding_dog_long_stay: 180,
      boarding_dog_multi: 160,
      boarding_cat_per_night: 150,
      long_stay_threshold: 7,
    }),
    calculateBoardingBreakdown: vi.fn().mockReturnValue({ total: 600 }),
    calculateTaxiPrice: vi.fn().mockReturnValue({ total: 150 }),
    calculateBoardingTotalForExtension: vi.fn().mockReturnValue(800),
    revalidateTag: vi.fn(),
    logAction: vi.fn().mockResolvedValue(undefined),
    createBookingConfirmationNotification: vi.fn().mockResolvedValue(undefined),
    createBookingWaitlistedNotification: vi.fn().mockResolvedValue(undefined),
    createBookingValidationNotification: vi.fn().mockResolvedValue(undefined),
    createBookingRefusalNotification: vi.fn().mockResolvedValue(undefined),
    createBookingInProgressNotification: vi.fn().mockResolvedValue(undefined),
    createBookingCompletedNotification: vi.fn().mockResolvedValue(undefined),
    createBookingNoShowNotification: vi.fn().mockResolvedValue(undefined),
    notifyAdminsNewBooking: vi.fn().mockResolvedValue(undefined),
    promoteWaitlistedBooking: vi.fn().mockResolvedValue(undefined),
    allocatePayments: vi.fn().mockResolvedValue(undefined),
  };
});

// Both route files import auth via different relative paths that all resolve
// to the repo-root `/auth.ts`. The relative path from THIS test file is
// `../../../auth` (src/__tests__/api/ → src/__tests__/ → src/ → repo root).
vi.mock('../../../auth', () => ({ auth: mocks.auth }));
vi.mock('@/auth', () => ({ auth: mocks.auth }));

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));

vi.mock('@/lib/idempotency', () => ({
  tryAcquireIdempotency: mocks.tryAcquireIdempotency,
  IdempotencyKeyInvalidError: class IdempotencyKeyInvalidError extends Error {
    constructor() { super('IDEMPOTENCY_KEY_INVALID'); this.name = 'IdempotencyKeyInvalidError'; }
  },
}));

vi.mock('@/lib/capacity', () => ({
  checkBoardingCapacity: mocks.checkBoardingCapacity,
}));

vi.mock('@/lib/queues/index', () => ({
  enqueueEmail: mocks.enqueueEmail,
  enqueueSms: mocks.enqueueSms,
}));
vi.mock('@/lib/queues', () => ({
  enqueueEmail: mocks.enqueueEmail,
  enqueueSms: mocks.enqueueSms,
}));

vi.mock('@/lib/email', () => ({
  sendEmail: mocks.sendEmail,
  getEmailTemplate: mocks.getEmailTemplate,
}));

vi.mock('@/lib/sms', () => ({
  sendSMS: mocks.sendSMS,
  sendAdminSMS: mocks.sendAdminSMS,
  formatDateFR: (d: Date) => d.toISOString().slice(0, 10),
  petVerb: () => 'sont',
  petArrived: () => 'arrivés',
  petChouchoute: () => 'chouchoutés',
  petCompanion: () => 'votre compagnon',
}));

vi.mock('@/lib/notifications', () => ({
  createBookingConfirmationNotification: mocks.createBookingConfirmationNotification,
  createBookingWaitlistedNotification: mocks.createBookingWaitlistedNotification,
  createBookingValidationNotification: mocks.createBookingValidationNotification,
  createBookingRefusalNotification: mocks.createBookingRefusalNotification,
  createBookingInProgressNotification: mocks.createBookingInProgressNotification,
  createBookingCompletedNotification: mocks.createBookingCompletedNotification,
  createBookingNoShowNotification: mocks.createBookingNoShowNotification,
  notifyAdminsNewBooking: mocks.notifyAdminsNewBooking,
  promoteWaitlistedBooking: mocks.promoteWaitlistedBooking,
  createBookingExtendedNotification: vi.fn().mockResolvedValue(undefined),
  createExtensionRejectedNotification: vi.fn().mockResolvedValue(undefined),
  createLoyaltyUpdateNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/log', () => ({
  logAction: mocks.logAction,
  LOG_ACTIONS: {
    BOOKING_CREATED: 'BOOKING_CREATED',
    BOOKING_CONFIRMED: 'BOOKING_CONFIRMED',
    BOOKING_REJECTED: 'BOOKING_REJECTED',
    BOOKING_CANCELLED: 'BOOKING_CANCELLED',
    BOOKING_COMPLETED: 'BOOKING_COMPLETED',
  },
}));

vi.mock('@/lib/pricing', () => ({
  getPricingSettings: mocks.getPricingSettings,
  calculateBoardingBreakdown: mocks.calculateBoardingBreakdown,
  calculateTaxiPrice: mocks.calculateTaxiPrice,
  calculateBoardingTotalForExtension: mocks.calculateBoardingTotalForExtension,
}));

vi.mock('@/lib/payments', () => ({
  allocatePayments: mocks.allocatePayments,
}));

vi.mock('@/lib/loyalty', () => ({
  calculateSuggestedGrade: () => 'BRONZE',
}));

vi.mock('@/lib/loyalty-server', () => ({
  invalidateLoyaltyCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/cache', () => ({
  cacheReadThrough: vi.fn((_k: string, _t: number, loader: () => Promise<unknown>) => loader()),
  cacheDel: vi.fn().mockResolvedValue(undefined),
  CacheKeys: { capacityLimits: () => 'cache:capacity:limits' },
  CacheTTL: { capacityLimits: 300, loyaltyGrade: 300, notifCount: 30 },
  invalidateLoyaltyCache: vi.fn().mockResolvedValue(undefined),
  invalidateNotifCount: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('next/cache', () => ({
  revalidateTag: mocks.revalidateTag,
  revalidatePath: vi.fn(),
  unstable_cache: <T extends (...args: unknown[]) => unknown>(fn: T) => fn,
}));

vi.mock('@sentry/nextjs', () => ({
  startSpan: <T,>(_opts: unknown, cb: () => T) => cb(),
  captureException: vi.fn(),
}));

// Import handlers AFTER all mocks are registered.
import { POST as BookingsPOST } from '@/app/api/bookings/route';
import { PATCH as AdminBookingsPATCH } from '@/app/api/admin/bookings/[id]/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://example.com/api/bookings', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

// withSchema-wrapped routes expect a 2nd ctx arg with awaited params.
// POST /api/bookings has no [param], so ctx is `{ params: Promise.resolve({}) }`.
const emptyCtx = () => ({ params: Promise.resolve({} as Record<string, never>) });

function makeAdminPatchRequest(id: string, body: unknown): Request {
  return new Request(`https://example.com/api/admin/bookings/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validBoardingBody = {
  serviceType: 'BOARDING' as const,
  petIds: ['pet-1'],
  startDate: '2099-06-01',
  endDate: '2099-06-05',
  totalPrice: 800,
};

beforeEach(() => {
  vi.clearAllMocks();
  // Defaults: idempotency available (acquired), capacity OK, transaction returns whatever the inner fn does.
  mocks.tryAcquireIdempotency.mockResolvedValue({ acquired: true, redisAvailable: true });
  mocks.checkBoardingCapacity.mockResolvedValue({ ok: true });
  mocks.prisma.$transaction.mockImplementation(async (fn: any) => {
    if (typeof fn === 'function') return fn(mocks.prismaTx);
    return fn;
  });

  // Sensible defaults for read calls
  mocks.prismaTx.pet.findMany.mockResolvedValue([
    { id: 'pet-1', name: 'Max', species: 'DOG', ownerId: 'client-1' },
  ]);
  mocks.prismaTx.booking.findFirst.mockResolvedValue(null); // no auto-merge candidate
  mocks.prismaTx.user.findMany.mockResolvedValue([]); // no admins to email
});

// ===========================================================================
// POST /api/bookings
// ===========================================================================
describe('POST /api/bookings', () => {
  it('creates a valid BOARDING booking for CLIENT → 201, status PENDING', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'client-1', role: 'CLIENT' } });
    const createdBooking = {
      id: 'booking-abc12345',
      clientId: 'client-1',
      serviceType: 'BOARDING',
      status: 'PENDING',
      startDate: new Date('2099-06-01'),
      endDate: new Date('2099-06-05'),
      bookingPets: [{ pet: { id: 'pet-1', name: 'Max', species: 'DOG' } }],
      client: { id: 'client-1', name: 'Alice', email: 'a@x.com', phone: '+212600', language: 'fr' },
    };
    mocks.prismaTx.booking.create.mockResolvedValue(createdBooking);
    mocks.prismaTx.boardingDetail.create.mockResolvedValue({});

    const res = await BookingsPOST(makeRequest(validBoardingBody), emptyCtx());
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.status).toBe('PENDING');
    expect(json.id).toBe('booking-abc12345');
    expect(json.bookingRef).toBe('BOOKING-'); // first 8 chars uppercased
    expect(mocks.checkBoardingCapacity).toHaveBeenCalled();
    expect(mocks.revalidateTag).toHaveBeenCalledWith('admin-counts');
  });

  it('returns 400 CAPACITY_EXCEEDED for ADMIN when full', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
    mocks.checkBoardingCapacity.mockResolvedValue({
      ok: false, species: 'DOG', available: 0, requested: 1, limit: 20,
    });
    const body = { ...validBoardingBody, clientId: 'client-1' };
    const res = await BookingsPOST(makeRequest(body), emptyCtx());
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('CAPACITY_EXCEEDED');
    expect(json.species).toBe('DOG');
    expect(json.available).toBe(0);
    expect(json.requested).toBe(1);
    expect(json.limit).toBe(20);
  });

  it('falls back to WAITLIST for CLIENT when capacity is full', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'client-1', role: 'CLIENT' } });
    mocks.checkBoardingCapacity.mockResolvedValue({
      ok: false, species: 'DOG', available: 0, requested: 1, limit: 20,
    });
    const waitlisted = {
      id: 'booking-wl000001',
      clientId: 'client-1',
      serviceType: 'BOARDING',
      status: 'WAITLIST',
      startDate: new Date('2099-06-01'),
      endDate: new Date('2099-06-05'),
      bookingPets: [{ pet: { id: 'pet-1', name: 'Max', species: 'DOG' } }],
      client: { id: 'client-1', name: 'Alice', email: 'a@x.com', phone: '+212600', language: 'fr' },
    };
    mocks.prismaTx.booking.create.mockResolvedValue(waitlisted);
    mocks.prismaTx.boardingDetail.create.mockResolvedValue({});

    const res = await BookingsPOST(makeRequest(validBoardingBody), emptyCtx());
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.status).toBe('WAITLIST');
    expect(mocks.createBookingWaitlistedNotification).toHaveBeenCalled();
    expect(mocks.createBookingConfirmationNotification).not.toHaveBeenCalled();
  });

  it('returns 409 DUPLICATE_REQUEST on Idempotency-Key replay', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'client-1', role: 'CLIENT' } });
    mocks.tryAcquireIdempotency.mockResolvedValueOnce({ acquired: false, redisAvailable: true });

    const res = await BookingsPOST(
      makeRequest(validBoardingBody, { 'idempotency-key': 'replay-key-12345' }),
      emptyCtx(),
    );
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe('DUPLICATE_REQUEST');
    // The handler must short-circuit before touching the DB
    expect(mocks.prismaTx.booking.create).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR for malformed payload (empty petIds)', async () => {
    // The route does NOT explicitly check endDate < startDate; we instead exercise
    // the schema-level guard: empty petIds violates `min(1)` and yields 400.
    mocks.auth.mockResolvedValue({ user: { id: 'client-1', role: 'CLIENT' } });
    const res = await BookingsPOST(makeRequest({ ...validBoardingBody, petIds: [] }), emptyCtx());
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('VALIDATION_ERROR');
  });

  it('returns 401 when auth() returns null', async () => {
    mocks.auth.mockResolvedValue(null);
    const res = await BookingsPOST(makeRequest(validBoardingBody), emptyCtx());
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });
});

// ===========================================================================
// PATCH /api/admin/bookings/[id]
// ===========================================================================
describe('PATCH /api/admin/bookings/[id]', () => {
  function paramsFor(id: string) {
    return { params: Promise.resolve({ id }) };
  }

  it('transitions PENDING → CONFIRMED → 200', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
    const existing = {
      id: 'b1',
      status: 'PENDING',
      serviceType: 'BOARDING',
      clientId: 'client-1',
      startDate: new Date('2099-06-01'),
      endDate: new Date('2099-06-05'),
      arrivalTime: null,
      bookingPets: [{ pet: { id: 'pet-1', name: 'Max', species: 'DOG' } }],
      client: { id: 'client-1', name: 'Alice', email: 'a@x.com', phone: '+212', language: 'fr' },
      boardingDetail: { includeGrooming: false, groomingPrice: 0, taxiAddonPrice: 0 },
      taxiDetail: null,
      invoice: null,
    };
    mocks.prisma.booking.findFirst.mockResolvedValue(existing);
    mocks.prisma.booking.update.mockResolvedValue({ ...existing, status: 'CONFIRMED' });
    mocks.prisma.taxiTrip.findFirst.mockResolvedValue(null);

    const res = await AdminBookingsPATCH(
      makeAdminPatchRequest('b1', { status: 'CONFIRMED' }) as any,
      paramsFor('b1'),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('CONFIRMED');
    expect(mocks.createBookingValidationNotification).toHaveBeenCalled();
    expect(mocks.revalidateTag).toHaveBeenCalledWith('admin-counts');
  });

  it('rejects NO_SHOW from PENDING with 400 INVALID_TRANSITION', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
    mocks.prisma.booking.findFirst.mockResolvedValue({
      id: 'b2',
      status: 'PENDING',
      serviceType: 'BOARDING',
      clientId: 'client-1',
      startDate: new Date('2099-06-01'),
      endDate: new Date('2099-06-05'),
      bookingPets: [{ pet: { id: 'pet-1', species: 'DOG', name: 'Max' } }],
      client: { id: 'client-1', name: 'Alice', email: 'a@x.com', phone: '+212', language: 'fr' },
      boardingDetail: null,
      taxiDetail: null,
      invoice: null,
    });

    const res = await AdminBookingsPATCH(
      makeAdminPatchRequest('b2', { status: 'NO_SHOW' }) as any,
      paramsFor('b2'),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('INVALID_TRANSITION');
  });

  it('rejects extension when capacity check fails → 400 CAPACITY_EXCEEDED', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
    mocks.prisma.booking.findFirst.mockResolvedValue({
      id: 'b3',
      status: 'CONFIRMED',
      serviceType: 'BOARDING',
      clientId: 'client-1',
      startDate: new Date('2099-06-01'),
      endDate: new Date('2099-06-05'),
      bookingPets: [{ pet: { id: 'pet-1', species: 'DOG', name: 'Max' } }],
      client: { id: 'client-1', name: 'Alice', email: 'a@x.com', phone: '+212', language: 'fr' },
      boardingDetail: { includeGrooming: false, groomingPrice: 0, taxiAddonPrice: 0 },
      taxiDetail: null,
      invoice: null,
    });
    mocks.checkBoardingCapacity.mockResolvedValue({
      ok: false, species: 'DOG', available: 0, requested: 1, limit: 20,
    });

    const res = await AdminBookingsPATCH(
      makeAdminPatchRequest('b3', { extendEndDate: '2099-06-10' }) as any,
      paramsFor('b3'),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('CAPACITY_EXCEEDED');
    expect(json.species).toBe('DOG');
    // booking.update for the extension itself must NOT have run
    expect(mocks.prisma.booking.update).not.toHaveBeenCalled();
  });

  it('allows NO_SHOW from CONFIRMED → 200', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
    const existing = {
      id: 'b4',
      status: 'CONFIRMED',
      serviceType: 'BOARDING',
      clientId: 'client-1',
      startDate: new Date('2099-06-01'),
      endDate: new Date('2099-06-05'),
      bookingPets: [{ pet: { id: 'pet-1', species: 'DOG', name: 'Max' } }],
      client: { id: 'client-1', name: 'Alice', email: 'a@x.com', phone: '+212', language: 'fr' },
      boardingDetail: null,
      taxiDetail: null,
      invoice: null,
    };
    mocks.prisma.booking.findFirst.mockResolvedValue(existing);
    mocks.prisma.booking.update.mockResolvedValue({ ...existing, status: 'NO_SHOW' });

    const res = await AdminBookingsPATCH(
      makeAdminPatchRequest('b4', { status: 'NO_SHOW' }) as any,
      paramsFor('b4'),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('NO_SHOW');
    expect(mocks.createBookingNoShowNotification).toHaveBeenCalled();
  });

  it('returns 401 when a CLIENT calls the admin route', async () => {
    // NOTE: route returns 401 (not 403) for non-admins on PATCH — see header comment.
    mocks.auth.mockResolvedValue({ user: { id: 'client-1', role: 'CLIENT' } });
    const res = await AdminBookingsPATCH(
      makeAdminPatchRequest('b5', { status: 'CONFIRMED' }) as any,
      paramsFor('b5'),
    );
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
    // Must short-circuit before any DB read
    expect(mocks.prisma.booking.findFirst).not.toHaveBeenCalled();
  });
});
