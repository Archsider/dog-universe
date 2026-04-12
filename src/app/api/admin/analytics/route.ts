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
  const periodMonths = parseInt(searchParams.get('months') ?? '1');

  // ── Current year chart (dynamic — never hardcoded) ────────────────────────
  const currentYear = now.getFullYear();
  const startCurrentYear = new Date(`${currentYear}-01-01T00:00:00.000Z`);
  const endCurrentYear = new Date(`${currentYear}-12-31T23:59:59.999Z`);

  // Fetch both fully paid invoices and individual payments for partially paid ones
  const [invoices2026Paid, payments2026Partial] = await Promise.all([
    prisma.invoice.findMany({
      where: { status: 'PAID', paidAt: { gte: startCurrentYear, lte: endCurrentYear } },
      select: {
        amount: true,
        paidAt: true,
        serviceType: true,
        booking: {
          select: {
            serviceType: true,
            boardingDetail: { select: { groomingPrice: true } },
          },
        },
      },
    }),
    // Each Payment row for PARTIALLY_PAID invoices, attributed by its own paymentDate
    prisma.payment.findMany({
      where: {
        paymentDate: { gte: startCurrentYear, lte: endCurrentYear },
        invoice: { status: 'PARTIALLY_PAID' },
      },
      select: {
        amount: true,
        paymentDate: true,
        invoice: {
          select: {
            serviceType: true,
            paidAmount: true,
            booking: {
              select: {
                serviceType: true,
                boardingDetail: { select: { groomingPrice: true } },
              },
            },
          },
        },
      },
    }),
  ]);

  const monthly: Record<number, { boarding: number; grooming: number; taxi: number; croquettes: number }> = {};
  for (let m = 0; m < 12; m++) monthly[m] = { boarding: 0, grooming: 0, taxi: 0, croquettes: 0 };

  for (const inv of invoices2026Paid) {
    if (!inv.paidAt) continue;
    const m = new Date(inv.paidAt).getMonth();
    // Supplementary invoices have bookingId=null — use the invoice's own serviceType as fallback
    const svcType = inv.booking?.serviceType ?? inv.serviceType;
    if (svcType === 'PET_TAXI') {
      monthly[m].taxi += inv.amount;
    } else if (svcType === 'BOARDING') {
      // Grooming split only applies to the original booking invoice (supplementary = nights only)
      const g = inv.booking?.boardingDetail?.groomingPrice ?? 0;
      monthly[m].grooming += g;
      monthly[m].boarding += inv.amount - g;
    }
  }

  // Include each payment from PARTIALLY_PAID invoices, attributed by payment date
  for (const pmt of payments2026Partial) {
    const m = new Date(pmt.paymentDate).getMonth();
    const svcType = pmt.invoice.booking?.serviceType ?? pmt.invoice.serviceType;
    if (svcType === 'PET_TAXI') {
      monthly[m].taxi += pmt.amount;
    } else if (svcType === 'BOARDING') {
      const g = Math.min(pmt.invoice.booking?.boardingDetail?.groomingPrice ?? 0, pmt.amount);
      monthly[m].grooming += g;
      monthly[m].boarding += pmt.amount - g;
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
    // CA = SUM(Payment.amount) on non-cancelled invoices, attributed by payment date
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
  const [periodRevenuePaid, periodRevenuePartial, periodInvoicesPaid, periodInvoicesPartial] = await Promise.all([
    prisma.invoice.aggregate({
      where: { status: 'PAID', paidAt: { gte: periodStart } },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.payment.aggregate({
      where: { paymentDate: { gte: periodStart }, invoice: { status: 'PARTIALLY_PAID' } },
      _sum: { amount: true },
    }),
    prisma.invoice.findMany({
      where: { status: 'PAID', paidAt: { gte: periodStart } },
      select: { clientId: true },
    }),
    prisma.payment.findMany({
      where: { paymentDate: { gte: periodStart }, invoice: { status: 'PARTIALLY_PAID' } },
      select: { invoice: { select: { clientId: true } } },
    }),
  ]);

  const allPeriodClients = [
    ...periodInvoicesPaid.map(i => i.clientId),
    ...periodInvoicesPartial.map(p => p.invoice.clientId),
  ];
  const uniqueClients = new Set(allPeriodClients).size;
  const totalPeriodRevenue =
    (periodRevenuePaid._sum.amount ?? 0) + (periodRevenuePartial._sum.amount ?? 0);
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
      boarding: boardingTotal._sum.total ?? 0,
      taxi: taxiTotal._sum.total ?? 0,
      grooming: groomingTotal._sum.total ?? 0,
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
