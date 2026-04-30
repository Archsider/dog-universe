/**
 * Integration tests for promoteWaitlistedBooking (src/lib/notifications.ts).
 *
 * No real DB — all Prisma calls are mocked via vi.mock().
 * The "integration" angle: tests cover the full promotion path:
 *   findFirst (WAITLIST candidate) → booking.update (→ PENDING)
 *   → createWaitlistPromotedNotification → notification.create
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────
//
// vi.mock() factories are hoisted to the top of the file, so any variable they
// reference must also be hoisted via vi.hoisted() — otherwise the factory runs
// before the variable is initialised (temporal dead zone / ReferenceError).

const { mockPrisma } = vi.hoisted(() => {
  const mockPrisma = {
    booking: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    notification: {
      create: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  };
  return { mockPrisma };
});

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
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

// email / sms helpers called inside createBookingCompletedNotification (non-blocking)
vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  getEmailTemplate: vi.fn().mockReturnValue({ subject: 'test', html: '<p>test</p>' }),
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

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
    bookingPets: petNames.map((name) => ({ pet: { name } })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: notification.create succeeds
  mockPrisma.notification.create.mockResolvedValue({ id: 'notif-1' });
  mockPrisma.booking.update.mockResolvedValue({});
});

// ── Test 1: promotes oldest WAITLIST booking (FIFO) ──────────────────────────

describe('promoteWaitlistedBooking — promotes oldest WAITLIST booking (FIFO)', () => {
  it('updates the candidate booking to PENDING and returns its id', async () => {
    const candidate = makeWaitlistBooking({ id: 'booking-oldest', clientId: 'client-A' });
    mockPrisma.booking.findFirst.mockResolvedValue(candidate);

    const result = await promoteWaitlistedBooking({
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-09-07'),
    });

    expect(result).toBe('booking-oldest');
    expect(mockPrisma.booking.update).toHaveBeenCalledWith({
      where: { id: 'booking-oldest' },
      data: { status: 'PENDING' },
    });
  });

  it('queries for WAITLIST status ordered by createdAt ASC (FIFO)', async () => {
    const candidate = makeWaitlistBooking();
    mockPrisma.booking.findFirst.mockResolvedValue(candidate);

    await promoteWaitlistedBooking({
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-09-07'),
    });

    expect(mockPrisma.booking.findFirst).toHaveBeenCalledWith(
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
    mockPrisma.booking.findFirst.mockResolvedValue(null);

    const result = await promoteWaitlistedBooking({
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-09-07'),
    });

    expect(result).toBeNull();
    expect(mockPrisma.booking.update).not.toHaveBeenCalled();
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
    mockPrisma.booking.findFirst.mockResolvedValue(candidate);

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
    mockPrisma.booking.findFirst.mockResolvedValue(candidate);

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
    expect(mockPrisma.booking.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.booking.update).not.toHaveBeenCalled();
  });
});
