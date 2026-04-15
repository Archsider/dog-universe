import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { startOfMonth, endOfMonth, subMonths } from 'date-fns';
import AnalyticsCharts from './AnalyticsCharts';

interface PageProps { params: { locale: string } }

// ── Type pour les résumés historiques (inclut year, comme dashboard) ─────────
type HistoricalSummary = {
  year: number;
  month: number;
  boardingRevenue: number;
  groomingRevenue: number;
  taxiRevenue: number;
  otherRevenue: number;
};

type MonthlyBreakdown = { boarding: number; grooming: number; taxi: number; croquettes: number };

// ── buildMonthly — pour le graphe annuel uniquement (index 0-11 = Jan-Déc) ──
function buildMonthly(
  payments: { paymentDate: Date; invoice: { items: { description: string; allocatedAmount: number }[] } }[],
  summaries: { month: number; boardingRevenue: number; groomingRevenue: number; taxiRevenue: number; otherRevenue: number }[],
  categorise: (d: string) => 'boarding' | 'taxi' | 'grooming' | 'croquettes',
): Record<number, MonthlyBreakdown> {
  const monthly: Record<number, MonthlyBreakdown> = {};
  for (let m = 0; m < 12; m++) monthly[m] = { boarding: 0, grooming: 0, taxi: 0, croquettes: 0 };
  for (const pmt of payments) {
    const m = new Date(pmt.paymentDate).getMonth();
    for (const item of pmt.invoice.items) {
      monthly[m][categorise(item.description)] += item.allocatedAmount;
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
  const lastYear    = currentYear - 1;
  const thisM       = now.getMonth(); // 0-indexed

  // ── Variables copiées depuis dashboard/page.tsx ───────────────────────────
  const thisMonthStart       = startOfMonth(now);
  const thisMonthEnd         = endOfMonth(now);
  const lastMonthStart       = startOfMonth(subMonths(now, 1));
  const lastMonthEnd         = endOfMonth(subMonths(now, 1));
  const startOfLast12Months  = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  // ── Variables analytics uniquement (graphe annuel) ────────────────────────
  const startCurrentYear = new Date(currentYear, 0, 1);
  const endCurrentYear   = new Date(currentYear, 11, 31, 23, 59, 59, 999);
  const startLastYear    = new Date(lastYear, 0, 1);
  const endLastYear      = new Date(lastYear, 11, 31, 23, 59, 59, 999);

  const [
    // ── COPIÉS depuis dashboard/page.tsx — CA mensuel ─────────────────────────
    thisMonthCA,
    lastMonthCA,
    // ── COPIÉ depuis dashboard/page.tsx — ventilation services 12 mois ───────
    last12MonthsPayments,
    // ── COPIÉS depuis dashboard/page.tsx — historique mensuel ─────────────────
    historicalSummaries,
    thisMonthHistorical,
    lastMonthHistorical,
    // ── NOUVEAUX — ajouts analytics uniquement ────────────────────────────────
    newClientsThisMonth,
    totalClients,
    // ── ANALYTICS uniquement — graphe annuel + métriques secondaires ──────────
    paymentsCurrentYear,
    paymentsLastYear,
    completedBoardings,
    volumeGroupBy,
    thisMonthClientsForBasket,
  ] = await Promise.all([

    // ── CA mensuel — Payment.amount attribué par paymentDate
    // COPIÉ depuis dashboard/page.tsx ligne 57
    prisma.payment.aggregate({
      where: {
        paymentDate: { gte: thisMonthStart, lte: thisMonthEnd },
        invoice: { status: { in: ['PAID', 'PARTIALLY_PAID'] } },
      },
      _sum: { amount: true },
    }),

    // COPIÉ depuis dashboard/page.tsx ligne 64
    prisma.payment.aggregate({
      where: {
        paymentDate: { gte: lastMonthStart, lte: lastMonthEnd },
        invoice: { status: { in: ['PAID', 'PARTIALLY_PAID'] } },
      },
      _sum: { amount: true },
    }),

    // Graphique 12 mois + ventilation services — source unique : Payment / InvoiceItem
    // COPIÉ depuis dashboard/page.tsx ligne 80
    prisma.payment.findMany({
      where: {
        paymentDate: { gte: startOfLast12Months },
        invoice: { status: { in: ['PAID', 'PARTIALLY_PAID'] } },
      },
      select: {
        amount: true,
        paymentDate: true,
        invoice: {
          select: {
            items: { select: { description: true, total: true, allocatedAmount: true } },
          },
        },
      },
    }),

    // Historical revenue summaries (pre-production data Jan/Feb/Mar etc.)
    // COPIÉ depuis dashboard/page.tsx ligne 145
    prisma.monthlyRevenueSummary.findMany({
      select: { year: true, month: true, boardingRevenue: true, groomingRevenue: true, taxiRevenue: true, otherRevenue: true },
    }).catch(() => [] as HistoricalSummary[]),

    // CA historique mois courant — COPIÉ depuis dashboard/page.tsx ligne 149
    prisma.monthlyRevenueSummary.findFirst({
      where: { year: thisMonthStart.getFullYear(), month: thisMonthStart.getMonth() + 1 },
      select: { boardingRevenue: true, groomingRevenue: true, taxiRevenue: true, otherRevenue: true },
    }).catch(() => null),

    // CA historique mois précédent — COPIÉ depuis dashboard/page.tsx ligne 154
    prisma.monthlyRevenueSummary.findFirst({
      where: { year: lastMonthStart.getFullYear(), month: lastMonthStart.getMonth() + 1 },
      select: { boardingRevenue: true, groomingRevenue: true, taxiRevenue: true, otherRevenue: true },
    }).catch(() => null),

    // Nouveaux clients ce mois (hors compte de passage) — AJOUT analytics
    prisma.user.count({
      where: {
        role: 'CLIENT',
        email: { not: 'passage@doguniverse.ma' },
        createdAt: { gte: thisMonthStart, lte: thisMonthEnd },
      },
    }),

    // Total clients (hors compte de passage) — AJOUT analytics
    prisma.user.count({
      where: {
        role: 'CLIENT',
        email: { not: 'passage@doguniverse.ma' },
      },
    }),

    // Paiements année courante pour graphe (index par mois 0-11, année isolée)
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

    // Paiements année précédente (courbe comparaison graphe)
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

    // Durée moy. séjour — bookings BOARDING ce mois, non annulés
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

    // Clients uniques ce mois (pour panier moyen)
    prisma.payment.findMany({
      where: {
        paymentDate: { gte: thisMonthStart, lte: thisMonthEnd },
        invoice: { status: { in: ['PAID', 'PARTIALLY_PAID'] } },
      },
      select: {
        invoice: { select: { clientId: true } },
      },
    }),
  ]);

  // ── Catégorisation par description d'InvoiceItem
  // COPIÉ EXACTEMENT depuis dashboard/page.tsx ligne 201
  const categoriseItem = (description: string): 'boarding' | 'taxi' | 'grooming' | 'croquettes' => {
    const desc = description.toLowerCase();
    if (desc.includes('taxi')) return 'taxi';
    if (desc.includes('toilettage') || desc.includes('grooming')) return 'grooming';
    if (desc.includes('croquette') || desc.includes('kibble')) return 'croquettes';
    return 'boarding'; // pension / nuit / boarding / tout le reste
  };

  // ── Build monthlyData (12 mois glissants)
  // COPIÉ EXACTEMENT depuis dashboard/page.tsx lignes 192-216
  const chartLocale = locale === 'fr' ? 'fr-FR' : 'en-US';
  const monthlyData: Record<string, { boarding: number; taxi: number; grooming: number; croquettes: number }> = {};
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.toLocaleDateString(chartLocale, { month: 'short', year: '2-digit' });
    monthlyData[key] = { boarding: 0, taxi: 0, grooming: 0, croquettes: 0 };
  }

  // Chaque paiement est ventilé par allocatedAmount (montant exact alloué à chaque item)
  for (const pmt of last12MonthsPayments) {
    const key = new Date(pmt.paymentDate).toLocaleDateString(chartLocale, { month: 'short', year: '2-digit' });
    if (!monthlyData[key]) continue;
    for (const item of pmt.invoice.items) {
      monthlyData[key][categoriseItem(item.description)] += item.allocatedAmount;
    }
  }

  // ── KPIs services ce mois — extraits avant le backfill historique (données réelles uniquement)
  // COPIÉ EXACTEMENT depuis dashboard/page.tsx lignes 218-224
  const thisMonthKey = new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString(chartLocale, { month: 'short', year: '2-digit' });
  const thisMonthBreakdown = monthlyData[thisMonthKey] ?? { boarding: 0, taxi: 0, grooming: 0, croquettes: 0 };
  const monthlyBoardingRevenue   = thisMonthBreakdown.boarding;
  const monthlyTaxiRevenue       = thisMonthBreakdown.taxi;
  const monthlyGroomingRevenue   = thisMonthBreakdown.grooming;
  const monthlyCroquettesRevenue = thisMonthBreakdown.croquettes;

  // ── KPIs services mois précédent — extraits avant backfill (analytics uniquement)
  const lastMonthKeyForKpi = new Date(now.getFullYear(), now.getMonth() - 1, 1).toLocaleDateString(chartLocale, { month: 'short', year: '2-digit' });
  const lastMonthBreakdown = monthlyData[lastMonthKeyForKpi] ?? { boarding: 0, taxi: 0, grooming: 0, croquettes: 0 };

  // ── Historical summaries — complète les mois pré-production sans paiements réels
  // COPIÉ EXACTEMENT depuis dashboard/page.tsx lignes 226-236
  historicalSummaries.forEach(s => {
    const d = new Date(s.year, s.month - 1, 1);
    const key = d.toLocaleDateString(chartLocale, { month: 'short', year: '2-digit' });
    if (monthlyData[key]) {
      monthlyData[key].boarding   += s.boardingRevenue;
      monthlyData[key].grooming   += s.groomingRevenue;
      monthlyData[key].taxi       += s.taxiRevenue;
      monthlyData[key].croquettes += s.otherRevenue;
    }
  });

  // ── CA total KPI (paiements réels + historique)
  // COPIÉ EXACTEMENT depuis dashboard/page.tsx lignes 178-189
  const thisHistAmt = thisMonthHistorical
    ? thisMonthHistorical.boardingRevenue + thisMonthHistorical.groomingRevenue + thisMonthHistorical.taxiRevenue + thisMonthHistorical.otherRevenue
    : 0;
  const lastHistAmt = lastMonthHistorical
    ? lastMonthHistorical.boardingRevenue + lastMonthHistorical.groomingRevenue + lastMonthHistorical.taxiRevenue + lastMonthHistorical.otherRevenue
    : 0;
  const thisAmt = (thisMonthCA._sum.amount ?? 0) + thisHistAmt;
  const lastAmt = (lastMonthCA._sum.amount ?? 0) + lastHistAmt;
  const delta = lastAmt === 0
    ? (thisAmt > 0 ? 100 : 0)
    : Math.round(((thisAmt - lastAmt) / lastAmt) * 1000) / 10;

  // ── Répartition CA par service — extraite de monthlyData AVANT backfill ────
  const byServiceThis = {
    BOARDING: monthlyBoardingRevenue,
    PET_TAXI: monthlyTaxiRevenue,
    GROOMING: monthlyGroomingRevenue,
    PRODUCT:  monthlyCroquettesRevenue,
    OTHER:    0,
  };
  const byServiceLast = {
    BOARDING: lastMonthBreakdown.boarding,
    PET_TAXI: lastMonthBreakdown.taxi,
    GROOMING: lastMonthBreakdown.grooming,
    PRODUCT:  lastMonthBreakdown.croquettes,
    OTHER:    0,
  };

  // ── KPI par service (deltas mois/mois) ───────────────────────────────────
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
      count:   volumeGroupBy.find(r => r.serviceType === 'BOARDING')?._count.id ?? 0,
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

  // ── Panier moyen — totalCA / nb clients distincts ce mois ────────────────
  const uniqueClients = new Set(thisMonthClientsForBasket.map(p => p.invoice.clientId)).size;
  const avgBasket     = uniqueClients > 0 ? Math.round(thisAmt / uniqueClients) : 0;

  // ── Durée moy. séjour (entier, en nuits) ─────────────────────────────────
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
    boarding:   volumeGroupBy.find(r => r.serviceType === 'BOARDING')?._count.id ?? 0,
    taxi:       volumeGroupBy.find(r => r.serviceType === 'PET_TAXI')?._count.id  ?? 0,
    grooming:   volumeGroupBy.find(r => r.serviceType === 'GROOMING')?._count.id  ?? 0,
    croquettes: 0,
  };

  // ── Graphe annuel (mois 0 → thisM, année isolée) ─────────────────────────
  const historicalCurrentYear = historicalSummaries
    .filter(s => s.year === currentYear && s.month <= thisM + 1);
  const historicalLastYearData = historicalSummaries
    .filter(s => s.year === lastYear);

  const monthly         = buildMonthly(paymentsCurrentYear,  historicalCurrentYear,  categoriseItem);
  const monthlyLastYear = buildMonthly(paymentsLastYear,     historicalLastYearData, categoriseItem);

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
