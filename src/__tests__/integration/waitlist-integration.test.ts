/**
 * Integration tests for promoteWaitlistedBooking (src/lib/notifications.ts).
 *
 * No real DB — all Prisma calls are mocked via vi.mock().
 * The "integration" angle: tests cover the full promotion path:
 *   findMany (WAITLIST candidates) → $transaction (re-read + capacity recheck
 *   → booking.update PENDING) → notification.create
 *
 * Capacity recheck is mocked to "ok" so promotion proceeds. The route's own
 * tests cover the capacity-blocked path.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

const { mockPrisma, mockCheckCapacity } = vi.hoisted(() => {
  const txProxy = {
    booking: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  };
  const mockPrisma = {
    booking: {
      findMany: vi.fn(),
      findFirst: vi.fn(), // legacy access from other modules
      update: vi.fn(),
    },
    notification: {
      create: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(async (fn: (tx: typeof txProxy) => Promise<unknown>) => fn(txProxy)),
    __tx: txProxy,
  };
  const mockCheckCapacity = vi.fn();
  return { mockPrisma, mockCheckCapacity };
});

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

vi.mock('@/lib/capacity', () => ({
  checkBoardingCapacity: mockCheckCapacity,
}));

vi.mock('@/lib/cache', () => ({
  cacheReadThrough: vi.fn((_key: string, _ttl: number, loader: () => Promise<unknown>) => loader()),
  cacheDel: vi.fn().mockResolvedValue(undefined),
  CacheKeys: {
    notifCount: (userId: string) => `cache:notif:count:${userId}`,
    capacityLimits: () => 'cache:capacity:limits',
  },
  CacheTTL: { notifCount: 30, capacityLimits: 300 },
}));

vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  getEmailTemplate: vi.fn().mockReturnValue({ subject: 'test', html: '<p>test</p>' }),
}));

import { promoteWaitlistedBooking } from '@/lib/notifications';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeWaitlistBooking(overrides: Partial<{
  id: string;
  clientId: string;
  startDate: Date;
  endDate: Date;
  createdAt: Date;
  petNames: string[];
}> = {}) {
  const petNames = overrides.petNames ?? ['Rex'];
  return {
    id: overrides.id ?? 'booking-waitlist-1',
    clientId: overrides.clientId ?? 'client-1',
    startDate: overrides.startDate ?? new Date('2026-09-01'),
    endDate: overrides.endDate ?? new Date('2026-09-07'),
    createdAt: overrides.createdAt ?? new Date('2026-07-01'),
    bookingPets: petNames.map((name) => ({ pet: { name }, petId: 'pet-' + name })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.notification.create.mockResolvedValue({ id: 'notif-1' });
  mockPrisma.booking.update.mockResolvedValue({});
  // Tx proxy: re-read returns same candidate; capacity ok by default.
  mockPrisma.__tx.booking.findFirst.mockImplementation(async ({ where }: { where: { id: string } }) => ({
    id: where.id,
    startDate: new Date('2026-09-01'),
    endDate: new Date('2026-09-07'),
    bookingPets: [{ petId: 'pet-Rex' }],
  }));
  mockPrisma.__tx.booking.update.mockResolvedValue({});
  mockCheckCapacity.mockResolvedValue({ ok: true });
});

// ── Test 1: promotes oldest WAITLIST booking (FIFO) ──────────────────────────

describe('promoteWaitlistedBooking — promotes oldest WAITLIST booking (FIFO)', () => {
  it('updates the candidate booking to PENDING and returns its id', async () => {
    const candidate = makeWaitlistBooking({ id: 'booking-oldest', clientId: 'client-A' });
    mockPrisma.booking.findMany.mockResolvedValue([candidate]);
    mockPrisma.__tx.booking.findFirst.mockResolvedValueOnce({
      id: candidate.id,
      startDate: candidate.startDate,
      endDate: candidate.endDate,
      bookingPets: candidate.bookingPets,
    });

    const result = await promoteWaitlistedBooking({
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-09-07'),
    });

    expect(result).toBe('booking-oldest');
    expect(mockPrisma.__tx.booking.update).toHaveBeenCalledWith({
      where: { id: 'booking-oldest' },
      data: { status: 'PENDING' },
    });
  });

  it('queries for WAITLIST status ordered by createdAt ASC (FIFO)', async () => {
    const candidate = makeWaitlistBooking();
    mockPrisma.booking.findMany.mockResolvedValue([candidate]);

    await promoteWaitlistedBooking({
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-09-07'),
    });

    expect(mockPrisma.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'WAITLIST' }),
        orderBy: { createdAt: 'asc' },
      }),
    );
  });
});

// ── Test 2: no WAITLIST bookings → does nothing ───────────────────────────────

describe('promoteWaitlistedBooking — no WAITLIST bookings', () => {
  it('returns null and does not call update or create', async () => {
    mockPrisma.booking.findMany.mockResolvedValue([]);

    const result = await promoteWaitlistedBooking({
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-09-07'),
    });

    expect(result).toBeNull();
    expect(mockPrisma.booking.update).not.toHaveBeenCalled();
    expect(mockPrisma.__tx.booking.update).not.toHaveBeenCalled();
    expect(mockPrisma.notification.create).not.toHaveBeenCalled();
  });
});

// ── Test 3: creates a BOOKING_WAITLIST_PROMOTED notification ─────────────────

describe('promoteWaitlistedBooking — creates BOOKING_WAITLIST_PROMOTED notification', () => {
  it('creates a notification of the correct type for the promoted client', async () => {
    const candidate = makeWaitlistBooking({
      id: 'booking-abc',
      clientId: 'client-xyz',
      petNames: ['Luna'],
    });
    mockPrisma.booking.findMany.mockResolvedValue([candidate]);

    await promoteWaitlistedBooking({
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-09-07'),
    });

    expect(mockPrisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'client-xyz',
          type: 'BOOKING_WAITLIST_PROMOTED',
        }),
      }),
    );
  });

  it('includes the pet name in the notification message', async () => {
    const candidate = makeWaitlistBooking({ clientId: 'client-xyz', petNames: ['Milo'] });
    mockPrisma.booking.findMany.mockResolvedValue([candidate]);

    await promoteWaitlistedBooking({
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-09-07'),
    });

    const callArg = mockPrisma.notification.create.mock.calls[0][0] as {
      data: { messageFr: string; messageEn: string };
    };
    expect(callArg.data.messageFr).toContain('Milo');
    expect(callArg.data.messageEn).toContain('Milo');
  });
});

// ── Test 4: endDate=null (taxi window) → returns null, no promotable slot ────

describe('promoteWaitlistedBooking — endDate=null means no promotable slot', () => {
  it('returns null immediately without querying DB when endDate is null', async () => {
    const result = await promoteWaitlistedBooking({
      startDate: new Date('2026-09-01'),
      endDate: null,
    });

    expect(result).toBeNull();
    expect(mockPrisma.booking.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.booking.update).not.toHaveBeenCalled();
  });
});

// ── Test 5: capacity recheck blocks → leaves on WAITLIST ─────────────────────

describe('promoteWaitlistedBooking — capacity recheck guard', () => {
  it('skips a candidate whose pets exceed remaining capacity', async () => {
    const candidate = makeWaitlistBooking({ id: 'booking-too-big', clientId: 'client-Z' });
    mockPrisma.booking.findMany.mockResolvedValue([candidate]);
    mockCheckCapacity.mockResolvedValue({ ok: false, species: 'DOG', available: 0, requested: 1, limit: 20 });

    const result = await promoteWaitlistedBooking({
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-09-07'),
    });

    expect(result).toBeNull();
    expect(mockPrisma.__tx.booking.update).not.toHaveBeenCalled();
    expect(mockPrisma.notification.create).not.toHaveBeenCalled();
  });
});
