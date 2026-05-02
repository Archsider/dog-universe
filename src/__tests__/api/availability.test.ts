/**
 * Unit tests — GET /api/availability
 *
 * Strategy: mock @/lib/prisma and @/lib/cache; invoke the route handler
 * directly with a synthesised NextRequest. No real DB or Redis connection.
 *
 * Behaviour confirmed by reading the route source:
 *  - MONTH_RE = /^\d{4}-\d{2}$/  → month must be YYYY-MM
 *  - VALID_SPECIES = ['DOG', 'CAT']  → exact case, others → 400
 *  - Missing species → defaults to 'DOG'
 *  - capacity from Setting.value (string → parseInt); fallback 20 (DOG) / 10 (CAT)
 *  - getStatus: available===0 → 'full'; available <= ceil(limit*0.2) → 'limited'; else 'available'
 *  - deletedAt:null filter is baked into prisma.booking.findMany where clause
 *  - cacheReadThrough(key, 300, loader) wraps computeAvailability
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — must be declared before any vi.mock() calls
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => ({
  prisma: {
    setting: { findUnique: vi.fn(), findMany: vi.fn() },
    booking: { findMany: vi.fn() },
  },
  cacheReadThrough: vi.fn(async (_key: string, _ttl: number, loader: () => unknown) => loader()),
  getCapacityLimits: vi.fn(async () => ({ dogs: 20, cats: 10 })),
}));

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));

vi.mock('@/lib/cache', () => ({
  cacheReadThrough: mocks.cacheReadThrough,
}));

vi.mock('@/lib/capacity', () => ({
  getCapacityLimits: mocks.getCapacityLimits,
}));

// ---------------------------------------------------------------------------
// Import route handler AFTER mocks are registered
// ---------------------------------------------------------------------------
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/availability/route';

// ---------------------------------------------------------------------------
// Helper — use NextRequest so that request.nextUrl is populated
// ---------------------------------------------------------------------------
function makeRequest(params: Record<string, string>): NextRequest {
  const url = new URL('https://example.com/api/availability');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url.toString());
}

/** Build a minimal booking record as returned by prisma.booking.findMany */
function makeBooking(opts: {
  startDate: Date;
  endDate: Date;
  species?: 'DOG' | 'CAT';
  petCount?: number;
}) {
  const species = opts.species ?? 'DOG';
  const petCount = opts.petCount ?? 1;
  const bookingPets = Array.from({ length: petCount }, () => ({
    pet: { species },
  }));
  return { startDate: opts.startDate, endDate: opts.endDate, bookingPets };
}

// ---------------------------------------------------------------------------
// Setup — reset all mocks before each test
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();

  // Default: capacity_dog = 20, capacity_cat = 10, no bookings, pass-through cache
  mocks.getCapacityLimits.mockResolvedValue({ dogs: 20, cats: 10 });
  mocks.prisma.setting.findUnique.mockResolvedValue({ key: 'capacity_dog', value: '20' });
  mocks.prisma.booking.findMany.mockResolvedValue([]);
  mocks.cacheReadThrough.mockImplementation(
    async (_key: string, _ttl: number, loader: () => unknown) => loader(),
  );
});

// ===========================================================================
describe('GET /api/availability', () => {
  // ── Validation — month ─────────────────────────────────────────────────

  describe('400 — invalid month format', () => {
    it('returns 400 when month is missing', async () => {
      const res = await GET(makeRequest({ species: 'DOG' }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/Invalid month/i);
    });

    it('returns 400 when month is "2026-5" (single-digit month)', async () => {
      const res = await GET(makeRequest({ month: '2026-5', species: 'DOG' }));
      expect(res.status).toBe(400);
    });

    it('returns 400 when month is "foo"', async () => {
      const res = await GET(makeRequest({ month: 'foo', species: 'DOG' }));
      expect(res.status).toBe(400);
    });

    it('returns 400 when month has no separator (e.g. "202605")', async () => {
      const res = await GET(makeRequest({ month: '202605', species: 'DOG' }));
      expect(res.status).toBe(400);
    });
  });

  // ── MONTH_RE boundary — two-digit month always passes regex ──────────

  describe('MONTH_RE boundary', () => {
    it('rejects "2026-13" with 400 INVALID_MONTH_RANGE (calendar validation)', async () => {
      // S6 hardening: month must be 01-12 AND within ±24 months of today.
      const res = await GET(makeRequest({ month: '2026-13', species: 'DOG' }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('INVALID_MONTH_RANGE');
    });

    it('rejects months >24 months in the past with 400 INVALID_MONTH_RANGE', async () => {
      const res = await GET(makeRequest({ month: '2020-01', species: 'DOG' }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('INVALID_MONTH_RANGE');
    });

    it('rejects months >24 months in the future with 400 INVALID_MONTH_RANGE', async () => {
      const res = await GET(makeRequest({ month: '2030-01', species: 'DOG' }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('INVALID_MONTH_RANGE');
    });
  });

  // ── Validation — species ───────────────────────────────────────────────

  describe('400 — invalid species', () => {
    it('returns 400 when species is "BIRD"', async () => {
      const res = await GET(makeRequest({ month: '2026-05', species: 'BIRD' }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/Invalid species/i);
    });

    it('returns 400 when species is "dog" (lowercase)', async () => {
      const res = await GET(makeRequest({ month: '2026-05', species: 'dog' }));
      expect(res.status).toBe(400);
    });

    it('returns 400 when species is "cat" (lowercase)', async () => {
      const res = await GET(makeRequest({ month: '2026-05', species: 'cat' }));
      expect(res.status).toBe(400);
    });
  });

  // ── 200 — response shape ───────────────────────────────────────────────

  describe('200 — correct response shape', () => {
    it('returns 200 with species=DOG and month=2026-05 in response body', async () => {
      const res = await GET(makeRequest({ month: '2026-05', species: 'DOG' }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.species).toBe('DOG');
      expect(body.month).toBe('2026-05');
    });

    it('returns days array with 31 entries for May (31-day month)', async () => {
      const res = await GET(makeRequest({ month: '2026-05', species: 'DOG' }));
      const body = await res.json();
      expect(Array.isArray(body.days)).toBe(true);
      expect(body.days).toHaveLength(31);
    });

    it('returns days array with 28 entries for February 2026 (non-leap year)', async () => {
      const res = await GET(makeRequest({ month: '2026-02', species: 'DOG' }));
      expect((await res.json()).days).toHaveLength(28);
    });

    it('returns days array with 29 entries for February 2028 (leap year)', async () => {
      // S6 hardening clamps month to ±24 months around today; 2028-02 fits
      // when "today" is in 2026 — pick a leap year inside that window.
      const res = await GET(makeRequest({ month: '2028-02', species: 'DOG' }));
      expect((await res.json()).days).toHaveLength(29);
    });

    it('each day entry has all required fields', async () => {
      const res = await GET(makeRequest({ month: '2026-05', species: 'DOG' }));
      const day = (await res.json()).days[0];
      expect(day).toHaveProperty('date');
      expect(day).toHaveProperty('booked');
      expect(day).toHaveProperty('limit');
      expect(day).toHaveProperty('available');
      expect(day).toHaveProperty('status');
    });

    it('date strings follow YYYY-MM-DD format (first and last day of May)', async () => {
      const res = await GET(makeRequest({ month: '2026-05', species: 'DOG' }));
      const body = await res.json();
      expect(body.days[0].date).toBe('2026-05-01');
      expect(body.days[30].date).toBe('2026-05-31');
    });
  });

  // ── Status computation ─────────────────────────────────────────────────

  describe('status field', () => {
    it('status is "available" when booked is well below limit (booked=1, limit=20)', async () => {
      // available=19, ceil(20*0.2)=4 → 19 > 4 → available
      mocks.prisma.booking.findMany.mockResolvedValue([
        makeBooking({
          startDate: new Date('2026-05-01'),
          endDate: new Date('2026-05-31'),
          species: 'DOG',
          petCount: 1,
        }),
      ]);
      const res = await GET(makeRequest({ month: '2026-05', species: 'DOG' }));
      const body = await res.json();
      expect(body.days[0].booked).toBe(1);
      expect(body.days[0].available).toBe(19);
      expect(body.days[0].status).toBe('available');
    });

    it('status is "limited" when available <= ceil(limit * 0.2) and > 0 (booked=17, limit=20)', async () => {
      // available=3, ceil(20*0.2)=4 → 3 <= 4 → limited
      mocks.prisma.booking.findMany.mockResolvedValue([
        makeBooking({
          startDate: new Date('2026-05-01'),
          endDate: new Date('2026-05-31'),
          species: 'DOG',
          petCount: 17,
        }),
      ]);
      const res = await GET(makeRequest({ month: '2026-05', species: 'DOG' }));
      const body = await res.json();
      expect(body.days[0].booked).toBe(17);
      expect(body.days[0].available).toBe(3);
      expect(body.days[0].status).toBe('limited');
    });

    it('status is "limited" at the boundary: available === ceil(limit * 0.2) (booked=16, limit=20)', async () => {
      // available=4 === ceil(4) → limited (boundary inclusive)
      mocks.prisma.booking.findMany.mockResolvedValue([
        makeBooking({
          startDate: new Date('2026-05-01'),
          endDate: new Date('2026-05-31'),
          species: 'DOG',
          petCount: 16,
        }),
      ]);
      const res = await GET(makeRequest({ month: '2026-05', species: 'DOG' }));
      const body = await res.json();
      expect(body.days[0].available).toBe(4);
      expect(body.days[0].status).toBe('limited');
    });

    it('status is "full" when booked === limit (booked=20, limit=20)', async () => {
      mocks.prisma.booking.findMany.mockResolvedValue([
        makeBooking({
          startDate: new Date('2026-05-01'),
          endDate: new Date('2026-05-31'),
          species: 'DOG',
          petCount: 20,
        }),
      ]);
      const res = await GET(makeRequest({ month: '2026-05', species: 'DOG' }));
      const body = await res.json();
      expect(body.days[0].booked).toBe(20);
      expect(body.days[0].available).toBe(0);
      expect(body.days[0].status).toBe('full');
    });

    it('available is clamped to 0 when booked > limit (overbooking)', async () => {
      // 25 dogs > limit=20 → Math.max(0, 20-25) = 0
      mocks.prisma.booking.findMany.mockResolvedValue([
        makeBooking({
          startDate: new Date('2026-05-01'),
          endDate: new Date('2026-05-31'),
          species: 'DOG',
          petCount: 25,
        }),
      ]);
      const res = await GET(makeRequest({ month: '2026-05', species: 'DOG' }));
      const body = await res.json();
      expect(body.days[0].available).toBe(0);
      expect(body.days[0].status).toBe('full');
    });

    it('only counts bookings whose date range overlaps each day', async () => {
      // Booking covers May 10 only
      mocks.prisma.booking.findMany.mockResolvedValue([
        makeBooking({
          startDate: new Date('2026-05-10'),
          endDate: new Date('2026-05-10'),
          species: 'DOG',
          petCount: 5,
        }),
      ]);
      const res = await GET(makeRequest({ month: '2026-05', species: 'DOG' }));
      const body = await res.json();
      expect(body.days[8].date).toBe('2026-05-09');
      expect(body.days[8].booked).toBe(0); // May 9 — not covered
      expect(body.days[9].date).toBe('2026-05-10');
      expect(body.days[9].booked).toBe(5); // May 10 — covered
      expect(body.days[10].date).toBe('2026-05-11');
      expect(body.days[10].booked).toBe(0); // May 11 — not covered
    });
  });

  // ── Soft-delete ────────────────────────────────────────────────────────

  describe('soft-delete', () => {
    it('passes deletedAt:null in the prisma.booking.findMany where clause', async () => {
      await GET(makeRequest({ month: '2026-05', species: 'DOG' }));
      const callArgs = mocks.prisma.booking.findMany.mock.calls[0][0];
      expect(callArgs.where.deletedAt).toBe(null);
    });
  });

  // ── Capacity from Setting ──────────────────────────────────────────────

  describe('capacity from Setting', () => {
    it('reads dogs limit from getCapacityLimits for DOG species', async () => {
      mocks.getCapacityLimits.mockResolvedValueOnce({ dogs: 15, cats: 10 });
      const res = await GET(makeRequest({ month: '2026-05', species: 'DOG' }));
      const body = await res.json();
      expect(body.days[0].limit).toBe(15);
      expect(mocks.getCapacityLimits).toHaveBeenCalled();
    });

    it('reads cats limit from getCapacityLimits for CAT species', async () => {
      mocks.getCapacityLimits.mockResolvedValueOnce({ dogs: 20, cats: 8 });
      const res = await GET(makeRequest({ month: '2026-05', species: 'CAT' }));
      const body = await res.json();
      expect(body.days[0].limit).toBe(8);
      expect(mocks.getCapacityLimits).toHaveBeenCalled();
    });

    it('uses default limit=20 for DOG when getCapacityLimits returns defaults', async () => {
      const res = await GET(makeRequest({ month: '2026-05', species: 'DOG' }));
      expect((await res.json()).days[0].limit).toBe(20);
    });

    it('uses default limit=10 for CAT when getCapacityLimits returns defaults', async () => {
      const res = await GET(makeRequest({ month: '2026-05', species: 'CAT' }));
      expect((await res.json()).days[0].limit).toBe(10);
    });

    it('forwards numeric limits from getCapacityLimits unchanged', async () => {
      mocks.getCapacityLimits.mockResolvedValueOnce({ dogs: 25, cats: 10 });
      const res = await GET(makeRequest({ month: '2026-05', species: 'DOG' }));
      const limit = (await res.json()).days[0].limit;
      expect(typeof limit).toBe('number');
      expect(limit).toBe(25);
    });
  });

  // ── cacheReadThrough ──────────────────────────────────────────────────

  describe('cacheReadThrough', () => {
    it('is called with key "availability:DOG:2026-05" and TTL 300', async () => {
      await GET(makeRequest({ month: '2026-05', species: 'DOG' }));
      expect(mocks.cacheReadThrough).toHaveBeenCalledTimes(1);
      const [key, ttl] = mocks.cacheReadThrough.mock.calls[0];
      expect(key).toBe('availability:DOG:2026-05');
      expect(ttl).toBe(300);
    });

    it('uses key "availability:CAT:2026-05" when species=CAT', async () => {
      await GET(makeRequest({ month: '2026-05', species: 'CAT' }));
      const [key] = mocks.cacheReadThrough.mock.calls[0];
      expect(key).toBe('availability:CAT:2026-05');
    });

    it('returns cached data directly without calling prisma when cache hits', async () => {
      const cached = {
        species: 'DOG' as const,
        month: '2026-05',
        days: [{ date: '2026-05-01', booked: 0, limit: 20, available: 20, status: 'available' as const }],
      };
      mocks.cacheReadThrough.mockResolvedValueOnce(cached);

      const res = await GET(makeRequest({ month: '2026-05', species: 'DOG' }));
      const body = await res.json();
      expect(body).toEqual(cached);
      // Loader was never called → prisma not queried
      expect(mocks.prisma.booking.findMany).not.toHaveBeenCalled();
    });
  });

  // ── Missing species — defaults to DOG ────────────────────────────────

  describe('missing species parameter', () => {
    it('returns 200 and defaults species to DOG', async () => {
      const res = await GET(makeRequest({ month: '2026-05' }));
      expect(res.status).toBe(200);
      expect((await res.json()).species).toBe('DOG');
    });

    it('reads dogs limit from getCapacityLimits when species is omitted', async () => {
      mocks.getCapacityLimits.mockResolvedValueOnce({ dogs: 12, cats: 10 });
      const res = await GET(makeRequest({ month: '2026-05' }));
      const body = await res.json();
      expect(body.days[0].limit).toBe(12);
      expect(mocks.getCapacityLimits).toHaveBeenCalled();
    });

    it('uses cache key "availability:DOG:2026-05" when species is omitted', async () => {
      await GET(makeRequest({ month: '2026-05' }));
      const [key] = mocks.cacheReadThrough.mock.calls[0];
      expect(key).toBe('availability:DOG:2026-05');
    });
  });

  // ── Species filtering — only requested species pets counted ──────────

  describe('species filtering', () => {
    it('does not count CAT pets in DOG availability', async () => {
      mocks.prisma.booking.findMany.mockResolvedValue([
        makeBooking({
          startDate: new Date('2026-05-01'),
          endDate: new Date('2026-05-31'),
          species: 'CAT',
          petCount: 3,
        }),
      ]);
      const res = await GET(makeRequest({ month: '2026-05', species: 'DOG' }));
      const body = await res.json();
      expect(body.days[0].booked).toBe(0);
      expect(body.days[0].available).toBe(20);
    });

    it('does not count DOG pets in CAT availability', async () => {
      mocks.prisma.setting.findUnique.mockResolvedValue({ key: 'capacity_cat', value: '10' });
      mocks.prisma.booking.findMany.mockResolvedValue([
        makeBooking({
          startDate: new Date('2026-05-01'),
          endDate: new Date('2026-05-31'),
          species: 'DOG',
          petCount: 5,
        }),
      ]);
      const res = await GET(makeRequest({ month: '2026-05', species: 'CAT' }));
      const body = await res.json();
      expect(body.days[0].booked).toBe(0);
      expect(body.days[0].available).toBe(10);
    });

    it('counts each species independently in a mixed-species booking', async () => {
      // 2 DOG + 3 CAT in one booking
      const booking = {
        startDate: new Date('2026-05-01'),
        endDate: new Date('2026-05-31'),
        bookingPets: [
          { pet: { species: 'DOG' } },
          { pet: { species: 'DOG' } },
          { pet: { species: 'CAT' } },
          { pet: { species: 'CAT' } },
          { pet: { species: 'CAT' } },
        ],
      };

      // DOG query
      mocks.prisma.booking.findMany.mockResolvedValue([booking]);
      const resDog = await GET(makeRequest({ month: '2026-05', species: 'DOG' }));
      expect((await resDog.json()).days[0].booked).toBe(2);

      // CAT query — reset relevant mocks
      vi.clearAllMocks();
      mocks.prisma.setting.findUnique.mockResolvedValue({ key: 'capacity_cat', value: '10' });
      mocks.prisma.booking.findMany.mockResolvedValue([booking]);
      mocks.cacheReadThrough.mockImplementation(
        async (_key: string, _ttl: number, loader: () => unknown) => loader(),
      );

      const resCat = await GET(makeRequest({ month: '2026-05', species: 'CAT' }));
      expect((await resCat.json()).days[0].booked).toBe(3);
    });
  });
});
