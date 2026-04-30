/**
 * Integration tests for checkBoardingCapacity (src/lib/capacity.ts).
 *
 * No real DB, no real Redis — all Prisma calls and cache helpers are mocked.
 * The "integration" angle: tests exercise the full capacity.ts code path
 * (getCapacityLimits → countOverlappingPets → checkBoardingCapacity) wired
 * together, rather than each helper in isolation.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/prisma', () => ({
  prisma: {
    booking: { findMany: vi.fn() },
    pet: { findMany: vi.fn() },
    setting: { findMany: vi.fn() },
  },
}));

vi.mock('@/lib/cache', () => ({
  // cacheReadThrough: bypass cache and call loader directly so tests hit the
  // mocked Prisma without needing a real Redis connection.
  cacheReadThrough: vi.fn((_key: string, _ttl: number, loader: () => Promise<unknown>) => loader()),
  cacheDel: vi.fn().mockResolvedValue(undefined),
  CacheKeys: { capacityLimits: () => 'cache:capacity:limits' },
  CacheTTL: { capacityLimits: 300 },
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { prisma } from '@/lib/prisma';
import { checkBoardingCapacity, type CapacityCheckExceeded } from '@/lib/capacity';

// We use the globally-mocked `prisma` singleton for "global client" tests and
// build a dedicated mock client for "custom TX client" tests (so the code can
// tell them apart via the `client !== prisma` branch in getCapacityLimits).
const mockTxClient = {
  pet: { findMany: vi.fn() },
  booking: { findMany: vi.fn() },
  setting: { findMany: vi.fn() },
};

// Helper: seed the default capacity limits (20 dogs / 10 cats) on whichever
// client's setting.findMany will be called.
function seedDefaultLimits(client: typeof mockTxClient) {
  client.setting.findMany.mockResolvedValue([
    { key: 'capacity_dog', value: '20' },
    { key: 'capacity_cat', value: '10' },
  ]);
}

beforeEach(() => {
  vi.clearAllMocks();
  seedDefaultLimits(mockTxClient);
  mockTxClient.booking.findMany.mockResolvedValue([]);
  // Also wire the singleton mock for tests that don't pass a custom client.
  (prisma.setting.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
    { key: 'capacity_dog', value: '20' },
    { key: 'capacity_cat', value: '10' },
  ]);
  (prisma.booking.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
});

// ── Test 1: simultaneous double-booking ──────────────────────────────────────

describe('simultaneous double booking — first succeeds, second fails', () => {
  it('first call is ok when 1 slot remains, second call fails with CAPACITY_EXCEEDED when full', async () => {
    // Scenario: limit = 2 dogs, 1 already booked.
    // First booking request (requests 1 dog, 1 remaining) → ok.
    // Second booking request (now 2 booked, 0 remaining) → CAPACITY_EXCEEDED.

    const limits = [
      { key: 'capacity_dog', value: '2' },
      { key: 'capacity_cat', value: '2' },
    ];

    // First call setup: 1 existing dog booking, requesting 1 dog → available = 1
    mockTxClient.setting.findMany.mockResolvedValueOnce(limits).mockResolvedValueOnce(limits);
    mockTxClient.pet.findMany
      .mockResolvedValueOnce([{ species: 'DOG' }]) // first call: 1 requested dog
      .mockResolvedValueOnce([{ species: 'DOG' }]); // second call: 1 requested dog
    mockTxClient.booking.findMany
      .mockResolvedValueOnce([
        { bookingPets: [{ pet: { species: 'DOG' } }] }, // 1 existing dog
      ])
      .mockResolvedValueOnce([
        { bookingPets: [{ pet: { species: 'DOG' } }] }, // now 2 existing dogs
        { bookingPets: [{ pet: { species: 'DOG' } }] },
      ]);

    const window = { startDate: new Date('2026-07-01'), endDate: new Date('2026-07-05') };
    const client = mockTxClient as unknown as typeof prisma;

    const result1 = await checkBoardingCapacity({ petIds: ['p1'], ...window }, client);
    expect(result1.ok).toBe(true);

    const result2 = await checkBoardingCapacity({ petIds: ['p2'], ...window }, client);
    expect(result2.ok).toBe(false);
    const exceeded = result2 as CapacityCheckExceeded;
    expect(exceeded.species).toBe('DOG');
    expect(exceeded.available).toBe(0);
    expect(exceeded.requested).toBe(1);
    expect(exceeded.limit).toBe(2);
  });
});

// ── Test 2: excludeBookingId — booking does not count itself ─────────────────

describe('excludeBookingId — extended booking is excluded from occupancy', () => {
  it('passes excludeBookingId in the Prisma where clause so the extended booking is not counted', async () => {
    const BOOKING_ID = 'booking-being-extended';

    mockTxClient.pet.findMany.mockResolvedValue([{ species: 'DOG' }]);
    // Return one booking that matches the booking being extended — it should be
    // excluded by the `id: { not: excludeBookingId }` filter.
    mockTxClient.booking.findMany.mockResolvedValue([
      { id: BOOKING_ID, bookingPets: [{ pet: { species: 'DOG' } }] },
    ]);

    await checkBoardingCapacity(
      {
        petIds: ['p1'],
        startDate: new Date('2026-07-01'),
        endDate: new Date('2026-07-10'),
        excludeBookingId: BOOKING_ID,
      },
      mockTxClient as unknown as typeof prisma,
    );

    expect(mockTxClient.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { not: BOOKING_ID },
        }),
      }),
    );
  });

  it('without excludeBookingId, the booking query where clause has no id filter', async () => {
    mockTxClient.pet.findMany.mockResolvedValue([{ species: 'DOG' }]);

    await checkBoardingCapacity(
      { petIds: ['p1'], startDate: new Date('2026-07-01'), endDate: new Date('2026-07-05') },
      mockTxClient as unknown as typeof prisma,
    );

    const whereArg = (mockTxClient.booking.findMany.mock.calls[0] as [{ where: Record<string, unknown> }])[0]?.where ?? {};
    expect(whereArg).not.toHaveProperty('id');
  });
});

// ── Test 3: capacity full + waitlistFallback — capacity.ts returns ok:false ──

describe('WAITLIST fallback — capacity.ts returns ok:false when full (API handles waitlist)', () => {
  it('returns ok=false when capacity is exceeded (WAITLIST logic is at API layer, not here)', async () => {
    // Limit = 1, already 1 dog booked, requesting 1 more → capacity.ts returns ok:false.
    // The waitlist promotion is handled by the API route, not by capacity.ts itself.
    mockTxClient.setting.findMany.mockResolvedValue([
      { key: 'capacity_dog', value: '1' },
      { key: 'capacity_cat', value: '1' },
    ]);
    mockTxClient.pet.findMany.mockResolvedValue([{ species: 'DOG' }]);
    mockTxClient.booking.findMany.mockResolvedValue([
      { bookingPets: [{ pet: { species: 'DOG' } }] },
    ]);

    const result = await checkBoardingCapacity(
      { petIds: ['p-new'], startDate: new Date('2026-08-01'), endDate: new Date('2026-08-05') },
      mockTxClient as unknown as typeof prisma,
    );

    expect(result.ok).toBe(false);
    const exceeded = result as CapacityCheckExceeded;
    expect(exceeded.species).toBe('DOG');
    expect(exceeded.available).toBe(0);
  });
});

// ── Test 4: taxi booking (endDate=null) → always ok:true, no DB queries ──────

describe('taxi booking (endDate=null) — always ok, no DB queries', () => {
  it('returns ok=true immediately without touching Prisma', async () => {
    const result = await checkBoardingCapacity(
      { petIds: ['p1', 'p2'], startDate: new Date(), endDate: null },
      mockTxClient as unknown as typeof prisma,
    );

    expect(result.ok).toBe(true);
    expect(mockTxClient.pet.findMany).not.toHaveBeenCalled();
    expect(mockTxClient.booking.findMany).not.toHaveBeenCalled();
    expect(mockTxClient.setting.findMany).not.toHaveBeenCalled();
  });
});
