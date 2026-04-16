import { NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { prisma } from '@/lib/prisma';
import { startOfMonth, endOfMonth, subMonths } from 'date-fns';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const now = new Date();
  const { searchParams } = new URL(request.url);
  const rawMonths = parseInt(searchParams.get('months') ?? '1');
  const periodMonths = isNaN(rawMonths) ? 1 : Math.min(Math.max(rawMonths, 1), 24);

  // ── Current year chart (dynamic — never hardcoded) ────────────────────────
  const currentYear = now.getFullYear();
  const startCurrentYear = new Date(`${currentYear}-01-01T00:00:00.000Z`);
  const endCurrentYear = new Date(`${currentYear}-12-31T23:59:59.999Z`);

  // Yearly chart — payments on paid invoices, split by InvoiceItem allocatedAmount
  const paymentsCurrentYear = await prisma.payment.findMany({
    where: {
      paymentDate: { gte: startCurrentYear, lte: endCurrentYear },
      invoice: { status: { in: ['PAID', 'PARTIALLY_PAID'] } },
    },
    select: {
      amount: true,
      paymentDate: true,
      invoice: {
        select: {
          items: {
            select: {
              category: true,
              allocatedAmount: true,
              total: true,
            },
          },
        },
      },
    },
  });

  const monthly: Record<number, { boarding: number; grooming: number; taxi: number; croquettes: number }> = {};
  for (let m = 0; m < 12; m++) monthly[m] = { boarding: 0, grooming: 0, taxi: 0, croquettes: 0 };

  for (const pmt of paymentsCurrentYear) {
    const m = new Date(pmt.paymentDate).getMonth();
    const items = pmt.invoice.items;
    const base = items.reduce((s, i) => s + (i.allocatedAmount || i.total), 0);
    if (base === 0) continue;
    for (const item of items) {
      const ratio = (item.allocatedAmount || item.total) / base;
      const amt = pmt.amount * ratio;
      if      (item.category === 'BOARDING') monthly[m].boarding   += amt;
      else if (item.category === 'PET_TAXI') monthly[m].taxi        += amt;
      else if (item.category === 'GROOMING') monthly[m].grooming    += amt;
      else if (item.category === 'PRODUCT')  monthly[m].croquettes  += amt;
      // OTHER ignoré dans le graphe
    }
  }

  const frMonths = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const yearSuffix = String(currentYear).slice(2);
  const yearlyData = Array.from({ length: 12 }, (_, i) => ({
    month: `${frMonths[i]} ${yearSuffix}`,
    monthDate: new Date(currentYear, i, 1).toISOString(),
    boarding: monthly[i].boarding,
    grooming: monthly[i].grooming,
    taxi: monthly[i].taxi,
    croquettes: monthly[i].croquettes,
    total: monthly[i].boarding + monthly[i].grooming + monthly[i].taxi + monthly[i].croquettes,
  }));

  // ── Current month stats ───────────────────────────────────────────────────
  const thisMonthStart = startOfMonth(now);
  const thisMonthEnd = endOfMonth(now);
  const lastMonthStart = startOfMonth(subMonths(now, 1));
  const lastMonthEnd = endOfMonth(subMonths(now, 1));

  const boardingNow = {
    serviceType: 'BOARDING' as const,
    status: 'IN_PROGRESS' as const,
    startDate: { lte: now },
    endDate: { gte: now },
  };

  const [
    thisMonthRevenue,
    lastMonthRevenue,
    pendingCount,
    currentCatBoarders,
    currentDogBoarders,
    newClientsThisMonth,
    totalClients,
  ] = await Promise.all([
    prisma.payment.aggregate({
      where: {
        paymentDate: { gte: thisMonthStart, lte: thisMonthEnd },
        invoice: { status: { in: ['PAID', 'PARTIALLY_PAID'] } },
      },
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({
      where: {
        paymentDate: { gte: lastMonthStart, lte: lastMonthEnd },
        invoice: { status: { in: ['PAID', 'PARTIALLY_PAID'] } },
      },
      _sum: { amount: true },
    }),
    prisma.booking.count({ where: { status: 'PENDING' } }),
    prisma.bookingPet.count({ where: { pet: { species: 'CAT' }, booking: boardingNow } }),
    prisma.bookingPet.count({ where: { pet: { species: 'DOG' }, booking: boardingNow } }),
    prisma.user.count({
      where: { role: 'CLIENT', createdAt: { gte: thisMonthStart, lte: thisMonthEnd } },
    }),
    prisma.user.count({ where: { role: 'CLIENT' } }),
  ]);

  const thisMonthAmt = thisMonthRevenue._sum.amount ?? 0;
  const lastMonthAmt = lastMonthRevenue._sum.amount ?? 0;
  const monthVariation =
    lastMonthAmt > 0 ? Math.round(((thisMonthAmt - lastMonthAmt) / lastMonthAmt) * 1000) / 10 : 0;
  const currentBoarders = currentCatBoarders + currentDogBoarders;
  const maxCapacity = 60; // cats: 10, dogs: 50

  // ── Revenue breakdown all-time — only PAID/PARTIALLY_PAID invoices ────────
  const [boardingTotal, taxiTotal, groomingTotal] = await Promise.all([
    prisma.invoiceItem.aggregate({
      where: {
        category: 'BOARDING',
        invoice: { status: { in: ['PAID', 'PARTIALLY_PAID'] } },
      },
      _sum: { allocatedAmount: true },
    }),
    prisma.invoiceItem.aggregate({
      where: {
        category: 'PET_TAXI',
        invoice: { status: { in: ['PAID', 'PARTIALLY_PAID'] } },
      },
      _sum: { allocatedAmount: true },
    }),
    prisma.invoiceItem.aggregate({
      where: {
        category: 'GROOMING',
        invoice: { status: { in: ['PAID', 'PARTIALLY_PAID'] } },
      },
      _sum: { allocatedAmount: true },
    }),
  ]);

  // ── Period analytics (avg basket) ────────────────────────────────────────
  const periodStart = subMonths(now, periodMonths);
  const [periodRevenue, periodPayments] = await Promise.all([
    prisma.payment.aggregate({
      where: {
        paymentDate: { gte: periodStart },
        invoice: { status: { in: ['PAID', 'PARTIALLY_PAID'] } },
      },
      _sum: { amount: true },
    }),
    prisma.payment.findMany({
      where: {
        paymentDate: { gte: periodStart },
        invoice: { status: { in: ['PAID', 'PARTIALLY_PAID'] } },
      },
      select: { invoice: { select: { clientId: true } } },
    }),
  ]);

  const uniqueClients = new Set(periodPayments.map(p => p.invoice.clientId)).size;
  const totalPeriodRevenue = periodRevenue._sum.amount ?? 0;
  const avgBasket = uniqueClients > 0 ? Math.round(totalPeriodRevenue / uniqueClients) : 0;

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
    currentCatBoarders,
    currentDogBoarders,
    catCapacity: 10,
    dogCapacity: 50,
    maxCapacity,
    pendingReservations: pendingCount,
    newClientsThisMonth,
    totalClients,
    yearlyData,
    revenueBreakdown: {
      boarding: boardingTotal._sum.allocatedAmount ?? 0,
      taxi: taxiTotal._sum.allocatedAmount ?? 0,
      grooming: groomingTotal._sum.allocatedAmount ?? 0,
    },
    periodRevenue: totalPeriodRevenue,
    avgBasket,
    avgStayDuration: Math.round(avgNights * 10) / 10,
    clientSegmentation: {
      active: activeClients,
      semiActive: semiActiveCount,
      inactive: inactiveCount,
    },
  });
}
