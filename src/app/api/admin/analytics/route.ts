import { NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { prisma } from '@/lib/prisma';
import { startOfMonth, endOfMonth, subMonths } from 'date-fns';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const now = new Date();
  const { searchParams } = new URL(request.url);
  const periodMonths = parseInt(searchParams.get('months') ?? '1');

  // ── 2026 yearly chart (single query, grooming breakdown) ──────────────────
  const start2026 = new Date('2026-01-01T00:00:00.000Z');
  const end2026 = new Date('2026-12-31T23:59:59.999Z');

  const invoices2026 = await prisma.invoice.findMany({
    where: { status: 'PAID', paidAt: { gte: start2026, lte: end2026 } },
    select: {
      amount: true,
      paidAt: true,
      booking: {
        select: {
          serviceType: true,
          boardingDetail: { select: { groomingPrice: true } },
        },
      },
    },
  });

  const monthly: Record<number, { boarding: number; grooming: number; taxi: number }> = {};
  for (let m = 0; m < 12; m++) monthly[m] = { boarding: 0, grooming: 0, taxi: 0 };

  for (const inv of invoices2026) {
    if (!inv.paidAt) continue;
    const m = new Date(inv.paidAt).getMonth();
    if (inv.booking?.serviceType === 'PET_TAXI') {
      monthly[m].taxi += inv.amount;
    } else if (inv.booking?.serviceType === 'BOARDING') {
      const g = inv.booking.boardingDetail?.groomingPrice ?? 0;
      monthly[m].grooming += g;
      monthly[m].boarding += inv.amount - g;
    }
  }

  const frMonths = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const yearlyData = Array.from({ length: 12 }, (_, i) => ({
    month: `${frMonths[i]} 26`,
    monthDate: new Date(2026, i, 1).toISOString(),
    boarding: monthly[i].boarding,
    grooming: monthly[i].grooming,
    taxi: monthly[i].taxi,
    total: monthly[i].boarding + monthly[i].grooming + monthly[i].taxi,
  }));

  // ── Current month stats ───────────────────────────────────────────────────
  const thisMonthStart = startOfMonth(now);
  const thisMonthEnd = endOfMonth(now);
  const lastMonthStart = startOfMonth(subMonths(now, 1));
  const lastMonthEnd = endOfMonth(subMonths(now, 1));

  const [
    thisMonthRevenue,
    lastMonthRevenue,
    pendingCount,
    currentBoarders,
    newClientsThisMonth,
    totalClients,
    capacitySetting,
  ] = await Promise.all([
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
        status: { in: ['CONFIRMED', 'IN_PROGRESS'] },
        startDate: { lte: now },
        endDate: { gte: now },
      },
    }),
    prisma.user.count({
      where: { role: 'CLIENT', createdAt: { gte: thisMonthStart, lte: thisMonthEnd } },
    }),
    prisma.user.count({ where: { role: 'CLIENT' } }),
    prisma.setting.findUnique({ where: { key: 'max_capacity' } }),
  ]);

  const thisMonthAmt = thisMonthRevenue._sum.amount ?? 0;
  const lastMonthAmt = lastMonthRevenue._sum.amount ?? 0;
  const monthVariation =
    lastMonthAmt > 0 ? Math.round(((thisMonthAmt - lastMonthAmt) / lastMonthAmt) * 1000) / 10 : 0;
  const maxCapacity = parseInt(capacitySetting?.value ?? '10');

  // ── Revenue breakdown all-time (via InvoiceItem) ──────────────────────────
  const [boardingTotal, taxiTotal, groomingTotal] = await Promise.all([
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

  // ── Period analytics (avg basket) ────────────────────────────────────────
  const periodStart = subMonths(now, periodMonths);
  const [periodRevenue, periodInvoices] = await Promise.all([
    prisma.invoice.aggregate({
      where: { status: 'PAID', paidAt: { gte: periodStart } },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.invoice.findMany({
      where: { status: 'PAID', paidAt: { gte: periodStart } },
      select: { clientId: true },
    }),
  ]);

  const uniqueClients = new Set(periodInvoices.map(i => i.clientId)).size;
  const avgBasket = uniqueClients > 0 ? Math.round((periodRevenue._sum.amount ?? 0) / uniqueClients) : 0;

  // ── Client segmentation ───────────────────────────────────────────────────
  const threeMonthsAgo = subMonths(now, 3);
  const sixMonthsAgo = subMonths(now, 6);
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

  // ── Avg stay duration ─────────────────────────────────────────────────────
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
    monthlyRevenue: thisMonthAmt,
    lastMonthRevenue: lastMonthAmt,
    monthVariation,
    currentBoarders,
    maxCapacity,
    pendingReservations: pendingCount,
    newClientsThisMonth,
    totalClients,
    yearlyData,
    revenueBreakdown: {
      boarding: boardingTotal._sum.total ?? 0,
      taxi: taxiTotal._sum.total ?? 0,
      grooming: groomingTotal._sum.total ?? 0,
    },
    periodRevenue: periodRevenue._sum.amount ?? 0,
    avgBasket,
    avgStayDuration: Math.round(avgNights * 10) / 10,
    clientSegmentation: {
      active: activeClients,
      semiActive: semiActiveCount,
      inactive: inactiveCount,
    },
  });
}
