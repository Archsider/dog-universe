import { NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { prisma } from '@/lib/prisma';
import { startOfMonth, endOfMonth, subMonths } from 'date-fns';
import {
  totalCashCollected,
  cashByMonth,
  avgBasket as getAvgBasket,
  deltaPercent,
  currentBoarders,
  pendingBookingsCount,
  newClientsCount,
} from '@/lib/metrics';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const now = new Date();
  const currentYear = now.getFullYear();
  const { searchParams } = new URL(request.url);
  const rawMonths = parseInt(searchParams.get('months') ?? '1');
  const periodMonths = isNaN(rawMonths) ? 1 : Math.min(Math.max(rawMonths, 1), 24);
  const periodStart = subMonths(now, periodMonths);

  const thisMonthStart = startOfMonth(now);
  const thisMonthEnd   = endOfMonth(now);
  const lastMonthStart = startOfMonth(subMonths(now, 1));
  const lastMonthEnd   = endOfMonth(subMonths(now, 1));

  // ── Yearly chart ──────────────────────────────────────────────────────────────
  const currentYearMonthly = await cashByMonth(currentYear);

  const frMonths = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const yearSuffix = String(currentYear).slice(2);
  const yearlyData = Array.from({ length: 12 }, (_, i) => ({
    month:      `${frMonths[i]} ${yearSuffix}`,
    monthDate:  new Date(currentYear, i, 1).toISOString(),
    boarding:   currentYearMonthly[i].boarding,
    grooming:   currentYearMonthly[i].grooming,
    taxi:       currentYearMonthly[i].taxi,
    croquettes: currentYearMonthly[i].croquettes,
    total:      currentYearMonthly[i].total,
  }));

  // ── Current month stats ───────────────────────────────────────────────────────
  const [
    thisMonthAmt,
    lastMonthAmt,
    pendingCount,
    boarders,
    newClients,
    totalClients,
  ] = await Promise.all([
    totalCashCollected(thisMonthStart, thisMonthEnd),
    totalCashCollected(lastMonthStart, lastMonthEnd),
    pendingBookingsCount(),
    currentBoarders(),
    newClientsCount(thisMonthStart, thisMonthEnd, false),
    prisma.user.count({ where: { role: 'CLIENT' } }),
  ]);

  const { cat: currentCatBoarders, dog: currentDogBoarders } = boarders;
  const monthVariation = deltaPercent(thisMonthAmt, lastMonthAmt);
  const maxCapacity = 60;

  // ── Revenue breakdown all-time — allocatedAmount (PAID/PARTIALLY_PAID) ────────
  const [boardingTotal, taxiTotal, groomingTotal] = await Promise.all([
    prisma.invoiceItem.aggregate({
      where: { category: 'BOARDING', invoice: { status: { in: ['PAID', 'PARTIALLY_PAID'] } } },
      _sum: { allocatedAmount: true },
    }),
    prisma.invoiceItem.aggregate({
      where: { category: 'PET_TAXI', invoice: { status: { in: ['PAID', 'PARTIALLY_PAID'] } } },
      _sum: { allocatedAmount: true },
    }),
    prisma.invoiceItem.aggregate({
      where: { category: 'GROOMING', invoice: { status: { in: ['PAID', 'PARTIALLY_PAID'] } } },
      _sum: { allocatedAmount: true },
    }),
  ]);

  // ── Period analytics ──────────────────────────────────────────────────────────
  const [totalPeriodRevenue, avgBasketValue] = await Promise.all([
    totalCashCollected(periodStart, now),
    getAvgBasket(periodStart, now),
  ]);

  // ── Client segmentation ───────────────────────────────────────────────────────
  const threeMonthsAgo = subMonths(now, 3);
  const sixMonthsAgo   = subMonths(now, 6);
  const [activeClients, semiActiveIds] = await Promise.all([
    prisma.user.count({
      where: { role: 'CLIENT', bookings: { some: { createdAt: { gte: threeMonthsAgo } } } },
    }),
    prisma.booking.findMany({
      where: { createdAt: { gte: sixMonthsAgo, lt: threeMonthsAgo } },
      select: { clientId: true },
      distinct: ['clientId'],
    }),
  ]);
  const semiActiveCount = semiActiveIds.length;
  const inactiveCount = Math.max(0, totalClients - activeClients - semiActiveCount);

  // ── Avg stay duration ─────────────────────────────────────────────────────────
  const completedBoardings = await prisma.booking.findMany({
    where: { serviceType: 'BOARDING', status: 'COMPLETED', endDate: { not: null } },
    select: { startDate: true, endDate: true },
    take: 100,
  });
  const avgNights =
    completedBoardings.length > 0
      ? completedBoardings.reduce((sum, b) => {
          if (!b.endDate) return sum;
          return sum + Math.max(0, (b.endDate.getTime() - b.startDate.getTime()) / 86400000);
        }, 0) / completedBoardings.length
      : 0;

  return NextResponse.json({
    monthlyRevenue:    thisMonthAmt,
    lastMonthRevenue:  lastMonthAmt,
    monthVariation,
    currentBoarders:   currentCatBoarders + currentDogBoarders,
    currentCatBoarders,
    currentDogBoarders,
    catCapacity:       10,
    dogCapacity:       50,
    maxCapacity,
    pendingReservations: pendingCount,
    newClientsThisMonth: newClients,
    totalClients,
    yearlyData,
    revenueBreakdown: {
      boarding: boardingTotal._sum.allocatedAmount ?? 0,
      taxi:     taxiTotal._sum.allocatedAmount ?? 0,
      grooming: groomingTotal._sum.allocatedAmount ?? 0,
    },
    periodRevenue:    totalPeriodRevenue,
    avgBasket:        avgBasketValue,
    avgStayDuration:  Math.round(avgNights * 10) / 10,
    clientSegmentation: {
      active:     activeClients,
      semiActive: semiActiveCount,
      inactive:   inactiveCount,
    },
  });
}
