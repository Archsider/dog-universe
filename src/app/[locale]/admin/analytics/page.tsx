import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { startOfMonth, endOfMonth, subMonths } from 'date-fns';
import AnalyticsCharts from './AnalyticsCharts';
import {
  totalCashCollected,
  cashByMonth,
  billedByCategory,
  volumeByCategory,
  avgBasket as getAvgBasket,
  deltaPercent,
  newClientsCount,
} from '@/lib/metrics';

interface PageProps { params: { locale: string } }

export default async function AdminAnalyticsPage({ params: { locale } }: PageProps) {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN'))
    redirect(`/${locale}/auth/login`);

  const now         = new Date();
  const currentYear = now.getFullYear();
  const lastYear    = currentYear - 1;
  const thisM       = now.getMonth(); // 0-indexed

  const thisMonthStart = startOfMonth(now);
  const thisMonthEnd   = endOfMonth(now);
  const lastMonthStart = startOfMonth(subMonths(now, 1));
  const lastMonthEnd   = endOfMonth(subMonths(now, 1));

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
  ] = await Promise.all([
    totalCashCollected(thisMonthStart, thisMonthEnd),
    totalCashCollected(lastMonthStart, lastMonthEnd),
    billedByCategory(thisMonthStart, thisMonthEnd),
    billedByCategory(lastMonthStart, lastMonthEnd),
    volumeByCategory(thisMonthStart, thisMonthEnd),
    getAvgBasket(thisMonthStart, thisMonthEnd),
    cashByMonth(currentYear),
    cashByMonth(lastYear),
    newClientsCount(thisMonthStart, thisMonthEnd, true),
    // Standalone query for avg stay duration — boarding-dominant invoices only
    prisma.invoice.findMany({
      where: {
        issuedAt: { gte: thisMonthStart, lte: thisMonthEnd },
        status: { in: ['PAID', 'PARTIALLY_PAID'] },
      },
      select: { items: { select: { category: true, total: true, quantity: true } } },
    }),
  ]);

  const delta = deltaPercent(thisAmt, lastAmt);

  // Avg stay duration — boarding-dominant invoices (item with highest total = BOARDING)
  const boardingDominant = avgNightsData.filter(inv => {
    if (inv.items.length === 0) return false;
    const dom = inv.items.reduce((best, item) => item.total > best.total ? item : best);
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

  const frMonths = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
                    'juil.', 'août',  'sept.', 'oct.', 'nov.', 'déc.'];
  const yearSuffix = String(currentYear).slice(2);

  const yearlyData = Array.from({ length: thisM + 1 }, (_, i) => ({
    month:      `${frMonths[i]} ${yearSuffix}`,
    boarding:   currentYearMonthly[i].boarding,
    grooming:   currentYearMonthly[i].grooming,
    taxi:       currentYearMonthly[i].taxi,
    croquettes: currentYearMonthly[i].croquettes,
    total:      currentYearMonthly[i].total,
  }));

  const lastYearData = Array.from({ length: thisM + 1 }, (_, i) => ({
    month: frMonths[i],
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
        locale={locale}
        currentYear={currentYear}
      />
    </div>
  );
}
