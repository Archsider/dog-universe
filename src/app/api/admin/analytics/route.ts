import { NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { prisma } from '@/lib/prisma';
import { startOfMonth, endOfMonth, subMonths, startOfYear } from 'date-fns';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const now = new Date();
  const { searchParams } = new URL(request.url);
  const periodMonths = parseInt(searchParams.get('months') ?? '1');

  // Monthly revenue for last 12 months
  const last12Months = [];
  for (let i = 11; i >= 0; i--) {
    const monthStart = startOfMonth(subMonths(now, i));
    const monthEnd = endOfMonth(subMonths(now, i));

    const [boardingRevenue, taxiRevenue] = await Promise.all([
      prisma.invoice.aggregate({
        where: {
          status: 'PAID',
          paidAt: { gte: monthStart, lte: monthEnd },
          booking: { serviceType: 'BOARDING' },
        },
        _sum: { amount: true },
      }),
      prisma.invoice.aggregate({
        where: {
          status: 'PAID',
          paidAt: { gte: monthStart, lte: monthEnd },
          booking: { serviceType: 'PET_TAXI' },
        },
        _sum: { amount: true },
      }),
    ]);

    last12Months.push({
      month: monthStart.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
      monthDate: monthStart.toISOString(),
      boarding: boardingRevenue._sum.amount ?? 0,
      taxi: taxiRevenue._sum.amount ?? 0,
      total: (boardingRevenue._sum.amount ?? 0) + (taxiRevenue._sum.amount ?? 0),
    });
  }

  // Current month stats
  const thisMonthStart = startOfMonth(now);
  const thisMonthEnd = endOfMonth(now);
  const lastMonthStart = startOfMonth(subMonths(now, 1));
  const lastMonthEnd = endOfMonth(subMonths(now, 1));

  const [thisMonthRevenue, lastMonthRevenue, pendingCount, currentBoarders, newClientsThisMonth, totalClients] = await Promise.all([
    prisma.invoice.aggregate({
      where: { status: 'PAID', paidAt: { gte: thisMonthStart, lte: thisMonthEnd } },
      _sum: { amount: true },
    }),
    prisma.invoice.aggregate({
      where: { status: 'PAID', paidAt: { gte: lastMonthStart, lte: lastMonthEnd } },
      _sum: { amount: true },
    }),
    prisma.booking.count({ where: { status: 'PENDING' } }),
    prisma.booking.count({
      where: {
        serviceType: 'BOARDING',
        status: 'CONFIRMED',
        startDate: { lte: now },
        endDate: { gte: now },
      },
    }),
    prisma.user.count({
      where: { role: 'CLIENT', createdAt: { gte: thisMonthStart, lte: thisMonthEnd } },
    }),
    prisma.user.count({ where: { role: 'CLIENT' } }),
  ]);

  // Revenue breakdown (all time)
  const [boardingTotal, taxiTotal, groomingRevenue] = await Promise.all([
    prisma.invoiceItem.aggregate({
      where: { description: { contains: 'Pension' } },
      _sum: { total: true },
    }),
    prisma.invoiceItem.aggregate({
      where: { description: { contains: 'Taxi' } },
      _sum: { total: true },
    }),
    prisma.invoiceItem.aggregate({
      where: { description: { contains: 'Toilettage' } },
      _sum: { total: true },
    }),
  ]);

  // Period analytics
  const periodStart = subMonths(now, periodMonths);
  const [periodRevenue, periodInvoices] = await Promise.all([
    prisma.invoice.aggregate({
      where: { status: 'PAID', paidAt: { gte: periodStart } },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.invoice.findMany({
      where: { status: 'PAID', paidAt: { gte: periodStart } },
      include: { client: { select: { id: true } } },
    }),
  ]);

  const uniqueClientsInPeriod = new Set(periodInvoices.map((i) => i.clientId)).size;
  const avgBasket = periodInvoices.length > 0
    ? (periodRevenue._sum.amount ?? 0) / uniqueClientsInPeriod
    : 0;

  // Client segmentation (last 3 months activity)
  const threeMonthsAgo = subMonths(now, 3);
  const sixMonthsAgo = subMonths(now, 6);

  const [activeClients, semiActiveIds] = await Promise.all([
    prisma.user.count({
      where: {
        role: 'CLIENT',
        bookings: { some: { createdAt: { gte: threeMonthsAgo } } },
      },
    }),
    prisma.booking.findMany({
      where: { createdAt: { gte: sixMonthsAgo, lt: threeMonthsAgo } },
      select: { clientId: true },
      distinct: ['clientId'],
    }),
  ]);
  const semiActiveCount = semiActiveIds.length;
  const inactiveCount = Math.max(0, totalClients - activeClients - semiActiveCount);

  // Average stay duration
  const completedBoardings = await prisma.booking.findMany({
    where: { serviceType: 'BOARDING', status: 'COMPLETED', endDate: { not: null } },
    select: { startDate: true, endDate: true },
    take: 100,
  });
  const avgNights =
    completedBoardings.length > 0
      ? completedBoardings.reduce((sum, b) => {
          if (!b.endDate) return sum;
          const nights = Math.max(0, (b.endDate.getTime() - b.startDate.getTime()) / 86400000);
          return sum + nights;
        }, 0) / completedBoardings.length
      : 0;

  const thisMonthRevenueAmount = thisMonthRevenue._sum.amount ?? 0;
  const lastMonthRevenueAmount = lastMonthRevenue._sum.amount ?? 0;
  const monthVariation =
    lastMonthRevenueAmount > 0
      ? ((thisMonthRevenueAmount - lastMonthRevenueAmount) / lastMonthRevenueAmount) * 100
      : 0;

  return NextResponse.json({
    // KPIs
    monthlyRevenue: thisMonthRevenueAmount,
    lastMonthRevenue: lastMonthRevenueAmount,
    monthVariation: Math.round(monthVariation * 10) / 10,
    currentBoarders,
    pendingReservations: pendingCount,
    newClientsThisMonth,
    totalClients,
    // Charts
    last12Months,
    revenueBreakdown: {
      boarding: boardingTotal._sum.total ?? 0,
      taxi: taxiTotal._sum.total ?? 0,
      grooming: groomingRevenue._sum.total ?? 0,
    },
    // Period analytics
    periodRevenue: periodRevenue._sum.amount ?? 0,
    avgBasket: Math.round(avgBasket),
    avgStayDuration: Math.round(avgNights * 10) / 10,
    // Segmentation
    clientSegmentation: {
      active: activeClients,
      semiActive: semiActiveCount,
      inactive: inactiveCount,
    },
  });
}
