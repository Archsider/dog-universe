import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { subMonths } from 'date-fns';
import { startOfMonthCasa, endOfMonthCasa, currentMonthCasa, casablancaYMD } from '@/lib/dates-casablanca';
import {
  cashByMonth,
  billedByCategory,
  volumeByCategory,
  avgBasket as getAvgBasket,
  deltaPercent,
  newClientsCount,
  inferItemCategory,
} from '@/lib/metrics';
import { getMonthlyInvoicesWhere } from '@/lib/billing';
import { getMonthlyRevenueByCategory } from '@/lib/billing/monthly-revenue';
import { computeMonthlyRevenueByCategory, allocateBetweenItems } from '@/lib/accounting';
import { toNumber } from '@/lib/decimal';
// AnalyticsCharts is a 'use client' component that already lazy-loads its
// Recharts sub-components internally via next/dynamic — no outer wrapper needed.
import AnalyticsCharts from './AnalyticsCharts';

// Cache ISR — analytics agrègent sur tout le mois ; recalculer toutes les 60 s
// suffit. Mutations comptables (paiement, statut booking) invalident via
// revalidateTag('admin-counts').
export const revalidate = 60;

interface PageProps { params: Promise<{ locale: string }> }

export default async function AdminAnalyticsPage({ params }: PageProps) {
  const { locale } = await params;
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN'))
    redirect(`/${locale}/auth/login`);

  const now         = new Date();
  // Casa-anchored "this month" — date-fns startOfMonth/endOfMonth + raw
  // `.getFullYear()/.getMonth()` use the runtime's local TZ (UTC on Vercel)
  // and are off-by-one across the 00:00 Casa = 23:00 UTC previous-day
  // boundary. All analytics KPIs (cash, billing, volume, basket, charts)
  // must read the Casa calendar. See docs/BUSINESS_RULES.md §6.
  const { year: currentYear, month: currentMonthNum } = currentMonthCasa();
  const lastYear    = currentYear - 1;
  const thisM       = currentMonthNum - 1; // 0-indexed for the chart's monthly array lookup

  const thisMonthStart = startOfMonthCasa(now);
  const thisMonthEnd   = endOfMonthCasa(now);
  const lastMonthStart = startOfMonthCasa(subMonths(now, 1));
  const lastMonthEnd   = endOfMonthCasa(subMonths(now, 1));
  // Casa year/month for the canonical Sémantique B helper. `casablancaYMD`
  // reads the Casa calendar from a Date, so it stays correct under any
  // runtime TZ (e.g. Vercel UTC). See docs/BUSINESS_RULES.md §6.
  const { year: lastYearForMonth, month: lastMonthNum } = casablancaYMD(lastMonthStart);

  const [
    thisAmt,
    lastAmt,
    thisBilled,
    lastBilled,
    volume,
    basket,
    currentYearMonthly,
    lastYearMonthly,
    newClientsThisMonth,
    avgNightsData,
    categoryItems,
  ] = await Promise.all([
    // Sémantique B canonical : cash basis pure (paymentDate-anchored,
    // category prorata via PG function compute_payment_by_category).
    getMonthlyRevenueByCategory(currentYear, currentMonthNum).then(r => r.totalAllCategories),
    getMonthlyRevenueByCategory(lastYearForMonth, lastMonthNum).then(r => r.totalAllCategories),
    billedByCategory(thisMonthStart, thisMonthEnd),
    billedByCategory(lastMonthStart, lastMonthEnd),
    volumeByCategory(thisMonthStart, thisMonthEnd),
    getAvgBasket(thisMonthStart, thisMonthEnd),
    cashByMonth(currentYear),
    cashByMonth(lastYear),
    newClientsCount(thisMonthStart, thisMonthEnd, true),
    // Standalone query for avg stay duration — boarding-dominant invoices only
    // Uses COALESCE(periodDate, issuedAt): periodDate = booking.startDate for accurate period bucketing.
    prisma.invoice.findMany({
      where: {
        ...getMonthlyInvoicesWhere(thisMonthStart, thisMonthEnd),
        status: { in: ['PAID', 'PARTIALLY_PAID'] },
      },
      select: { items: { select: { category: true, total: true, quantity: true } } },
    }),
    // Drill-down items for category cards on Analytics.
    // ENCAISSÉ per item this month — sequential allocation Payment → InvoiceItem
    // via computeMonthlyRevenueByCategory ; un item à 0 encaissé est exclu.
    prisma.invoice.findMany({
      where: {
        ...getMonthlyInvoicesWhere(thisMonthStart, thisMonthEnd),
        status: { in: ['PAID', 'PARTIALLY_PAID', 'PENDING'] },
      },
      select: {
        invoiceNumber: true,
        issuedAt: true,
        clientDisplayName: true,
        client: { select: { name: true } },
        payments: {
          select: { amount: true, paymentDate: true },
          orderBy: { paymentDate: 'asc' },
        },
        items: {
          select: { id: true, description: true, quantity: true, unitPrice: true, category: true, total: true },
          orderBy: { id: 'asc' },
        },
      },
      take: 2000,
    }).then(invoices => {
      type Row = {
        description: string;
        quantity: number;
        unitPrice: number;
        category: 'BOARDING' | 'PET_TAXI' | 'GROOMING' | 'PRODUCT';
        invoice: {
          invoiceNumber: string;
          issuedAt: Date;
          clientDisplayName: string | null;
          client: { name: string } | null;
        };
        amount: number;
        paymentDate: Date | null;
      };
      const out: Row[] = [];
      for (const inv of invoices) {
        if (inv.payments.length === 0 || inv.items.length === 0) continue;
        // Allocation séquentielle Payment → InvoiceItem (Decimal exact).
        // Voir `allocateBetweenItems` dans @/lib/accounting.
        const allocations = allocateBetweenItems(
          inv.payments,
          inv.items,
          thisMonthStart,
          thisMonthEnd,
        );
        for (let i = 0; i < inv.items.length; i++) {
          const alloc = allocations[i];
          if (alloc.amount.lte(0)) continue;
          const it = inv.items[i];
          const cat = inferItemCategory(it.category, it.description);
          if (cat === 'OTHER') continue;
          out.push({
            description: it.description,
            quantity: it.quantity,
            unitPrice: toNumber(it.unitPrice),
            category: cat,
            amount: alloc.amount.toNumber(),
            paymentDate: alloc.lastPaidAt,
            invoice: {
              invoiceNumber: inv.invoiceNumber,
              issuedAt: inv.issuedAt,
              clientDisplayName: inv.clientDisplayName,
              client: inv.client,
            },
          });
        }
      }
      // Trier par paymentDate desc (plus récent d'abord).
      out.sort((a, b) => {
        const da = a.paymentDate?.getTime() ?? 0;
        const db = b.paymentDate?.getTime() ?? 0;
        return db - da;
      });
      return out;
    }),
  ]);

  const delta = deltaPercent(thisAmt, lastAmt);

  // Avg stay duration — boarding-dominant invoices (item with highest total = BOARDING)
  const boardingDominant = avgNightsData.filter(inv => {
    if (inv.items.length === 0) return false;
    const dom = inv.items.reduce((best, item) => Number(item.total) > Number(best.total) ? item : best);
    return dom.category === 'BOARDING';
  });
  const nightItems = boardingDominant.flatMap(inv =>
    inv.items.filter(item => item.category === 'BOARDING'),
  );
  const avgNights = nightItems.length > 0
    ? Math.round(nightItems.reduce((s, i) => s + i.quantity, 0) / nightItems.length)
    : 0;

  const serviceKpis = {
    boarding: {
      thisAmt: thisBilled.boarding,
      lastAmt: lastBilled.boarding,
      delta:   deltaPercent(thisBilled.boarding, lastBilled.boarding),
      count:   volume.boarding,
    },
    taxi: {
      thisAmt: thisBilled.taxi,
      lastAmt: lastBilled.taxi,
      delta:   deltaPercent(thisBilled.taxi, lastBilled.taxi),
      count:   volume.taxi,
    },
    grooming: {
      thisAmt: thisBilled.grooming,
      lastAmt: lastBilled.grooming,
      delta:   deltaPercent(thisBilled.grooming, lastBilled.grooming),
      count:   volume.grooming,
    },
    croquettes: {
      thisAmt: thisBilled.croquettes,
      lastAmt: lastBilled.croquettes,
      delta:   deltaPercent(thisBilled.croquettes, lastBilled.croquettes),
      count:   volume.croquettes,
    },
  };

  const volumeData = {
    boarding:   volume.boarding,
    taxi:       volume.taxi,
    grooming:   volume.grooming,
    croquettes: volume.croquettes,
  };

  const donutData = {
    BOARDING: thisBilled.boarding,
    PET_TAXI: thisBilled.taxi,
    GROOMING: thisBilled.grooming,
    PRODUCT:  thisBilled.croquettes,
    OTHER:    thisBilled.other,
  };

  const monthLabels = Array.from({ length: 12 }, (_, i) =>
    new Date(2024, i, 1).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', { month: 'short' }),
  );
  const yearSuffix = String(currentYear).slice(2);

  const yearlyData = Array.from({ length: thisM + 1 }, (_, i) => ({
    month:      `${monthLabels[i]} ${yearSuffix}`,
    boarding:   currentYearMonthly[i].boarding,
    grooming:   currentYearMonthly[i].grooming,
    taxi:       currentYearMonthly[i].taxi,
    croquettes: currentYearMonthly[i].croquettes,
    total:      currentYearMonthly[i].total,
  }));

  const lastYearData = Array.from({ length: thisM + 1 }, (_, i) => ({
    month: monthLabels[i],
    total: lastYearMonthly[i].total,
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
        donutData={donutData}
        volumeData={volumeData}
        avgBasket={basket}
        avgNights={avgNights}
        newClients={newClientsThisMonth}
        totalCA={thisAmt}
        totalDelta={delta}
        categoryItems={categoryItems}
        locale={locale}
        currentYear={currentYear}
      />
    </div>
  );
}
