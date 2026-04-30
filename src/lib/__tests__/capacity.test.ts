import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    booking: { findMany: vi.fn() },
    pet: { findMany: vi.fn() },
    setting: { findMany: vi.fn() },
  },
}));

vi.mock('@/lib/cache', () => ({
  cacheReadThrough: vi.fn((key: string, ttl: number, loader: () => Promise<unknown>) => loader()),
  cacheDel: vi.fn().mockResolvedValue(undefined),
  CacheKeys: { capacityLimits: () => 'cache:capacity:limits' },
  CacheTTL: { capacityLimits: 300 },
}));

import { prisma } from '@/lib/prisma';
import {
  checkBoardingCapacity,
  countOverlappingPets,
  getCapacityLimits,
  invalidateCapacityCache,
  type CapacityCheckExceeded,
} from '../capacity';
import { cacheDel } from '@/lib/cache';

// Local mock client — passed explicitly so it != mocked `prisma` singleton,
// forcing getCapacityLimits to read from DB rather than going through cache.
const mockClient = {
  pet: { findMany: vi.fn() },
  booking: { findMany: vi.fn() },
  setting: { findMany: vi.fn() },
};

type MockClient = typeof mockClient;

beforeEach(() => {
  vi.clearAllMocks();
  // Default capacity limits: 20 dogs, 10 cats
  mockClient.setting.findMany.mockResolvedValue([
    { key: 'capacity_dog', value: '20' },
    { key: 'capacity_cat', value: '10' },
  ]);
  // Default: no overlapping bookings
  mockClient.booking.findMany.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// checkBoardingCapacity — taxi (no endDate)
// ---------------------------------------------------------------------------
describe('checkBoardingCapacity — taxi booking (no endDate)', () => {
  it('returns ok=true for taxi bookings with endDate=null', async () => {
    const result = await checkBoardingCapacity(
      { petIds: ['p1', 'p2'], startDate: new Date(), endDate: null },
      mockClient as unknown as typeof prisma,
    );
    expect(result.ok).toBe(true);
    expect(mockClient.pet.findMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// checkBoardingCapacity — no pets
// ---------------------------------------------------------------------------
describe('checkBoardingCapacity — no matching pets', () => {
  it('returns ok=true when petIds resolve to empty array', async () => {
    mockClient.pet.findMany.mockResolvedValue([]);
    const result = await checkBoardingCapacity(
      { petIds: ['ghost-id'], startDate: new Date(), endDate: new Date() },
      mockClient as unknown as typeof prisma,
    );
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// checkBoardingCapacity — capacity NOT exceeded
// ---------------------------------------------------------------------------
describe('checkBoardingCapacity — within capacity', () => {
  it('returns ok=true when new dogs fit within limit', async () => {
    mockClient.pet.findMany.mockResolvedValue([{ species: 'DOG' }, { species: 'DOG' }]);
    mockClient.booking.findMany.mockResolvedValue([
      { bookingPets: [{ pet: { species: 'DOG' } }] }, // 1 existing dog
    ]);
    // limit=20, current=1, requested=2 → available=19 ≥ 2
    const result = await checkBoardingCapacity(
      { petIds: ['p1', 'p2'], startDate: new Date('2026-06-01'), endDate: new Date('2026-06-07') },
      mockClient as unknown as typeof prisma,
    );
    expect(result.ok).toBe(true);
  });

  it('returns ok=true when new cats fit within limit', async () => {
    mockClient.pet.findMany.mockResolvedValue([{ species: 'CAT' }]);
    mockClient.booking.findMany.mockResolvedValue([]);
    const result = await checkBoardingCapacity(
      { petIds: ['c1'], startDate: new Date(), endDate: new Date() },
      mockClient as unknown as typeof prisma,
    );
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// checkBoardingCapacity — DOG capacity exceeded
// ---------------------------------------------------------------------------
describe('checkBoardingCapacity — DOG capacity exceeded', () => {
  it('returns ok=false with correct details when dog limit reached', async () => {
    mockClient.pet.findMany.mockResolvedValue([{ species: 'DOG' }]);
    // 20 existing dogs → limit reached
    mockClient.booking.findMany.mockResolvedValue(
      Array.from({ length: 20 }, () => ({
        bookingPets: [{ pet: { species: 'DOG' } }],
      })),
    );
    const result = await checkBoardingCapacity(
      { petIds: ['p1'], startDate: new Date('2026-07-01'), endDate: new Date('2026-07-05') },
      mockClient as unknown as typeof prisma,
    );
    expect(result.ok).toBe(false);
    const exceeded = result as CapacityCheckExceeded;
    expect(exceeded.species).toBe('DOG');
    expect(exceeded.available).toBe(0);
    expect(exceeded.requested).toBe(1);
    expect(exceeded.limit).toBe(20);
  });

  it('reports correct available slots when partially full', async () => {
    mockClient.pet.findMany.mockResolvedValue([{ species: 'DOG' }, { species: 'DOG' }, { species: 'DOG' }]);
    // 19 current dogs, limit 20 → available = 1, requested = 3
    mockClient.booking.findMany.mockResolvedValue(
      Array.from({ length: 19 }, () => ({
        bookingPets: [{ pet: { species: 'DOG' } }],
      })),
    );
    const result = await checkBoardingCapacity(
      { petIds: ['a', 'b', 'c'], startDate: new Date(), endDate: new Date() },
      mockClient as unknown as typeof prisma,
    );
    expect(result.ok).toBe(false);
    const exceeded = result as CapacityCheckExceeded;
    expect(exceeded.species).toBe('DOG');
    expect(exceeded.available).toBe(1);
    expect(exceeded.requested).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// checkBoardingCapacity — CAT capacity exceeded
// ---------------------------------------------------------------------------
describe('checkBoardingCapacity — CAT capacity exceeded', () => {
  it('returns ok=false for cats when cat limit reached', async () => {
    mockClient.pet.findMany.mockResolvedValue([{ species: 'CAT' }]);
    mockClient.booking.findMany.mockResolvedValue(
      Array.from({ length: 10 }, () => ({
        bookingPets: [{ pet: { species: 'CAT' } }],
      })),
    );
    const result = await checkBoardingCapacity(
      { petIds: ['c1'], startDate: new Date(), endDate: new Date() },
      mockClient as unknown as typeof prisma,
    );
    expect(result.ok).toBe(false);
    const exceeded = result as CapacityCheckExceeded;
    expect(exceeded.species).toBe('CAT');
    expect(exceeded.available).toBe(0);
    expect(exceeded.limit).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// checkBoardingCapacity — checks dogs before cats
// ---------------------------------------------------------------------------
describe('checkBoardingCapacity — mixed species, dog checked first', () => {
  it('returns DOG error when both dog and cat would exceed', async () => {
    mockClient.pet.findMany.mockResolvedValue([{ species: 'DOG' }, { species: 'CAT' }]);
    // Both species at capacity
    mockClient.booking.findMany
      .mockResolvedValueOnce(Array.from({ length: 20 }, () => ({ bookingPets: [{ pet: { species: 'DOG' } }] })))
      .mockResolvedValueOnce(Array.from({ length: 10 }, () => ({ bookingPets: [{ pet: { species: 'CAT' } }] })));
    const result = await checkBoardingCapacity(
      { petIds: ['p', 'c'], startDate: new Date(), endDate: new Date() },
      mockClient as unknown as typeof prisma,
    );
    expect(result.ok).toBe(false);
    expect((result as CapacityCheckExceeded).species).toBe('DOG');
  });
});

// ---------------------------------------------------------------------------
// excludeBookingId — passed through to the overlap query
// ---------------------------------------------------------------------------
describe('checkBoardingCapacity — excludeBookingId', () => {
  it('passes excludeBookingId to the booking query', async () => {
    mockClient.pet.findMany.mockResolvedValue([{ species: 'DOG' }]);
    await checkBoardingCapacity(
      { petIds: ['p1'], startDate: new Date('2026-06-01'), endDate: new Date('2026-06-07'), excludeBookingId: 'booking-to-skip' },
      mockClient as unknown as typeof prisma,
    );
    expect(mockClient.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { not: 'booking-to-skip' } }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// countOverlappingPets — standalone tests
// ---------------------------------------------------------------------------
describe('countOverlappingPets', () => {
  it('returns 0 immediately when endDate is null (taxi window)', async () => {
    const count = await countOverlappingPets(
      'DOG',
      { startDate: new Date(), endDate: null },
      { client: mockClient as unknown as typeof prisma },
    );
    expect(count).toBe(0);
    expect(mockClient.booking.findMany).not.toHaveBeenCalled();
  });

  it('counts only matching species from overlapping bookings', async () => {
    mockClient.booking.findMany.mockResolvedValue([
      { bookingPets: [{ pet: { species: 'DOG' } }, { pet: { species: 'CAT' } }] },
      { bookingPets: [{ pet: { species: 'DOG' } }] },
    ]);
    const count = await countOverlappingPets(
      'DOG',
      { startDate: new Date('2026-06-01'), endDate: new Date('2026-06-07') },
      { client: mockClient as unknown as typeof prisma },
    );
    expect(count).toBe(2); // 2 dogs across 2 bookings
  });

  it('passes excludeBookingId to the query', async () => {
    await countOverlappingPets(
      'DOG',
      { startDate: new Date(), endDate: new Date() },
      { excludeBookingId: 'booking-999', client: mockClient as unknown as typeof prisma },
    );
    expect(mockClient.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { not: 'booking-999' } }),
      }),
    );
  });

  it('does not add id filter when excludeBookingId is absent', async () => {
    await countOverlappingPets(
      'DOG',
      { startDate: new Date(), endDate: new Date() },
      { client: mockClient as unknown as typeof prisma },
    );
    const whereArg = (mockClient.booking.findMany.mock.calls[0] as { where?: Record<string, unknown> }[])[0]?.where ?? {};
    expect(whereArg).not.toHaveProperty('id');
  });
});

// ---------------------------------------------------------------------------
// getCapacityLimits — custom client bypasses cache
// ---------------------------------------------------------------------------
describe('getCapacityLimits — custom client bypasses cache', () => {
  it('reads directly from DB when custom client is passed', async () => {
    const limits = await getCapacityLimits(mockClient as unknown as typeof prisma);
    expect(mockClient.setting.findMany).toHaveBeenCalledOnce();
    expect(limits).toEqual({ dogs: 20, cats: 10 });
  });

  it('falls back to defaults when DB returns empty rows', async () => {
    mockClient.setting.findMany.mockResolvedValueOnce([]);
    const limits = await getCapacityLimits(mockClient as unknown as typeof prisma);
    expect(limits).toEqual({ dogs: 20, cats: 10 }); // DEFAULT_LIMITS
  });

  it('falls back to defaults on DB error', async () => {
    mockClient.setting.findMany.mockRejectedValueOnce(new Error('DB error'));
    const limits = await getCapacityLimits(mockClient as unknown as typeof prisma);
    expect(limits).toEqual({ dogs: 20, cats: 10 });
  });

  it('uses custom limits from DB when available', async () => {
    mockClient.setting.findMany.mockResolvedValueOnce([
      { key: 'capacity_dog', value: '5' },
      { key: 'capacity_cat', value: '3' },
    ]);
    const limits = await getCapacityLimits(mockClient as unknown as typeof prisma);
    expect(limits).toEqual({ dogs: 5, cats: 3 });
  });
});

// ---------------------------------------------------------------------------
// invalidateCapacityCache
// ---------------------------------------------------------------------------
describe('invalidateCapacityCache', () => {
  it('calls cacheDel with the capacity limits key', async () => {
    await invalidateCapacityCache();
    expect(cacheDel).toHaveBeenCalledWith('cache:capacity:limits');
  });
});
