// Stats Hero loader — month revenue, stay counts, and current occupancy.
// Reads from monthly_revenue_mv when available, falls back to live aggregate.
//
// Source : Wave 6 (Admin classe mondiale, Feature #6).

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { notDeleted } from '@/lib/prisma-soft';
import { casablancaYMD } from '@/lib/dates-casablanca';
import { getMonthlyRevenueByCategory } from '@/lib/billing/monthly-revenue';

export interface StatsHeroData {
  monthRevenue: number;
  monthRevenuePrev: number;
  monthStays: number;
  monthStaysPrev: number;
  occupancyDogPct: number;
  occupancyCatPct: number;
}

export async function loadStatsHero(): Promise<StatsHeroData> {
  const todayCasa = casablancaYMD();
  const { year, month } = todayCasa;
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;

  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 1));
  const prevStart = new Date(Date.UTC(prevYear, prevMonth - 1, 1));
  const prevEnd = new Date(Date.UTC(prevYear, prevMonth, 1));

  // Revenue : pass through the canonical Sémantique B helper.  It reads
  // the MV cache + drift-checks against live in the background.  Sums all
  // categories to get the month total.
  const [currResult, prevResult] = await Promise.all([
    getMonthlyRevenueByCategory(year, month),
    getMonthlyRevenueByCategory(prevYear, prevMonth),
  ]);
  const monthRevenue = currResult.totalAllCategories;
  const monthRevenuePrev = prevResult.totalAllCategories;

  // Stays — count COMPLETED bookings whose startDate falls in month Casa.
  const [monthStays, monthStaysPrev] = await Promise.all([
    prisma.booking.count({
      where: notDeleted<Prisma.BookingWhereInput>({
        status: { in: ['COMPLETED', 'IN_PROGRESS'] },
        startDate: { gte: monthStart, lt: monthEnd },
      }),
    }),
    prisma.booking.count({
      where: notDeleted({
        status: 'COMPLETED',
        startDate: { gte: prevStart, lt: prevEnd },
      }),
    }),
  ]);

  // Occupancy now — current IN_PROGRESS by species ÷ configured limit.
  const [pets, settings] = await Promise.all([
    prisma.bookingPet.findMany({
      where: {
        booking: { status: 'IN_PROGRESS', ...notDeleted() },
      },
      select: { pet: { select: { species: true } } },
      take: 500,
    }),
    prisma.setting.findMany({
      where: { key: { in: ['capacity_dog', 'capacity_cat'] } },
      select: { key: true, value: true },
    }),
  ]);
  const capByKey = new Map(settings.map((s) => [s.key, parseInt(s.value, 10) || 0]));
  const dogLimit = capByKey.get('capacity_dog') ?? 20;
  const catLimit = capByKey.get('capacity_cat') ?? 10;
  let dogs = 0; let cats = 0;
  for (const bp of pets) {
    if (bp.pet?.species === 'DOG') dogs++;
    else if (bp.pet?.species === 'CAT') cats++;
  }

  return {
    monthRevenue,
    monthRevenuePrev,
    monthStays,
    monthStaysPrev,
    occupancyDogPct: dogLimit > 0 ? (dogs / dogLimit) * 100 : 0,
    occupancyCatPct: catLimit > 0 ? (cats / catLimit) * 100 : 0,
  };
}
