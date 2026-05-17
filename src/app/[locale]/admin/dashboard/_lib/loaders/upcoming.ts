import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { startOfTodayCasa, casablancaYMD } from '@/lib/dates-casablanca';
import { notDeleted } from '@/lib/prisma-soft';
import type { UpcomingSnapshot, UpcomingMovement } from '../shapes';

export async function loadUpcoming(): Promise<UpcomingSnapshot> {
  const start = startOfTodayCasa();
  const horizon = new Date(start.getTime() + 7 * 86_400_000 - 1);
  const [arrivalsRaw, departuresRaw, totalArrivals, totalDepartures] = await Promise.all([
    prisma.booking.findMany({
      where: notDeleted<Prisma.BookingWhereInput>({
        serviceType: 'BOARDING',
        status: { in: ['PENDING', 'CONFIRMED'] },
        startDate: { gte: start, lte: horizon },
      }),
      select: {
        id: true,
        startDate: true,
        client: { select: { name: true } },
        bookingPets: { select: { pet: { select: { name: true } } } },
      },
      orderBy: { startDate: 'asc' },
      take: 3,
    }),
    prisma.booking.findMany({
      where: notDeleted<Prisma.BookingWhereInput>({
        serviceType: 'BOARDING',
        status: { in: ['CONFIRMED', 'IN_PROGRESS'] },
        endDate: { gte: start, lte: horizon },
      }),
      select: {
        id: true,
        endDate: true,
        client: { select: { name: true } },
        bookingPets: { select: { pet: { select: { name: true } } } },
      },
      orderBy: { endDate: 'asc' },
      take: 3,
    }),
    prisma.booking.count({
      where: notDeleted<Prisma.BookingWhereInput>({
        serviceType: 'BOARDING',
        status: { in: ['PENDING', 'CONFIRMED'] },
        startDate: { gte: start, lte: horizon },
      }),
    }),
    prisma.booking.count({
      where: notDeleted<Prisma.BookingWhereInput>({
        serviceType: 'BOARDING',
        status: { in: ['CONFIRMED', 'IN_PROGRESS'] },
        endDate: { gte: start, lte: horizon },
      }),
    }),
  ]);

  const ymdString = (d: Date | null): string => {
    if (!d) return '';
    const { year, month, day } = casablancaYMD(d);
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  const arrivals: UpcomingMovement[] = arrivalsRaw.map((b) => ({
    bookingId: b.id,
    clientName: b.client.name ?? '',
    petName: b.bookingPets[0]?.pet?.name ?? '',
    dateYmd: ymdString(b.startDate),
  }));
  const departures: UpcomingMovement[] = departuresRaw.map((b) => ({
    bookingId: b.id,
    clientName: b.client.name ?? '',
    petName: b.bookingPets[0]?.pet?.name ?? '',
    dateYmd: ymdString(b.endDate),
  }));

  return {
    arrivals,
    departures,
    totalArrivals,
    totalDepartures,
  };
}
