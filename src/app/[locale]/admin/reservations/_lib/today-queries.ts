// Server-side query helpers for the Today view of /admin/reservations.
// Pure data-loading layer — no rendering, no auth (caller handles that).
import { prisma } from '@/lib/prisma';
import { toNumber } from '@/lib/decimal';
import { getPricingSettings, type PricingSettings } from '@/lib/pricing';
import { computeLiveTotal, CASA_TZ } from '@/lib/live-pricing';
import { notDeleted } from '@/lib/prisma-soft';

export { CASA_TZ };

export type TodayPet = { id: string; name: string; species: 'DOG' | 'CAT' };
export type TodayClient = { id: string; name: string; phone: string | null; isWalkIn: boolean };

export type TodayBooking = {
  id: string;
  version: number;
  status: string;
  serviceType: 'BOARDING' | 'PET_TAXI';
  startDate: string;
  endDate: string | null;
  arrivalTime: string | null;
  isOpenEnded: boolean;
  totalPrice: number;
  invoiceAmount: number | null;
  notes: string | null;
  client: TodayClient;
  pets: TodayPet[];
  liveTotal?: number;
  liveNights?: number;
};

export type TodaySnapshot = {
  date: string;
  kpis: { arrivals: number; departures: number; present: number; pending: number };
  arrivals: TodayBooking[];
  departures: TodayBooking[];
  currentStays: TodayBooking[];
  pending: TodayBooking[];
  upcomingWeek: { date: string; count: number }[];
};

export function dayRangeUTC(date: Date): { start: Date; end: Date } {
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setUTCHours(23, 59, 59, 999);
  return { start, end };
}

const BOOKING_SELECT = {
  id: true,
  version: true,
  status: true,
  serviceType: true,
  startDate: true,
  endDate: true,
  arrivalTime: true,
  isOpenEnded: true,
  totalPrice: true,
  notes: true,
  client: { select: { id: true, name: true, phone: true, isWalkIn: true } },
  bookingPets: { select: { pet: { select: { id: true, name: true, species: true } } } },
  invoice: { select: { amount: true } },
} as const;

type RawBooking = {
  id: string;
  version: number;
  status: string;
  serviceType: string;
  startDate: Date;
  endDate: Date | null;
  arrivalTime: string | null;
  isOpenEnded: boolean;
  totalPrice: { toString(): string } | number;
  notes: string | null;
  client: { id: string; name: string | null; phone: string | null; isWalkIn: boolean };
  bookingPets: { pet: { id: string; name: string; species: string } }[];
  invoice: { amount: { toString(): string } | number } | null;
};

function mapBooking(b: RawBooking): TodayBooking {
  return {
    id: b.id,
    version: b.version,
    status: b.status,
    serviceType: b.serviceType as 'BOARDING' | 'PET_TAXI',
    startDate: b.startDate.toISOString(),
    endDate: b.endDate?.toISOString() ?? null,
    arrivalTime: b.arrivalTime,
    isOpenEnded: b.isOpenEnded,
    totalPrice: toNumber(b.totalPrice as unknown as number),
    invoiceAmount: b.invoice ? toNumber(b.invoice.amount as unknown as number) : null,
    notes: b.notes,
    client: {
      id: b.client.id,
      name: b.client.name ?? '—',
      phone: b.client.phone,
      isWalkIn: b.client.isWalkIn,
    },
    pets: b.bookingPets.map((bp) => ({
      id: bp.pet.id,
      name: bp.pet.name,
      species: (bp.pet.species === 'CAT' ? 'CAT' : 'DOG') as 'DOG' | 'CAT',
    })),
  };
}

function withLiveTotal(b: TodayBooking, pricing: PricingSettings, now: Date): TodayBooking {
  if (!b.isOpenEnded) return b;
  const { nights, total } = computeLiveTotal(
    { startDate: new Date(b.startDate), pets: b.pets },
    pricing,
    now,
  );
  return { ...b, liveNights: nights, liveTotal: total };
}

export async function loadTodaySnapshot(now: Date = new Date()): Promise<TodaySnapshot> {
  const { start, end } = dayRangeUTC(now);

  // Window for upcoming week: today+1 → today+7
  const weekStart = new Date(end);
  weekStart.setUTCDate(weekStart.getUTCDate() + 1);
  weekStart.setUTCHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
  weekEnd.setUTCHours(23, 59, 59, 999);

  const [arrivalsRaw, departuresRaw, currentRaw, pendingRaw, upcomingRaw] = await Promise.all([
    // Arrivals today: confirmed, startDate is today, not yet checked-in
    prisma.booking.findMany({
      where: {
        deletedAt: null,
        status: 'CONFIRMED',
        startDate: { gte: start, lte: end },
      },
      select: BOOKING_SELECT,
      orderBy: [{ arrivalTime: 'asc' }, { startDate: 'asc' }],
      take: 100,
    }),
    // Departures today: in progress, endDate is today (excludes open-ended)
    prisma.booking.findMany({
      where: {
        deletedAt: null,
        status: 'IN_PROGRESS',
        endDate: { gte: start, lte: end },
      },
      select: BOOKING_SELECT,
      orderBy: [{ endDate: 'asc' }, { startDate: 'asc' }],
      take: 100,
    }),
    // Current stays: in progress, started but not departing today (incl. open-ended)
    prisma.booking.findMany({
      where: {
        deletedAt: null,
        status: 'IN_PROGRESS',
        startDate: { lte: end },
        OR: [
          { endDate: null },
          { endDate: { gt: end } },
        ],
      },
      select: BOOKING_SELECT,
      orderBy: [{ endDate: 'asc' }, { startDate: 'asc' }],
      take: 100,
    }),
    // Pending: oldest first (manual review queue)
    prisma.booking.findMany({
      where: notDeleted({ status: 'PENDING' }),
      select: BOOKING_SELECT,
      orderBy: { createdAt: 'asc' },
      take: 100,
    }),
    // Upcoming week: count by day (groupBy not friendly with dates, fetch & bucket)
    prisma.booking.findMany({
      where: {
        deletedAt: null,
        status: { in: ['PENDING', 'CONFIRMED'] },
        startDate: { gte: weekStart, lte: weekEnd },
      },
      select: { startDate: true },
      take: 500,
    }),
  ]);

  const pricing = await getPricingSettings();
  const decorate = (b: RawBooking) => withLiveTotal(mapBooking(b), pricing, now);

  const arrivals = arrivalsRaw.map(decorate);
  const departures = departuresRaw.map(decorate);
  const currentStays = currentRaw.map(decorate);
  const pending = pendingRaw.map(decorate);

  // Bucket upcoming week by yyyy-mm-dd
  const buckets = new Map<string, number>();
  for (const b of upcomingRaw) {
    const key = b.startDate.toISOString().slice(0, 10);
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  const upcomingWeek = Array.from(buckets.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, count]) => ({ date, count }));

  return {
    date: start.toISOString().slice(0, 10),
    kpis: {
      arrivals: arrivals.length,
      departures: departures.length,
      present: currentStays.length + departures.length,
      pending: pending.length,
    },
    arrivals,
    departures,
    currentStays,
    pending,
    upcomingWeek,
  };
}
