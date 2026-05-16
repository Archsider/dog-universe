/* eslint-disable @typescript-eslint/no-explicit-any -- test stubs */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { casablancaYMD } from '@/lib/dates-casablanca';

// ── Mock prisma — we exercise loadToday() through loadDashboardSnapshot ──
// so we mock everything it touches. Only the taxi branch matters for these
// tests ; we return empty arrays for the other queries.

const taxiTripFindMany = vi.fn();
const bookingFindMany = vi.fn();
const bookingCount = vi.fn();
const petFindMany = vi.fn();
const vaccinationFindMany = vi.fn();
const userFindMany = vi.fn();
const bookingFindManyInProgress = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    booking: {
      findMany: (args: any) => bookingFindMany(args),
      count: (args: any) => bookingCount(args),
    },
    taxiTrip: {
      findMany: (args: any) => taxiTripFindMany(args),
    },
    pet: { findMany: (args: any) => petFindMany(args) },
    vaccination: { findMany: (args: any) => vaccinationFindMany(args) },
    user: { findMany: (args: any) => userFindMany(args) },
  },
}));

// capacity lib — bypass the cache stuff
vi.mock('@/lib/capacity', () => ({
  getCapacityLimits: async () => ({ dogs: 50, cats: 10 }),
  countOverlappingPets: async () => 0,
}));

// observability + cache — neutralise
vi.mock('@/lib/cache', () => ({
  cacheGet: async () => null,
}));

// We import the module fresh after setting up the mocks.
async function callLoadSnapshot() {
  const mod = await import('../queries');
  return mod.loadDashboardSnapshot();
}

beforeEach(() => {
  taxiTripFindMany.mockReset();
  bookingFindMany.mockReset();
  bookingCount.mockReset();
  petFindMany.mockReset();
  vaccinationFindMany.mockReset();
  userFindMany.mockReset();
  bookingFindManyInProgress.mockReset();
  // Defaults for the non-taxi queries — keep them quiet.
  bookingFindMany.mockResolvedValue([]);
  bookingCount.mockResolvedValue(0);
  petFindMany.mockResolvedValue([]);
  vaccinationFindMany.mockResolvedValue([]);
  userFindMany.mockResolvedValue([]);
});

// ── Fixtures ───────────────────────────────────────────────────────────
const TODAY_YMD = (() => {
  const { year, month, day } = casablancaYMD(new Date());
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
})();

function tripFixture(over: Record<string, any> = {}) {
  return {
    id: 'tt_default',
    tripType: 'OUTBOUND' as const,
    time: '10:30',
    address: '123 rue de la Pension, Bouskoura',
    booking: {
      id: 'b_default',
      client: { name: 'Default Client' },
      bookingPets: [{ pet: { name: 'Rex' } }],
      taxiDetail: null,
      boardingDetail: null,
    },
    ...over,
  };
}

// ── Regression tests — the 6 obligatory cases from the brief ────────────
describe('loadToday() → taxiRuns regression', () => {
  it('CASE 1 : BOARDING + addon taxi GO → counted as OUTBOUND', async () => {
    taxiTripFindMany.mockResolvedValue([
      tripFixture({
        id: 'tt_go',
        tripType: 'OUTBOUND',
        address: null,
        booking: {
          id: 'b_marie',
          client: { name: 'Marie Lagarde' },
          bookingPets: [{ pet: { name: 'Mozart' } }],
          taxiDetail: null,
          // Fallback address chain : trip has no address, boardingDetail does.
          boardingDetail: { taxiGoAddress: 'Rabat-Hassan' },
        },
      }),
    ]);
    const snap = await callLoadSnapshot();
    expect(snap.today.taxiRuns).toHaveLength(1);
    expect(snap.today.taxiRuns[0].tripType).toBe('OUTBOUND');
    expect(snap.today.taxiRuns[0].pickupAddress).toBe('Rabat-Hassan');
    expect(snap.today.taxiRuns[0].petName).toBe('Mozart');
  });

  it('CASE 2 : BOARDING + addon taxi RETURN → counted as RETURN', async () => {
    taxiTripFindMany.mockResolvedValue([
      tripFixture({
        id: 'tt_ret',
        tripType: 'RETURN',
        address: 'Casa-Bouskoura',
        booking: {
          id: 'b_rim',
          client: { name: 'Rim Kabli' },
          bookingPets: [{ pet: { name: 'Ragnar' } }],
          taxiDetail: null,
          boardingDetail: { taxiReturnAddress: 'fallback-unused' },
        },
      }),
    ]);
    const snap = await callLoadSnapshot();
    expect(snap.today.taxiRuns).toHaveLength(1);
    expect(snap.today.taxiRuns[0].tripType).toBe('RETURN');
    expect(snap.today.taxiRuns[0].dropoffAddress).toBe('Casa-Bouskoura');
    expect(snap.today.taxiRuns[0].pickupAddress).toBeNull(); // = pension implicit
  });

  it('CASE 3 : standalone PET_TAXI → counted as STANDALONE', async () => {
    taxiTripFindMany.mockResolvedValue([
      tripFixture({
        id: 'tt_standalone',
        tripType: 'STANDALONE',
        address: null, // backfill chain
        booking: {
          id: 'b_taxi',
          client: { name: 'Standalone Client' },
          bookingPets: [{ pet: { name: 'Luna' } }],
          taxiDetail: { pickupAddress: 'Pickup-fallback', dropoffAddress: 'Dropoff' },
          boardingDetail: null,
        },
      }),
    ]);
    const snap = await callLoadSnapshot();
    expect(snap.today.taxiRuns).toHaveLength(1);
    expect(snap.today.taxiRuns[0].tripType).toBe('STANDALONE');
    expect(snap.today.taxiRuns[0].pickupAddress).toBe('Pickup-fallback');
    expect(snap.today.taxiRuns[0].dropoffAddress).toBe('Dropoff');
  });

  it('CASE 4 : BOARDING without addon → not counted (no TaxiTrip row exists)', async () => {
    // No taxi trip for this booking → mock returns empty.
    taxiTripFindMany.mockResolvedValue([]);
    const snap = await callLoadSnapshot();
    expect(snap.today.taxiRuns).toEqual([]);
  });

  it('CASE 5 : TaxiTrip with terminal status (ARRIVED_AT_CLIENT) → not counted (excluded by where clause)', async () => {
    // The where clause filters `status: { notIn: TAXI_TERMINAL_STATUSES }`,
    // so the mock should NOT return terminal rows when called with that
    // filter. We assert the filter is correctly built by the query.
    taxiTripFindMany.mockImplementationOnce((args: any) => {
      // If the query is built right, the mock receives the notIn filter.
      // We return empty to mirror Postgres behaviour (would not return
      // ARRIVED_AT_CLIENT rows).
      const notIn = args?.where?.status?.notIn ?? [];
      expect(notIn).toContain('ARRIVED_AT_CLIENT');
      expect(notIn).toContain('ARRIVED_AT_PENSION');
      expect(notIn).toContain('CANCELLED');
      return Promise.resolve([]);
    });
    const snap = await callLoadSnapshot();
    expect(snap.today.taxiRuns).toEqual([]);
  });

  it('CASE 6 : Booking deletedAt non null → filter via nested where (assertion on where shape)', async () => {
    taxiTripFindMany.mockImplementationOnce((args: any) => {
      // The nested booking filter must enforce deletedAt: null.
      expect(args?.where?.booking?.deletedAt).toBeNull();
      // And status must be CONFIRMED or IN_PROGRESS only.
      const bookingStatusIn = args?.where?.booking?.status?.in ?? [];
      expect(bookingStatusIn).toContain('CONFIRMED');
      expect(bookingStatusIn).toContain('IN_PROGRESS');
      expect(bookingStatusIn).not.toContain('PENDING');
      expect(bookingStatusIn).not.toContain('CANCELLED');
      return Promise.resolve([]);
    });
    const snap = await callLoadSnapshot();
    expect(snap.today.taxiRuns).toEqual([]);
  });
});

// ── Date filter — Casa string compare (not Date object) ────────────────
describe('loadToday() → date filter uses YYYY-MM-DD string compare', () => {
  it('passes a string YYYY-MM-DD to TaxiTrip.date, not a Date', async () => {
    taxiTripFindMany.mockImplementationOnce((args: any) => {
      const dateFilter = args?.where?.date;
      expect(typeof dateFilter).toBe('string');
      expect(dateFilter).toBe(TODAY_YMD);
      expect(dateFilter).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      return Promise.resolve([]);
    });
    await callLoadSnapshot();
  });
});

// ── Mehdi's 3 real bookings of 2026-05-16 (simulated end-to-end) ────────
describe("Mehdi's 3-trip scenario (A=3, B=3, C=0 confirmed)", () => {
  it('returns all 3 trips with correct mapping when the DB has them', async () => {
    taxiTripFindMany.mockResolvedValue([
      tripFixture({
        id: 'tt_mozart_ret',
        tripType: 'RETURN',
        time: '14:00',
        address: 'Casa-Anfa',
        booking: {
          id: 'b_marie',
          client: { name: 'Marie Lagarde' },
          bookingPets: [{ pet: { name: 'Mozart' } }],
          taxiDetail: null,
          boardingDetail: { taxiReturnAddress: 'Casa-Anfa' },
        },
      }),
      tripFixture({
        id: 'tt_ragnar_go',
        tripType: 'OUTBOUND',
        time: '10:30',
        address: 'Rabat-Hassan',
        booking: {
          id: 'b_rim_1',
          client: { name: 'Rim Kabli' },
          bookingPets: [{ pet: { name: 'Ragnar' } }],
          taxiDetail: null,
          boardingDetail: null,
        },
      }),
      tripFixture({
        id: 'tt_theo_go',
        tripType: 'OUTBOUND',
        time: '10:30',
        address: 'Rabat-Hassan',
        booking: {
          id: 'b_rim_2',
          client: { name: 'Rim Kabli' },
          bookingPets: [{ pet: { name: 'Théo' } }],
          taxiDetail: null,
          boardingDetail: null,
        },
      }),
    ]);
    const snap = await callLoadSnapshot();
    expect(snap.today.taxiRuns).toHaveLength(3);
    const directions = snap.today.taxiRuns.map((t) => t.tripType);
    expect(directions).toContain('OUTBOUND');
    expect(directions).toContain('RETURN');
    // Trip ids are stable keys (multi-trip-per-booking case wouldn't collide).
    const ids = snap.today.taxiRuns.map((t) => t.tripId);
    expect(new Set(ids).size).toBe(3);
  });
});
