import { vi, describe, it, expect, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  taxiTrip: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

import {
  getTaxiTripHistory,
  getTaxiTripHistoryForExport,
  HISTORY_TERMINAL_STATUSES,
  HISTORY_EXPORT_CAP,
} from '../taxi-history.service';

function mkPrismaTrip(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cmw_trip_1',
    bookingId: 'cmw_booking_1',
    date: '2026-05-14',
    time: '10:30',
    tripType: 'OUTBOUND',
    status: 'ARRIVED_AT_PENSION',
    distanceKm: 5.4,
    address: null,
    booking: {
      client: { name: 'Kabbaj Rita' },
      bookingPets: [{ pet: { name: 'Mamy' } }],
      taxiDetail: null,
      boardingDetail: {
        taxiGoAddress: '12 rue de Casa, Marrakech',
        taxiReturnAddress: '12 rue de Casa, Marrakech',
      },
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.taxiTrip.findMany.mockResolvedValue([]);
  mockPrisma.taxiTrip.count.mockResolvedValue(0);
});

describe('getTaxiTripHistory — filters', () => {
  it('passes date range filter as gte/lte on Trip.date (lexicographic ISO compare)', async () => {
    await getTaxiTripHistory({ from: '2026-05-01', to: '2026-05-31' });
    const args = mockPrisma.taxiTrip.findMany.mock.calls[0][0];
    expect(args.where.date).toEqual({ gte: '2026-05-01', lte: '2026-05-31' });
  });

  it('only `from` filter ⇒ only `gte` predicate', async () => {
    await getTaxiTripHistory({ from: '2026-05-01' });
    const args = mockPrisma.taxiTrip.findMany.mock.calls[0][0];
    expect(args.where.date).toEqual({ gte: '2026-05-01' });
  });

  it('omits Trip.date filter entirely when no range is given', async () => {
    await getTaxiTripHistory({});
    const args = mockPrisma.taxiTrip.findMany.mock.calls[0][0];
    expect(args.where.date).toBeUndefined();
  });

  it('passes tripType filter as exact match', async () => {
    await getTaxiTripHistory({ type: 'OUTBOUND' });
    const args = mockPrisma.taxiTrip.findMany.mock.calls[0][0];
    expect(args.where.tripType).toBe('OUTBOUND');
  });

  it('passes specific status when given', async () => {
    await getTaxiTripHistory({ status: 'CANCELLED' });
    const args = mockPrisma.taxiTrip.findMany.mock.calls[0][0];
    expect(args.where.status).toBe('CANCELLED');
  });

  it('defaults to all 6 terminal statuses when no status filter is given', async () => {
    await getTaxiTripHistory({});
    const args = mockPrisma.taxiTrip.findMany.mock.calls[0][0];
    expect(args.where.status).toEqual({ in: [...HISTORY_TERMINAL_STATUSES] });
    expect(HISTORY_TERMINAL_STATUSES).toContain('CANCELLED');
    expect(HISTORY_TERMINAL_STATUSES).toContain('NO_SHOW');
  });

  it('always hides courses for soft-deleted clients via booking.deletedAt: null', async () => {
    await getTaxiTripHistory({});
    const args = mockPrisma.taxiTrip.findMany.mock.calls[0][0];
    expect(args.where.booking.deletedAt).toBe(null);
  });

  it('passes clientId filter through booking.clientId', async () => {
    await getTaxiTripHistory({ clientId: 'cmw_client_xyz_1234567890' });
    const args = mockPrisma.taxiTrip.findMany.mock.calls[0][0];
    expect(args.where.booking.clientId).toBe('cmw_client_xyz_1234567890');
  });
});

describe('getTaxiTripHistory — pagination', () => {
  it('default pageSize is 20 — take 21 to detect "has more"', async () => {
    await getTaxiTripHistory({});
    const args = mockPrisma.taxiTrip.findMany.mock.calls[0][0];
    expect(args.take).toBe(21);
  });

  it('respects pageSize, clamping to [1, 100]', async () => {
    await getTaxiTripHistory({ pageSize: 50 });
    expect(mockPrisma.taxiTrip.findMany.mock.calls[0][0].take).toBe(51);

    await getTaxiTripHistory({ pageSize: 0 });
    expect(mockPrisma.taxiTrip.findMany.mock.calls[1][0].take).toBe(2); // clamped to 1 → take 2

    await getTaxiTripHistory({ pageSize: 999 });
    expect(mockPrisma.taxiTrip.findMany.mock.calls[2][0].take).toBe(101); // clamped to 100 → take 101
  });

  it('orderBy is [date desc, time desc, id desc] — most recent first, id desc tie-break', async () => {
    await getTaxiTripHistory({});
    const args = mockPrisma.taxiTrip.findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual([{ date: 'desc' }, { time: 'desc' }, { id: 'desc' }]);
  });

  it('with cursor: applies skip:1 + cursor', async () => {
    await getTaxiTripHistory({ cursor: 'cmw_trip_xyz_1234567890' });
    const args = mockPrisma.taxiTrip.findMany.mock.calls[0][0];
    expect(args.skip).toBe(1);
    expect(args.cursor).toEqual({ id: 'cmw_trip_xyz_1234567890' });
  });

  it('returns nextCursor = id of last row when there is a next page', async () => {
    const rows = Array.from({ length: 21 }, (_, i) =>
      mkPrismaTrip({ id: `cmw_trip_${i.toString().padStart(2, '0')}` }),
    );
    mockPrisma.taxiTrip.findMany.mockResolvedValue(rows);
    mockPrisma.taxiTrip.count.mockResolvedValue(100);

    const page = await getTaxiTripHistory({});

    expect(page.rows).toHaveLength(20);
    expect(page.nextCursor).toBe('cmw_trip_19');
    expect(page.totalCount).toBe(100);
  });

  it('returns nextCursor = null when this is the last page', async () => {
    const rows = Array.from({ length: 5 }, (_, i) =>
      mkPrismaTrip({ id: `cmw_trip_${i}` }),
    );
    mockPrisma.taxiTrip.findMany.mockResolvedValue(rows);
    mockPrisma.taxiTrip.count.mockResolvedValue(5);

    const page = await getTaxiTripHistory({});

    expect(page.rows).toHaveLength(5);
    expect(page.nextCursor).toBeNull();
  });
});

describe('getTaxiTripHistory — row mapping', () => {
  it('OUTBOUND trip resolves pickup from taxiDetail / boardingDetail.taxiGoAddress', async () => {
    mockPrisma.taxiTrip.findMany.mockResolvedValue([
      mkPrismaTrip({
        tripType: 'OUTBOUND',
        booking: {
          client: { name: 'X' },
          bookingPets: [{ pet: { name: 'Mamy' } }],
          taxiDetail: { pickupAddress: 'Direct pickup', dropoffAddress: 'Drop' },
          boardingDetail: null,
        },
      }),
    ]);
    const page = await getTaxiTripHistory({});
    expect(page.rows[0].pickupAddress).toBe('Direct pickup');
    expect(page.rows[0].dropoffAddress).toBe('Drop');
  });

  it('RETURN trip resolves pickup from boardingDetail.taxiReturnAddress, no dropoff', async () => {
    mockPrisma.taxiTrip.findMany.mockResolvedValue([
      mkPrismaTrip({
        tripType: 'RETURN',
        booking: {
          client: { name: 'X' },
          bookingPets: [{ pet: { name: 'Mamy' } }],
          taxiDetail: null,
          boardingDetail: {
            taxiGoAddress: 'Go addr',
            taxiReturnAddress: '12 rue Return, Marrakech',
          },
        },
      }),
    ]);
    const page = await getTaxiTripHistory({});
    expect(page.rows[0].pickupAddress).toBe('12 rue Return, Marrakech');
    expect(page.rows[0].dropoffAddress).toBeNull();
  });

  it('filters out null pets from bookingPets', async () => {
    mockPrisma.taxiTrip.findMany.mockResolvedValue([
      mkPrismaTrip({
        booking: {
          client: { name: 'X' },
          bookingPets: [
            { pet: { name: 'Mamy' } },
            { pet: null },
            { pet: { name: 'Lola' } },
          ],
          taxiDetail: null,
          boardingDetail: null,
        },
      }),
    ]);
    const page = await getTaxiTripHistory({});
    expect(page.rows[0].petNames).toEqual(['Mamy', 'Lola']);
  });
});

describe('getTaxiTripHistoryForExport', () => {
  it('caps at HISTORY_EXPORT_CAP (5000) and skips pagination metadata', async () => {
    await getTaxiTripHistoryForExport({});
    const args = mockPrisma.taxiTrip.findMany.mock.calls[0][0];
    expect(args.take).toBe(HISTORY_EXPORT_CAP);
    expect(args.skip).toBeUndefined();
    expect(args.cursor).toBeUndefined();
    expect(mockPrisma.taxiTrip.count).not.toHaveBeenCalled();
  });

  it('returns mapped rows directly (no envelope)', async () => {
    mockPrisma.taxiTrip.findMany.mockResolvedValue([mkPrismaTrip()]);
    const rows = await getTaxiTripHistoryForExport({});
    expect(Array.isArray(rows)).toBe(true);
    expect(rows[0].clientName).toBe('Kabbaj Rita');
  });
});
