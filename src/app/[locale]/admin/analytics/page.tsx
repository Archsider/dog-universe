import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { startOfMonth, endOfMonth, subMonths } from 'date-fns';
import AnalyticsCharts from './AnalyticsCharts';

interface PageProps { params: { locale: string } }

// ── Types ────────────────────────────────────────────────────────────────────

type MonthlySummary = {
  month: number;
  boardingRevenue: number;
  groomingRevenue: number;
  taxiRevenue: number;
  otherRevenue: number;
};

type MonthlyBreakdown = { boarding: number; grooming: number; taxi: number; croquettes: number };

// ── Catégorisation par description d'InvoiceItem (même logique que dashboard) ─
// Priorité : taxi > croquettes > toilettage > pension > OTHER
function categoriseItem(description: string): 'BOARDING' | 'PET_TAXI' | 'GROOMING' | 'PRODUCT' | 'OTHER' {
  const desc = description.toLowerCase();
  if (/transport|taxi|animalier/.test(desc))                       return 'PET_TAXI';
  if (/croquett|kibble/.test(desc))                                return 'PRODUCT';
  if (/toilettage|bain|coupe|grooming/.test(desc))                 return 'GROOMING';
  if (/pension|nuit|s[eé]jour|chat|chien|boarding/.test(desc))     return 'BOARDING';
  return 'OTHER';
}

// ── Construction du breakdown mensuel via item.allocatedAmount ───────────────
// Source unique : Payment.paymentDate + InvoiceItem.allocatedAmount
// Même approche que dashboard/page.tsx → chiffres identiques garantis
function buildMonthly(
  payments: { paymentDate: Date; invoice: { items: { description: string; allocatedAmount: number }[] } }[],
  summaries: MonthlySummary[],
): Record<number, MonthlyBreakdown> {
  const monthly: Record<number, MonthlyBreakdown> = {};
  for (let m = 0; m < 12; m++) monthly[m] = { boarding: 0, grooming: 0, taxi: 0, croquettes: 0 };

  for (const pmt of payments) {
    const m = new Date(pmt.paymentDate).getMonth();
    for (const item of pmt.invoice.items) {
      const cat = categoriseItem(item.description);
      const amt = item.allocatedAmount;
      if      (cat === 'BOARDING' || cat === 'OTHER') monthly[m].boarding   += amt;
      else if (cat === 'PET_TAXI')                    monthly[m].taxi       += amt;
      else if (cat === 'GROOMING')                    monthly[m].grooming   += amt;
      else if (cat === 'PRODUCT')                     monthly[m].croquettes += amt;
    }
  }

  for (const s of summaries) {
    const m = s.month - 1;
    monthly[m].boarding   += s.boardingRevenue;
    monthly[m].grooming   += s.groomingRevenue;
    monthly[m].taxi       += s.taxiRevenue;
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

  const startCurrentYear = new Date(currentYear, 0, 1);
  const endCurrentYear   = new Date(currentYear, 11, 31, 23, 59, 59, 999);
  const startLastYear    = new Date(lastYear, 0, 1);
  const endLastYear      = new Date(lastYear, 11, 31, 23, 59, 59, 999);

  const emptySummaries: MonthlySummary[] = [];

  const [
    // ── Graphe annuel ────────────────────────────────────────────────────────
    paymentsCurrentYear,
    paymentsLastYear,
    historicalSummaries,
    historicalSummariesLastYear,

    // ── KPI totaux CA (agrégat rapide) ───────────────────────────────────────
    thisMonthRevenue,
    lastMonthRevenue,
    thisMonthHistorical,
    lastMonthHistorical,

    // ── Répartition CA par service ce mois (item-level allocation) ───────────
    thisMonthItems,
    lastMonthItems,

    // ── Métriques secondaires ────────────────────────────────────────────────
    newClientsThisMonth,
    completedBoardings,
    volumeGroupBy,
  ] = await Promise.all([

    // Paiements année courante — items avec allocatedAmount (graphe annuel)
    prisma.payment.findMany({
      where: {
        paymentDate: { gte: startCurrentYear, lte: endCurrentYear },
        invoice: { status: { in: ['PAID', 'PARTIALLY_PAID'] } },
      },
      select: {
        paymentDate: true,
        invoice: {
          select: {
            items: { select: { description: true, allocatedAmount: true } },
          },
        },
      },
    }),

    // Paiements année précédente (courbe comparaison)
    prisma.payment.findMany({
      where: {
        paymentDate: { gte: startLastYear, lte: endLastYear },
        invoice: { status: { in: ['PAID', 'PARTIALLY_PAID'] } },
      },
      select: {
        paymentDate: true,
        invoice: {
          select: {
            items: { select: { description: true, allocatedAmount: true } },
          },
        },
      },
    }),

    // Historical summaries — année courante (mois ≤ mois courant uniquement)
    prisma.monthlyRevenueSummary.findMany({
      where: { year: currentYear, month: { lte: thisM + 1 } },
      select: { month: true, boardingRevenue: true, groomingRevenue: true, taxiRevenue: true, otherRevenue: true },
    }).catch(() => emptySummaries),

    // Historical summaries — année précédente
    prisma.monthlyRevenueSummary.findMany({
      where: { year: lastYear },
      select: { month: true, boardingRevenue: true, groomingRevenue: true, taxiRevenue: true, otherRevenue: true },
    }).catch(() => emptySummaries),

    // CA mensuel courant (agrégat Payment)
    prisma.payment.aggregate({
      where: {
        paymentDate: { gte: thisMonthStart, lte: thisMonthEnd },
        invoice: { status: { in: ['PAID', 'PARTIALLY_PAID'] } },
      },
      _sum: { amount: true },
    }),

    // CA mois précédent (agrégat Payment)
    prisma.payment.aggregate({
      where: {
        paymentDate: { gte: lastMonthStart, lte: lastMonthEnd },
        invoice: { status: { in: ['PAID', 'PARTIALLY_PAID'] } },
      },
      _sum: { amount: true },
    }),

    // CA historique mois courant (MonthlyRevenueSummary)
    prisma.monthlyRevenueSummary.findFirst({
      where: { year: thisMonthStart.getFullYear(), month: thisMonthStart.getMonth() + 1 },
      select: { boardingRevenue: true, groomingRevenue: true, taxiRevenue: true, otherRevenue: true },
    }).catch(() => null),

    // CA historique mois précédent (MonthlyRevenueSummary)
    prisma.monthlyRevenueSummary.findFirst({
      where: { year: lastMonthStart.getFullYear(), month: lastMonthStart.getMonth() + 1 },
      select: { boardingRevenue: true, groomingRevenue: true, taxiRevenue: true, otherRevenue: true },
    }).catch(() => null),

    // Items ce mois avec allocatedAmount — source de vérité répartition services
    prisma.payment.findMany({
      where: {
        paymentDate: { gte: thisMonthStart, lte: thisMonthEnd },
        invoice: { status: { in: ['PAID', 'PARTIALLY_PAID'] } },
      },
      select: {
        invoice: {
          select: {
            clientId: true,
            items: { select: { description: true, allocatedAmount: true } },
          },
        },
      },
    }),

    // Items mois précédent (pour deltas KPI services)
    prisma.payment.findMany({
      where: {
        paymentDate: { gte: lastMonthStart, lte: lastMonthEnd },
        invoice: { status: { in: ['PAID', 'PARTIALLY_PAID'] } },
      },
      select: {
        invoice: {
          select: {
            items: { select: { description: true, allocatedAmount: true } },
          },
        },
      },
    }),

    // Nouveaux clients ce mois (hors compte de passage)
    prisma.user.count({
      where: {
        role: 'CLIENT',
        email: { not: 'passage@doguniverse.ma' },
        createdAt: { gte: thisMonthStart, lte: thisMonthEnd },
      },
    }),

    // Durée moy. séjour — bookings BOARDING commencés ce mois, non annulés
    prisma.booking.findMany({
      where: {
        serviceType: 'BOARDING',
        status: { not: 'CANCELLED' },
        startDate: { gte: thisMonthStart, lte: thisMonthEnd },
      },
      select: { startDate: true, endDate: true },
    }),

    // Volume mensuel par type de service
    prisma.booking.groupBy({
      by: ['serviceType'],
      where: {
        status: { not: 'CANCELLED' },
        startDate: { gte: thisMonthStart, lte: thisMonthEnd },
      },
      _count: { id: true },
    }),
  ]);

  // ── Build monthly breakdowns (item-based, mirrors dashboard) ─────────────
  const monthly         = buildMonthly(paymentsCurrentYear,  historicalSummaries);
  const monthlyLastYear = buildMonthly(paymentsLastYear,     historicalSummariesLastYear);

  // ── CA total KPI (paiements réels + historique) ───────────────────────────
  const thisHistAmt = thisMonthHistorical
    ? thisMonthHistorical.boardingRevenue + thisMonthHistorical.groomingRevenue
      + thisMonthHistorical.taxiRevenue   + thisMonthHistorical.otherRevenue
    : 0;
  const lastHistAmt = lastMonthHistorical
    ? lastMonthHistorical.boardingRevenue + lastMonthHistorical.groomingRevenue
      + lastMonthHistorical.taxiRevenue   + lastMonthHistorical.otherRevenue
    : 0;
  const thisAmt = (thisMonthRevenue._sum.amount ?? 0) + thisHistAmt;
  const lastAmt = (lastMonthRevenue._sum.amount ?? 0) + lastHistAmt;
  const delta = lastAmt === 0
    ? (thisAmt > 0 ? 100 : 0)
    : Math.round(((thisAmt - lastAmt) / lastAmt) * 1000) / 10;

  // ── Répartition CA par service ce mois (item.allocatedAmount) ─────────────
  // Identique à dashboard : chaque item est catégorisé par sa description,
  // son allocatedAmount est ajouté au bucket correspondant.
  const byServiceThis = { BOARDING: 0, PET_TAXI: 0, GROOMING: 0, PRODUCT: 0, OTHER: 0 };
  for (const p of thisMonthItems) {
    for (const item of p.invoice.items) {
      byServiceThis[categoriseItem(item.description)] += item.allocatedAmount;
    }
  }

  const byServiceLast = { BOARDING: 0, PET_TAXI: 0, GROOMING: 0, PRODUCT: 0, OTHER: 0 };
  for (const p of lastMonthItems) {
    for (const item of p.invoice.items) {
      byServiceLast[categoriseItem(item.description)] += item.allocatedAmount;
    }
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
      delta:   svcDelta(byServiceThis.BOARDING,  byServiceLast.BOARDING),
      count:   volumeGroupBy.find(r => r.serviceType === 'BOARDING')?._count.id  ?? 0,
    },
    taxi: {
      thisAmt: byServiceThis.PET_TAXI,
      lastAmt: byServiceLast.PET_TAXI,
      delta:   svcDelta(byServiceThis.PET_TAXI,   byServiceLast.PET_TAXI),
      count:   volumeGroupBy.find(r => r.serviceType === 'PET_TAXI')?._count.id  ?? 0,
    },
    grooming: {
      thisAmt: byServiceThis.GROOMING,
      lastAmt: byServiceLast.GROOMING,
      delta:   svcDelta(byServiceThis.GROOMING,   byServiceLast.GROOMING),
      count:   volumeGroupBy.find(r => r.serviceType === 'GROOMING')?._count.id  ?? 0,
    },
    croquettes: {
      thisAmt: byServiceThis.PRODUCT,
      lastAmt: byServiceLast.PRODUCT,
      delta:   svcDelta(byServiceThis.PRODUCT,    byServiceLast.PRODUCT),
      count:   0,
    },
  };

  // ── Panier moyen — totalCA / nb clients distincts ce mois ─────────────────
  const uniqueClients = new Set(thisMonthItems.map(p => p.invoice.clientId)).size;
  const avgBasket     = uniqueClients > 0 ? Math.round(thisAmt / uniqueClients) : 0;

  // ── Durée moy. séjour (entier) ────────────────────────────────────────────
  const avgNights = completedBoardings.length > 0
    ? Math.round(
        completedBoardings.reduce((sum, b) => {
          if (!b.endDate) return sum;
          return sum + Math.max(0, (b.endDate.getTime() - b.startDate.getTime()) / 86_400_000);
        }, 0) / completedBoardings.length,
      )
    : 0;

  // ── Volume mensuel ────────────────────────────────────────────────────────
  const volumeData = {
    boarding:   volumeGroupBy.find(r => r.serviceType === 'BOARDING')?._count.id  ?? 0,
    taxi:       volumeGroupBy.find(r => r.serviceType === 'PET_TAXI')?._count.id  ?? 0,
    grooming:   volumeGroupBy.find(r => r.serviceType === 'GROOMING')?._count.id  ?? 0,
    croquettes: 0,
  };

  // ── Yearly chart (mois 0 → thisM) ────────────────────────────────────────
  const frMonths = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
                    'juil.', 'août',  'sept.', 'oct.', 'nov.', 'déc.'];
  const yearSuffix = String(currentYear).slice(2);

  const yearlyData = Array.from({ length: thisM + 1 }, (_, i) => ({
    month:      `${frMonths[i]} ${yearSuffix}`,
    boarding:   monthly[i].boarding,
    grooming:   monthly[i].grooming,
    taxi:       monthly[i].taxi,
    croquettes: monthly[i].croquettes,
    total:      monthly[i].boarding + monthly[i].grooming + monthly[i].taxi + monthly[i].croquettes,
  }));

  const lastYearData = Array.from({ length: thisM + 1 }, (_, i) => ({
    month: frMonths[i],
    total: monthlyLastYear[i].boarding + monthlyLastYear[i].grooming
         + monthlyLastYear[i].taxi     + monthlyLastYear[i].croquettes,
  }));

  const monthName = now.toLocaleDateString(
    locale === 'fr' ? 'fr-FR' : 'en-US',
    { month: 'long', year: 'numeric' },
  );

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
