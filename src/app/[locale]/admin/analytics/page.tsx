import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { startOfMonth, endOfMonth, subMonths } from 'date-fns';
import AnalyticsCharts from './AnalyticsCharts';

interface PageProps { params: { locale: string } }

// ── Shared types ────────────────────────────────────────────────────────────

type PaymentWithDetails = {
  amount: number;
  paymentDate: Date;
  invoice: {
    serviceType: string | null;
    booking: {
      serviceType: string;
      boardingDetail: { groomingPrice: number } | null;
    } | null;
    items: { description: string; allocatedAmount: number }[];
  };
};

type MonthlySummary = {
  month: number;
  boardingRevenue: number;
  groomingRevenue: number;
  taxiRevenue: number;
  otherRevenue: number;
};

type MonthlyBreakdown = { boarding: number; grooming: number; taxi: number; croquettes: number };

// ── Helper: classify a payment into a service category ──────────────────────
function getServiceType(
  bookingServiceType: string | null | undefined,
  itemDescriptions: string[],
): 'BOARDING' | 'PET_TAXI' | 'GROOMING' | 'PRODUCT' | 'OTHER' {
  if (bookingServiceType === 'BOARDING')     return 'BOARDING';
  if (bookingServiceType === 'PET_TAXI')     return 'PET_TAXI';
  if (bookingServiceType === 'GROOMING')     return 'GROOMING';
  if (bookingServiceType === 'PRODUCT_SALE') return 'PRODUCT';
  // Fallback: keyword match on item descriptions
  const desc = itemDescriptions.map(d => d.toLowerCase()).join(' ');
  if (/croquett|kibble/.test(desc))                  return 'PRODUCT';
  if (/pension|nuit|chat|chien|boarding/.test(desc)) return 'BOARDING';
  if (/transport|taxi|animalier/.test(desc))         return 'PET_TAXI';
  if (/toilettage|bain|coupe|grooming/.test(desc))   return 'GROOMING';
  return 'OTHER';
}

// ── Helper: build per-month per-service breakdown from payments + summaries ──
function buildMonthly(
  payments: PaymentWithDetails[],
  summaries: MonthlySummary[],
): Record<number, MonthlyBreakdown> {
  const monthly: Record<number, MonthlyBreakdown> = {};
  for (let m = 0; m < 12; m++) monthly[m] = { boarding: 0, grooming: 0, taxi: 0, croquettes: 0 };

  for (const pmt of payments) {
    const m = new Date(pmt.paymentDate).getMonth();
    const svcType = pmt.invoice.booking?.serviceType ?? pmt.invoice.serviceType;
    if (svcType === 'PRODUCT_SALE') {
      monthly[m].croquettes += pmt.amount;
    } else if (svcType === 'PET_TAXI') {
      monthly[m].taxi += pmt.amount;
    } else if (svcType === 'BOARDING') {
      const items = pmt.invoice.items;
      const totalAllocated = items.reduce((s, i) => s + i.allocatedAmount, 0);
      if (totalAllocated > 0) {
        for (const item of items) {
          const ratio = item.allocatedAmount / totalAllocated;
          const itemAmt = pmt.amount * ratio;
          if (item.description.includes('Taxi')) monthly[m].taxi += itemAmt;
          else if (item.description.includes('Toilettage')) monthly[m].grooming += itemAmt;
          else monthly[m].boarding += itemAmt;
        }
      } else {
        const g = Math.min(pmt.invoice.booking?.boardingDetail?.groomingPrice ?? 0, pmt.amount);
        monthly[m].grooming += g;
        monthly[m].boarding += pmt.amount - g;
      }
    }
  }

  for (const s of summaries) {
    const m = s.month - 1;
    monthly[m].boarding += s.boardingRevenue;
    monthly[m].grooming += s.groomingRevenue;
    monthly[m].taxi += s.taxiRevenue;
    monthly[m].croquettes += s.otherRevenue;
  }

  return monthly;
}

export default async function AdminAnalyticsPage({ params: { locale } }: PageProps) {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN'))
    redirect(`/${locale}/auth/login`);

  const now = new Date();
  const currentYear = now.getFullYear();
  const lastYear = currentYear - 1;
  const thisMonthStart = startOfMonth(now);
  const thisMonthEnd = endOfMonth(now);
  const lastMonthStart = startOfMonth(subMonths(now, 1));
  const lastMonthEnd = endOfMonth(subMonths(now, 1));
  const thisM = now.getMonth(); // 0-indexed

  const startCurrentYear = new Date(`${currentYear}-01-01T00:00:00.000Z`);
  const endCurrentYear = new Date(`${currentYear}-12-31T23:59:59.999Z`);
  const startLastYear = new Date(`${lastYear}-01-01T00:00:00.000Z`);
  const endLastYear = new Date(`${lastYear}-12-31T23:59:59.999Z`);

  const emptySummaries: MonthlySummary[] = [];

  const [
    paymentsCurrentYear,
    thisMonthRevenue,
    lastMonthRevenue,
    newClientsThisMonth,
    completedBoardings,
    // CA par service + clients uniques ce mois
    thisMonthPaymentsByService,
    // CA par service mois précédent (pour delta KPI)
    lastMonthPaymentsByService,
    // Volume mensuel : booking.groupBy
    volumeGroupBy,
    historicalSummaries,
    thisMonthHistorical,
    lastMonthHistorical,
    paymentsLastYear,
    historicalSummariesLastYear,
  ] = await Promise.all([
    // Yearly chart — attributed by payment date
    prisma.payment.findMany({
      where: {
        paymentDate: { gte: startCurrentYear, lte: endCurrentYear },
        invoice: { status: { in: ['PAID', 'PARTIALLY_PAID'] } },
      },
      select: {
        amount: true,
        paymentDate: true,
        invoice: {
          select: {
            serviceType: true,
            booking: { select: { serviceType: true, boardingDetail: { select: { groomingPrice: true } } } },
            items: { select: { description: true, allocatedAmount: true } },
          },
        },
      },
    }) as Promise<PaymentWithDetails[]>,

    // CA mensuel courant
    prisma.payment.aggregate({
      where: {
        paymentDate: { gte: thisMonthStart, lte: thisMonthEnd },
        invoice: { status: { in: ['PAID', 'PARTIALLY_PAID'] } },
      },
      _sum: { amount: true },
    }),

    // CA mois précédent
    prisma.payment.aggregate({
      where: {
        paymentDate: { gte: lastMonthStart, lte: lastMonthEnd },
        invoice: { status: { in: ['PAID', 'PARTIALLY_PAID'] } },
      },
      _sum: { amount: true },
    }),

    // Nouveaux clients — filtre passage@
    prisma.user.count({
      where: {
        role: 'CLIENT',
        email: { not: 'passage@doguniverse.ma' },
        createdAt: { gte: thisMonthStart, lte: thisMonthEnd },
      },
    }),

    // Durée moy. séjour — ce mois uniquement
    prisma.booking.findMany({
      where: {
        serviceType: 'BOARDING',
        status: { not: 'CANCELLED' },
        startDate: { gte: thisMonthStart, lte: thisMonthEnd },
      },
      select: { startDate: true, endDate: true },
    }),

    // CA par service + clients uniques ce mois (remplace thisMonthPaymentsForBasket)
    prisma.payment.findMany({
      where: {
        paymentDate: { gte: thisMonthStart, lte: thisMonthEnd },
        invoice: { status: { in: ['PAID', 'PARTIALLY_PAID'] } },
      },
      select: {
        amount: true,
        invoice: {
          select: {
            clientId: true,
            booking: { select: { serviceType: true } },
            items: { select: { description: true } },
          },
        },
      },
    }),

    // CA par service mois précédent (pour delta)
    prisma.payment.findMany({
      where: {
        paymentDate: { gte: lastMonthStart, lte: lastMonthEnd },
        invoice: { status: { in: ['PAID', 'PARTIALLY_PAID'] } },
      },
      select: {
        amount: true,
        invoice: {
          select: {
            booking: { select: { serviceType: true } },
            items: { select: { description: true } },
          },
        },
      },
    }),

    // Volume mensuel : booking.groupBy (1 query au lieu de 4)
    prisma.booking.groupBy({
      by: ['serviceType'],
      where: {
        status: { not: 'CANCELLED' },
        startDate: { gte: thisMonthStart, lte: thisMonthEnd },
      },
      _count: { id: true },
    }),

    // Historical summaries — année courante (mois <= mois courant)
    prisma.monthlyRevenueSummary.findMany({
      where: { year: currentYear, month: { lte: thisM + 1 } },
      select: { month: true, boardingRevenue: true, groomingRevenue: true, taxiRevenue: true, otherRevenue: true },
    }).catch(() => emptySummaries),

    // CA historique mois courant
    prisma.monthlyRevenueSummary.findFirst({
      where: { year: thisMonthStart.getFullYear(), month: thisMonthStart.getMonth() + 1 },
      select: { boardingRevenue: true, groomingRevenue: true, taxiRevenue: true, otherRevenue: true },
    }).catch(() => null),

    // CA historique mois précédent
    prisma.monthlyRevenueSummary.findFirst({
      where: { year: lastMonthStart.getFullYear(), month: lastMonthStart.getMonth() + 1 },
      select: { boardingRevenue: true, groomingRevenue: true, taxiRevenue: true, otherRevenue: true },
    }).catch(() => null),

    // Paiements année précédente (courbe comparaison)
    prisma.payment.findMany({
      where: {
        paymentDate: { gte: startLastYear, lte: endLastYear },
        invoice: { status: { in: ['PAID', 'PARTIALLY_PAID'] } },
      },
      select: {
        amount: true,
        paymentDate: true,
        invoice: {
          select: {
            serviceType: true,
            booking: { select: { serviceType: true, boardingDetail: { select: { groomingPrice: true } } } },
            items: { select: { description: true, allocatedAmount: true } },
          },
        },
      },
    }) as Promise<PaymentWithDetails[]>,

    // Historical summaries — année précédente
    prisma.monthlyRevenueSummary.findMany({
      where: { year: lastYear },
      select: { month: true, boardingRevenue: true, groomingRevenue: true, taxiRevenue: true, otherRevenue: true },
    }).catch(() => emptySummaries),
  ]);

  // ── Build monthly breakdowns ──────────────────────────────────────────────
  const monthly = buildMonthly(paymentsCurrentYear, historicalSummaries);
  const monthlyLastYear = buildMonthly(paymentsLastYear, historicalSummariesLastYear);

  // ── CA KPI total (paiements réels + historique) ───────────────────────────
  const thisHistAmt = thisMonthHistorical
    ? thisMonthHistorical.boardingRevenue + thisMonthHistorical.groomingRevenue + thisMonthHistorical.taxiRevenue + thisMonthHistorical.otherRevenue
    : 0;
  const lastHistAmt = lastMonthHistorical
    ? lastMonthHistorical.boardingRevenue + lastMonthHistorical.groomingRevenue + lastMonthHistorical.taxiRevenue + lastMonthHistorical.otherRevenue
    : 0;
  const thisAmt = (thisMonthRevenue._sum.amount ?? 0) + thisHistAmt;
  const lastAmt = (lastMonthRevenue._sum.amount ?? 0) + lastHistAmt;
  const delta = lastAmt === 0
    ? (thisAmt > 0 ? 100 : 0)
    : Math.round(((thisAmt - lastAmt) / lastAmt) * 1000) / 10;

  // ── Répartition CA par service (getServiceType) ───────────────────────────
  const byServiceThis = { BOARDING: 0, PET_TAXI: 0, GROOMING: 0, PRODUCT: 0, OTHER: 0 };
  for (const p of thisMonthPaymentsByService) {
    const svcType = getServiceType(
      p.invoice.booking?.serviceType,
      p.invoice.items.map(i => i.description),
    );
    byServiceThis[svcType] += p.amount;
  }

  const byServiceLast = { BOARDING: 0, PET_TAXI: 0, GROOMING: 0, PRODUCT: 0, OTHER: 0 };
  for (const p of lastMonthPaymentsByService) {
    const svcType = getServiceType(
      p.invoice.booking?.serviceType,
      p.invoice.items.map(i => i.description),
    );
    byServiceLast[svcType] += p.amount;
  }

  // ── KPI par service ───────────────────────────────────────────────────────
  function svcDelta(thisV: number, lastV: number) {
    return lastV === 0
      ? (thisV > 0 ? 100 : 0)
      : Math.round(((thisV - lastV) / lastV) * 1000) / 10;
  }

  const serviceKpis = {
    boarding: {
      thisAmt: byServiceThis.BOARDING,
      lastAmt: byServiceLast.BOARDING,
      delta: svcDelta(byServiceThis.BOARDING, byServiceLast.BOARDING),
      count: volumeGroupBy.find(r => r.serviceType === 'BOARDING')?._count.id ?? 0,
    },
    taxi: {
      thisAmt: byServiceThis.PET_TAXI,
      lastAmt: byServiceLast.PET_TAXI,
      delta: svcDelta(byServiceThis.PET_TAXI, byServiceLast.PET_TAXI),
      count: volumeGroupBy.find(r => r.serviceType === 'PET_TAXI')?._count.id ?? 0,
    },
    grooming: {
      thisAmt: byServiceThis.GROOMING,
      lastAmt: byServiceLast.GROOMING,
      delta: svcDelta(byServiceThis.GROOMING, byServiceLast.GROOMING),
      count: volumeGroupBy.find(r => r.serviceType === 'GROOMING')?._count.id ?? 0,
    },
    croquettes: {
      thisAmt: byServiceThis.PRODUCT,
      lastAmt: byServiceLast.PRODUCT,
      delta: svcDelta(byServiceThis.PRODUCT, byServiceLast.PRODUCT),
      count: 0,
    },
  };

  // ── Panier moyen ──────────────────────────────────────────────────────────
  const uniqueClients = new Set(thisMonthPaymentsByService.map(p => p.invoice.clientId)).size;
  const avgBasket = uniqueClients > 0 ? Math.round(thisAmt / uniqueClients) : 0;

  // ── Durée moy. séjour (entier) ────────────────────────────────────────────
  const avgNights = completedBoardings.length > 0
    ? Math.round(
        completedBoardings.reduce((sum, b) => {
          if (!b.endDate) return sum;
          return sum + Math.max(0, (b.endDate.getTime() - b.startDate.getTime()) / 86400000);
        }, 0) / completedBoardings.length,
      )
    : 0;

  // ── Volume mensuel ────────────────────────────────────────────────────────
  const volumeData = {
    boarding:   volumeGroupBy.find(r => r.serviceType === 'BOARDING')?._count.id ?? 0,
    taxi:       volumeGroupBy.find(r => r.serviceType === 'PET_TAXI')?._count.id ?? 0,
    grooming:   volumeGroupBy.find(r => r.serviceType === 'GROOMING')?._count.id ?? 0,
    croquettes: 0,
  };

  // ── Yearly chart : seulement les mois jusqu'au mois courant ───────────────
  const frMonths = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const yearSuffix = String(currentYear).slice(2);

  const yearlyData = Array.from({ length: thisM + 1 }, (_, i) => ({
    month: `${frMonths[i]} ${yearSuffix}`,
    boarding: monthly[i].boarding,
    grooming: monthly[i].grooming,
    taxi: monthly[i].taxi,
    croquettes: monthly[i].croquettes,
    total: monthly[i].boarding + monthly[i].grooming + monthly[i].taxi + monthly[i].croquettes,
  }));

  const lastYearData = Array.from({ length: thisM + 1 }, (_, i) => ({
    month: frMonths[i],
    total: monthlyLastYear[i].boarding + monthlyLastYear[i].grooming + monthlyLastYear[i].taxi + monthlyLastYear[i].croquettes,
  }));

  const monthName = now.toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', { month: 'long', year: 'numeric' });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-serif font-bold text-charcoal">
          {locale === 'en' ? 'Analytics' : 'Analytiques'}
        </h1>
        <p className="text-sm text-charcoal/50 mt-0.5 capitalize">
          {locale === 'en' ? 'Overview' : 'Vue d\'ensemble'} — {monthName}
        </p>
      </div>

      <AnalyticsCharts
        serviceKpis={serviceKpis}
        yearlyData={yearlyData}
        lastYearData={lastYearData}
        donutData={byServiceThis}
        volumeData={volumeData}
        avgBasket={avgBasket}
        avgNights={avgNights}
        newClients={newClientsThisMonth}
        totalCA={thisAmt}
        totalDelta={delta}
        locale={locale}
        currentYear={currentYear}
      />
    </div>
  );
}
