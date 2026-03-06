import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Module mocks ─────────────────────────────────────────────────
vi.mock('next/server');

// auth is at the project root — 4 levels up from src/app/api/__tests__/
vi.mock('../../../../auth', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    pet: { findMany: vi.fn() },
    bookingPet: { findMany: vi.fn(), count: vi.fn() },
    setting: { findUnique: vi.fn() },
    booking: { findMany: vi.fn(), count: vi.fn() },
    boardingDetail: { create: vi.fn() },
    taxiDetail: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('@/lib/pricing', () => ({
  getPricingSettings: vi.fn().mockResolvedValue({
    boarding_dog_per_night: 120,
    boarding_cat_per_night: 70,
    boarding_dog_long_stay: 100,
    boarding_dog_multi: 100,
    long_stay_threshold: 32,
    grooming_small_dog: 100,
    grooming_large_dog: 150,
    taxi_standard: 150,
    taxi_vet: 300,
    taxi_airport: 300,
  }),
  calculateBoardingBreakdown: vi.fn().mockReturnValue({ items: [], total: 1200 }),
  calculateTaxiPrice: vi.fn().mockReturnValue({ items: [], total: 150 }),
  getGroomingPriceForPet: vi.fn().mockReturnValue(100),
}));

vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  getEmailTemplate: vi.fn().mockReturnValue({ subject: 'Booking', html: '<p>confirmed</p>' }),
}));

vi.mock('@/lib/notifications', () => ({
  createBookingConfirmationNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/log', () => ({
  logAction: vi.fn().mockResolvedValue(undefined),
  LOG_ACTIONS: { BOOKING_CREATED: 'BOOKING_CREATED' },
}));

vi.mock('@/lib/ratelimit', () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, remaining: 9, resetAt: Date.now() + 60_000 }),
  getIp: vi.fn().mockReturnValue('127.0.0.1'),
}));

vi.mock('@/lib/utils', () => ({
  formatDate: vi.fn().mockReturnValue('01/01/2025'),
}));

// ── Imports after mocks ──────────────────────────────────────────
import { POST } from '../bookings/route';
import { auth } from '../../../../auth';
import { prisma } from '@/lib/prisma';
import { checkRateLimit } from '@/lib/ratelimit';

// ── Fixtures ──────────────────────────────────────────────────────
const clientSession = {
  user: { id: 'client-1', email: 'client@example.com', name: 'Alice', role: 'CLIENT' },
};
const adminSession = {
  user: { id: 'admin-1', email: 'admin@example.com', name: 'Admin', role: 'ADMIN' },
};
const superadminSession = {
  user: { id: 'super-1', email: 'super@example.com', name: 'Super', role: 'SUPERADMIN' },
};

const mockDog = { id: 'pet-dog', name: 'Max', species: 'DOG' };
const mockCat = { id: 'pet-cat', name: 'Luna', species: 'CAT' };

const createdBooking = {
  id: 'booking-1',
  clientId: 'client-1',
  bookingPets: [{ pet: { name: 'Max' } }],
  client: { name: 'Alice', email: 'client@example.com', language: 'fr' },
};

function boardingRequest(overrides: Record<string, unknown> = {}) {
  return new Request('http://localhost/api/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serviceType: 'BOARDING',
      petIds: ['pet-dog'],
      startDate: '2025-07-01',
      endDate: '2025-07-11',
      ...overrides,
    }),
  });
}

function taxiRequest(overrides: Record<string, unknown> = {}) {
  return new Request('http://localhost/api/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serviceType: 'PET_TAXI',
      petIds: ['pet-dog'],
      startDate: '2025-07-01',
      taxiType: 'STANDARD',
      ...overrides,
    }),
  });
}

// ── Tests ─────────────────────────────────────────────────────────
describe('POST /api/bookings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(clientSession as never);
    vi.mocked(checkRateLimit).mockReturnValue({ allowed: true, remaining: 9, resetAt: Date.now() + 60_000 });

    // Default: no conflicts, no existing boarders, enough capacity
    vi.mocked(prisma.pet.findMany).mockResolvedValue([mockDog] as never);
    vi.mocked(prisma.bookingPet.findMany).mockResolvedValue([]);
    vi.mocked(prisma.bookingPet.count).mockResolvedValue(0);
    vi.mocked(prisma.setting.findUnique).mockResolvedValue({ key: 'capacity_dog', value: '10' } as never);
    vi.mocked(prisma.boardingDetail.create).mockResolvedValue({} as never);
    vi.mocked(prisma.taxiDetail.create).mockResolvedValue({} as never);

    // Transaction mock: executes the callback with a minimal tx object
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: unknown) => {
      const tx = {
        booking: {
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn().mockResolvedValue(createdBooking),
        },
      };
      return (callback as (arg: unknown) => Promise<unknown>)(tx);
    });
  });

  // ── Auth ──────────────────────────────────────────────────────
  it('returns 401 when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await POST(boardingRequest());
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('Unauthorized');
  });

  // ── Input validation ──────────────────────────────────────────
  it('returns 400 when serviceType is missing', async () => {
    const res = await POST(
      new Request('http://localhost/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ petIds: ['pet-dog'], startDate: '2025-07-01' }),
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('MISSING_FIELDS');
  });

  it('returns 400 when petIds is empty', async () => {
    const res = await POST(boardingRequest({ petIds: [] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('MISSING_FIELDS');
  });

  it('returns 400 when startDate is missing', async () => {
    const res = await POST(
      new Request('http://localhost/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceType: 'BOARDING', petIds: ['pet-dog'] }),
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('MISSING_FIELDS');
  });

  // ── Pet ownership ────────────────────────────────────────────
  it('returns 400 INVALID_PETS when a pet does not belong to the client', async () => {
    // findMany with ownerId filter returns fewer pets than requested
    vi.mocked(prisma.pet.findMany).mockResolvedValueOnce([] as never);
    const res = await POST(boardingRequest());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVALID_PETS');
  });

  // ── Conflict detection ───────────────────────────────────────
  it('returns 409 PET_ALREADY_BOOKED when pet has overlapping booking', async () => {
    // First findMany: ownership check → ok
    // Then findMany (pricing pets) → ok
    vi.mocked(prisma.pet.findMany)
      .mockResolvedValueOnce([mockDog] as never)  // ownership
      .mockResolvedValueOnce([mockDog] as never); // pricing

    vi.mocked(prisma.bookingPet.findMany).mockResolvedValue([
      { petId: 'pet-dog', pet: { name: 'Max' } },
    ] as never);

    const res = await POST(boardingRequest());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('PET_ALREADY_BOOKED');
  });

  // ── Capacity checks ──────────────────────────────────────────
  it('returns 409 CAPACITY_DOGS_FULL when dog slots are at capacity', async () => {
    vi.mocked(prisma.pet.findMany)
      .mockResolvedValueOnce([mockDog] as never)
      .mockResolvedValueOnce([mockDog] as never);

    vi.mocked(prisma.bookingPet.findMany).mockResolvedValue([]);

    // capacity = 2, already 2 dogs booked
    vi.mocked(prisma.setting.findUnique)
      .mockResolvedValueOnce({ key: 'capacity_dog', value: '2' } as never)
      .mockResolvedValueOnce({ key: 'capacity_cat', value: '5' } as never);

    vi.mocked(prisma.bookingPet.count)
      .mockResolvedValueOnce(2)  // current dogs
      .mockResolvedValueOnce(0); // current cats

    const res = await POST(boardingRequest());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('CAPACITY_DOGS_FULL');
  });

  it('returns 409 CAPACITY_CATS_FULL when cat slots are at capacity', async () => {
    vi.mocked(prisma.pet.findMany)
      .mockResolvedValueOnce([mockCat] as never)
      .mockResolvedValueOnce([mockCat] as never);

    vi.mocked(prisma.bookingPet.findMany).mockResolvedValue([]);

    vi.mocked(prisma.setting.findUnique)
      .mockResolvedValueOnce({ key: 'capacity_dog', value: '10' } as never)
      .mockResolvedValueOnce({ key: 'capacity_cat', value: '2' } as never);

    vi.mocked(prisma.bookingPet.count)
      .mockResolvedValueOnce(0)  // current dogs
      .mockResolvedValueOnce(2); // current cats

    const res = await POST(boardingRequest({ petIds: ['pet-cat'] }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('CAPACITY_CATS_FULL');
  });

  // ── Rate limiting ─────────────────────────────────────────────
  it('returns 429 when client exceeds booking rate limit', async () => {
    vi.mocked(checkRateLimit).mockReturnValue({ allowed: false, remaining: 0, resetAt: Date.now() + 60_000 });
    const res = await POST(boardingRequest());
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe('RATE_LIMIT');
  });

  it('does not rate-limit admin users', async () => {
    vi.mocked(auth).mockResolvedValue(adminSession as never);
    vi.mocked(checkRateLimit).mockReturnValue({ allowed: false, remaining: 0, resetAt: Date.now() + 60_000 }); // would block a client

    // For admin, ownership check is skipped; only pricing pets fetched
    vi.mocked(prisma.pet.findMany).mockResolvedValue([mockDog] as never);

    const res = await POST(boardingRequest());
    // Admin ignores rate limiter — should proceed (201 or 500 from missing mocks, not 429)
    expect(res.status).not.toBe(429);
  });

  // ── Successful BOARDING booking ───────────────────────────────
  it('returns 201 for a valid BOARDING booking', async () => {
    // Setup: ownership + pricing both return the dog
    vi.mocked(prisma.pet.findMany)
      .mockResolvedValueOnce([mockDog] as never)
      .mockResolvedValueOnce([mockDog] as never);

    const res = await POST(boardingRequest());
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe('booking-1');
  });

  it('creates boardingDetail after booking creation', async () => {
    vi.mocked(prisma.pet.findMany)
      .mockResolvedValueOnce([mockDog] as never)
      .mockResolvedValueOnce([mockDog] as never);

    await POST(boardingRequest());
    expect(prisma.boardingDetail.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ bookingId: 'booking-1' }),
      }),
    );
  });

  // ── Successful PET_TAXI booking ───────────────────────────────
  it('returns 201 for a valid PET_TAXI booking', async () => {
    vi.mocked(prisma.pet.findMany)
      .mockResolvedValueOnce([mockDog] as never)
      .mockResolvedValueOnce([mockDog] as never);

    const res = await POST(taxiRequest());
    expect(res.status).toBe(201);
  });

  it('creates taxiDetail for PET_TAXI bookings', async () => {
    vi.mocked(prisma.pet.findMany)
      .mockResolvedValueOnce([mockDog] as never)
      .mockResolvedValueOnce([mockDog] as never);

    await POST(taxiRequest());
    expect(prisma.taxiDetail.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ bookingId: 'booking-1', taxiType: 'STANDARD' }),
      }),
    );
  });

  // ── Admin / Superadmin booking status ─────────────────────────
  it('creates booking with CONFIRMED status when admin posts', async () => {
    vi.mocked(auth).mockResolvedValue(adminSession as never);
    vi.mocked(prisma.pet.findMany).mockResolvedValue([mockDog] as never);

    let capturedStatus: string | undefined;
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: unknown) => {
      const tx = {
        booking: {
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn().mockImplementation(async ({ data }: { data: { status: string } }) => {
            capturedStatus = data.status;
            return createdBooking;
          }),
        },
      };
      return (callback as (arg: unknown) => Promise<unknown>)(tx);
    });

    await POST(boardingRequest({ clientId: 'client-1' }));
    expect(capturedStatus).toBe('CONFIRMED');
  });

  it('creates booking with CONFIRMED status when superadmin posts', async () => {
    vi.mocked(auth).mockResolvedValue(superadminSession as never);
    vi.mocked(prisma.pet.findMany).mockResolvedValue([mockDog] as never);

    let capturedStatus: string | undefined;
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: unknown) => {
      const tx = {
        booking: {
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn().mockImplementation(async ({ data }: { data: { status: string } }) => {
            capturedStatus = data.status;
            return createdBooking;
          }),
        },
      };
      return (callback as (arg: unknown) => Promise<unknown>)(tx);
    });

    await POST(boardingRequest({ clientId: 'client-1' }));
    expect(capturedStatus).toBe('CONFIRMED');
  });

  it('creates booking with PENDING status when client posts', async () => {
    vi.mocked(prisma.pet.findMany)
      .mockResolvedValueOnce([mockDog] as never)
      .mockResolvedValueOnce([mockDog] as never);

    let capturedStatus: string | undefined;
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: unknown) => {
      const tx = {
        booking: {
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn().mockImplementation(async ({ data }: { data: { status: string } }) => {
            capturedStatus = data.status;
            return createdBooking;
          }),
        },
      };
      return (callback as (arg: unknown) => Promise<unknown>)(tx);
    });

    await POST(boardingRequest());
    expect(capturedStatus).toBe('PENDING');
  });

  // ── Booking reference generation ─────────────────────────────
  it('generates a booking reference in DU-YYYY-NNNN format', async () => {
    vi.mocked(prisma.pet.findMany)
      .mockResolvedValueOnce([mockDog] as never)
      .mockResolvedValueOnce([mockDog] as never);

    let capturedRef: string | undefined;
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: unknown) => {
      const tx = {
        booking: {
          count: vi.fn().mockResolvedValue(42),
          create: vi.fn().mockImplementation(async () => createdBooking),
        },
      };
      const result = await (callback as (arg: unknown) => Promise<{ booking: unknown; bookingRef: string }>)(tx);
      capturedRef = result.bookingRef;
      return result;
    });

    await POST(boardingRequest());
    expect(capturedRef).toMatch(/^DU-\d{4}-\d{4}$/);
    expect(capturedRef).toContain('DU-');
  });
});
