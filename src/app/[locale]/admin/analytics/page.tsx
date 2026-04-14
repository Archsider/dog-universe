import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { formatMAD } from '@/lib/utils';
import AnalyticsCharts from './AnalyticsCharts';

interface PageProps { params: { locale: string } }

export default async function AdminAnalyticsPage({ params: { locale } }: PageProps) {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) redirect(`/${locale}/auth/login`);

  const now = new Date();
  const currentYear = now.getFullYear();
  const thisMonthStart = startOfMonth(now);
  const thisMonthEnd = endOfMonth(now);
  const lastMonthStart = startOfMonth(subMonths(now, 1));
  const lastMonthEnd = endOfMonth(subMonths(now, 1));
  const threeMonthsAgo = subMonths(now, 3);
  const sixMonthsAgo = subMonths(now, 6);

  const startCurrentYear = new Date(`${currentYear}-01-01T00:00:00.000Z`);
  const endCurrentYear = new Date(`${currentYear}-12-31T23:59:59.999Z`);

  const boardingNow = {
    serviceType: 'BOARDING' as const,
    status: 'IN_PROGRESS' as const,
    startDate: { lte: now }, endDate: { gte: now },
  };

  const [
    paymentsCurrentYear,
    thisMonthRevenue,
    lastMonthRevenue,
    pendingCount,
    currentCatBoarders,
    currentDogBoarders,
    newClientsThisMonth,
    totalClients,
    boardingTotal,
    taxiTotal,
    groomingTotal,
    productSaleTotal,
    completedBoardings,
    activeClients,
    semiActiveIds,
    lastMonthPayments,
    historicalSummaries,
    thisMonthHistorical,
    lastMonthHistorical,
  ] = await Promise.all([
    // Yearly chart — attributed by payment date, covers PAID + PARTIALLY_PAID
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
    }),
    // CA mensuel — Payment.amount attribué par paymentDate
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
    prisma.user.count({ where: { role: 'CLIENT', createdAt: { gte: thisMonthStart, lte: thisMonthEnd } } }),
    prisma.user.count({ where: { role: 'CLIENT' } }),
    // Breakdown all-time — PAID + PARTIALLY_PAID uniquement, allocatedAmount pour les paiements partiels
    prisma.invoiceItem.aggregate({
      where: { description: { contains: 'Pension' }, invoice: { status: { in: ['PAID', 'PARTIALLY_PAID'] } } },
      _sum: { allocatedAmount: true },
    }),
    prisma.invoiceItem.aggregate({
      where: { description: { contains: 'Taxi' }, invoice: { status: { in: ['PAID', 'PARTIALLY_PAID'] } } },
      _sum: { allocatedAmount: true },
    }),
    prisma.invoiceItem.aggregate({
      where: { description: { contains: 'Toilettage' }, invoice: { status: { in: ['PAID', 'PARTIALLY_PAID'] } } },
      _sum: { allocatedAmount: true },
    }),
    prisma.invoice.aggregate({ where: { status: { in: ['PAID', 'PARTIALLY_PAID'] }, serviceType: 'PRODUCT_SALE' }, _sum: { amount: true } }),
    prisma.booking.findMany({
      where: { serviceType: 'BOARDING', status: 'COMPLETED', endDate: { not: null } },
      select: { startDate: true, endDate: true }, take: 100,
    }),
    prisma.user.count({ where: { role: 'CLIENT', bookings: { some: { createdAt: { gte: threeMonthsAgo } } } } }),
    prisma.booking.findMany({
      where: { createdAt: { gte: sixMonthsAgo, lt: threeMonthsAgo } },
      select: { clientId: true }, distinct: ['clientId'],
    }),
    // Unique clients for avg basket — payment-attributed (PAID + PARTIALLY_PAID)
    prisma.payment.findMany({
      where: {
        paymentDate: { gte: lastMonthStart, lte: lastMonthEnd },
        invoice: { status: { in: ['PAID', 'PARTIALLY_PAID'] } },
      },
      select: { invoice: { select: { clientId: true } } },
    }),
    // Historical revenue summaries for current year (pre-production data)
    prisma.monthlyRevenueSummary.findMany({
      where: { year: currentYear },
      select: { month: true, boardingRevenue: true, groomingRevenue: true, taxiRevenue: true, otherRevenue: true },
    }).catch(() => [] as { month: number; boardingRevenue: number; groomingRevenue: number; taxiRevenue: number; otherRevenue: number }[]),
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
  ]);

  // Build yearly chart — merge real invoices + historical summaries
  const monthly: Record<number, { boarding: number; grooming: number; taxi: number; croquettes: number }> = {};
  for (let m = 0; m < 12; m++) monthly[m] = { boarding: 0, grooming: 0, taxi: 0, croquettes: 0 };

  // Real payments (PAID + PARTIALLY_PAID invoices), attributed by paymentDate
  for (const pmt of paymentsCurrentYear) {
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
        // Distribute payment proportionally based on allocatedAmount — taxi add-ons bien séparés
        for (const item of items) {
          const ratio = item.allocatedAmount / totalAllocated;
          const itemAmt = pmt.amount * ratio;
          if (item.description.includes('Taxi')) monthly[m].taxi += itemAmt;
          else if (item.description.includes('Toilettage')) monthly[m].grooming += itemAmt;
          else monthly[m].boarding += itemAmt;
        }
      } else {
        // Fallback: pas d'allocatedAmount → heuristic groomingPrice
        const g = Math.min(pmt.invoice.booking?.boardingDetail?.groomingPrice ?? 0, pmt.amount);
        monthly[m].grooming += g;
        monthly[m].boarding += pmt.amount - g;
      }
    }
  }

  // Historical summaries (month is 1-indexed)
  for (const s of historicalSummaries) {
    const m = s.month - 1;
    monthly[m].boarding += s.boardingRevenue;
    monthly[m].grooming += s.groomingRevenue;
    monthly[m].taxi += s.taxiRevenue;
    monthly[m].croquettes += s.otherRevenue;
  }

  const frMonths = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const yearSuffix = String(currentYear).slice(2);
  const yearlyData = Array.from({ length: 12 }, (_, i) => ({
    month: `${frMonths[i]} ${yearSuffix}`,
    boarding: monthly[i].boarding,
    grooming: monthly[i].grooming,
    taxi: monthly[i].taxi,
    croquettes: monthly[i].croquettes,
  }));

  // CA KPI — paiements réels + données historiques manuelles
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

  const capacitySettings = await prisma.setting.findMany({
    where: { key: { in: ['capacity_dog', 'capacity_cat'] } },
  });
  const capMap = Object.fromEntries(capacitySettings.map(s => [s.key, parseInt(s.value, 10)]));
  const DOG_CAPACITY = capMap.capacity_dog ?? 50;
  const CAT_CAPACITY = capMap.capacity_cat ?? 10;

  const avgNights = completedBoardings.length > 0
    ? completedBoardings.reduce((sum, b) => {
        if (!b.endDate) return sum;
        return sum + Math.max(0, (b.endDate.getTime() - b.startDate.getTime()) / 86400000);
      }, 0) / completedBoardings.length
    : 0;

  const semiActiveCount = semiActiveIds.length;
  const inactiveCount = Math.max(0, totalClients - activeClients - semiActiveCount);
  const totalSegments = activeClients + semiActiveCount + inactiveCount || 1;

  const uniqueLastMonth = new Set(lastMonthPayments.map(p => p.invoice.clientId)).size;
  const avgBasket = uniqueLastMonth > 0 ? Math.round(lastAmt / uniqueLastMonth) : 0;

  // Service breakdown: real invoice items + historical summaries
  const summaryBoarding = historicalSummaries.reduce((s, r) => s + r.boardingRevenue, 0);
  const summaryGrooming = historicalSummaries.reduce((s, r) => s + r.groomingRevenue, 0);
  const summaryTaxi = historicalSummaries.reduce((s, r) => s + r.taxiRevenue, 0);
  const summaryCroquettes = historicalSummaries.reduce((s, r) => s + r.otherRevenue, 0);

  const boardingRevenue = (boardingTotal._sum.allocatedAmount ?? 0) + summaryBoarding;
  const taxiRevenue = (taxiTotal._sum.allocatedAmount ?? 0) + summaryTaxi;
  const groomingRevenue = (groomingTotal._sum.allocatedAmount ?? 0) + summaryGrooming;
  const croquettesRevenue = (productSaleTotal._sum.amount ?? 0) + summaryCroquettes;

  const l = {
    title: locale === 'en' ? 'Analytics' : 'Analytiques',
    overview: locale === 'en' ? 'Overview' : 'Vue d\'ensemble',
    revenueChart: locale === 'en' ? `Revenue trend — ${currentYear}` : `Évolution du chiffre d\'affaires — ${currentYear}`,
    breakdown: locale === 'en' ? 'Service breakdown' : 'Répartition des services',
    clientSegments: locale === 'en' ? 'Client segmentation' : 'Segmentation clients',
    monthlyRevenue: locale === 'en' ? 'Revenue' : 'Chiffre d\'affaires',
    vsPrev: locale === 'en' ? 'vs previous period' : 'vs période précédente',
    currentBoarders: locale === 'en' ? 'Current boarders' : 'Pension actuelle',
    occupancyRate: locale === 'en' ? 'Occupancy rate' : 'Taux d\'occupation',
    pendingBookings: locale === 'en' ? 'Pending' : 'En attente',
    newClients: locale === 'en' ? 'New clients' : 'Nouveaux clients',
    avgBasket: locale === 'en' ? 'Avg basket' : 'Panier moyen',
    avgDuration: locale === 'en' ? 'Avg stay' : 'Durée moy. séjour',
    nights: locale === 'en' ? 'nights' : 'nuits',
    active: locale === 'en' ? 'Active' : 'Actifs',
    semiActive: locale === 'en' ? 'Semi-active' : 'Semi-actifs',
    inactive: locale === 'en' ? 'Inactive' : 'Inactifs',
    activeSub: locale === 'en' ? '< 90 days' : '< 90 jours',
    semiActiveSub: locale === 'en' ? '90–180 days' : '90–180 jours',
    inactiveSub: locale === 'en' ? '> 180 days' : '> 180 jours',
  };

  const monthName = now.toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', { month: 'long', year: 'numeric' });
  const variationColor = delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-500' : 'text-gray-400';

  const segmentRows = [
    { label: l.active, sub: l.activeSub, value: activeClients, color: 'text-green-600', bar: 'bg-green-400' },
    { label: l.semiActive, sub: l.semiActiveSub, value: semiActiveCount, color: 'text-amber-600', bar: 'bg-amber-400' },
    { label: l.inactive, sub: l.inactiveSub, value: inactiveCount, color: 'text-gray-500', bar: 'bg-gray-300' },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-serif font-bold text-charcoal">{l.title}</h1>
        <p className="text-sm text-charcoal/50 mt-0.5 capitalize">{l.overview} — {monthName}</p>
      </div>

      {/* Row 1 — KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">

        {/* CA with % variation */}
        <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
          <p className="text-xs text-gray-500 mb-1">{l.monthlyRevenue}</p>
          <p className="text-2xl font-bold text-charcoal">{formatMAD(thisAmt)}</p>
          <p className={`text-xs mt-1 font-medium ${variationColor}`}>
            {`${delta > 0 ? '+' : ''}${delta}% vs mois préc.`}
          </p>
        </div>

        {/* Taux d'occupation */}
        <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
          <p className="text-xs text-gray-500 mb-4">{l.occupancyRate}</p>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-sm font-medium text-charcoal">🐱 {locale === 'fr' ? 'Chats' : 'Cats'}</span>
                <span className="text-sm font-bold text-charcoal">{currentCatBoarders}<span className="text-xs font-normal text-gray-400"> / {CAT_CAPACITY}</span></span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full">
                <div className="h-2 bg-gold-400 rounded-full transition-all" style={{ width: `${Math.min(100, (currentCatBoarders / CAT_CAPACITY) * 100)}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-sm font-medium text-charcoal">🐕 {locale === 'fr' ? 'Chiens' : 'Dogs'}</span>
                <span className="text-sm font-bold text-charcoal">{currentDogBoarders}<span className="text-xs font-normal text-gray-400"> / {DOG_CAPACITY}</span></span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full">
                <div className="h-2 bg-charcoal rounded-full transition-all" style={{ width: `${Math.min(100, (currentDogBoarders / DOG_CAPACITY) * 100)}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* Pending */}
        <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
          <p className="text-xs text-gray-500 mb-1">{l.pendingBookings}</p>
          <p className="text-2xl font-bold text-amber-600">{pendingCount}</p>
          <p className="text-xs text-gray-400 mt-1">{locale === 'fr' ? 'réservations' : 'bookings'}</p>
        </div>

        {/* New clients */}
        <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
          <p className="text-xs text-gray-500 mb-1">{l.newClients}</p>
          <p className="text-2xl font-bold text-green-600">{newClientsThisMonth}</p>
          <p className="text-xs text-gray-400 mt-1">{locale === 'fr' ? 'ce mois' : 'this month'}</p>
        </div>

        {/* Avg basket */}
        <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
          <p className="text-xs text-gray-500 mb-1">{l.avgBasket}</p>
          <p className="text-2xl font-bold text-purple-600">{formatMAD(avgBasket)}</p>
          <p className="text-xs text-gray-400 mt-1">{locale === 'fr' ? 'par client' : 'per client'}</p>
        </div>

        {/* Avg stay */}
        <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
          <p className="text-xs text-gray-500 mb-1">{l.avgDuration}</p>
          <p className="text-2xl font-bold text-indigo-600">{Math.round(avgNights * 10) / 10}</p>
          <p className="text-xs text-gray-400 mt-1">{l.nights}</p>
        </div>
      </div>

      {/* Row 2 — Revenue chart + Service breakdown */}
      <AnalyticsCharts
        revenueData={yearlyData}
        boardingRevenue={boardingRevenue}
        taxiRevenue={taxiRevenue}
        groomingRevenue={groomingRevenue}
        croquettesRevenue={croquettesRevenue}
        locale={locale}
        labels={l}
      />

      {/* Row 3 — Client segmentation */}
      <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-6 shadow-card mt-6">
        <h2 className="font-semibold text-charcoal mb-5">{l.clientSegments}</h2>
        <div className="space-y-4">
          {segmentRows.map(s => (
            <div key={s.label}>
              <div className="flex items-center justify-between mb-1">
                <div>
                  <span className={`text-sm font-medium ${s.color}`}>{s.label}</span>
                  <span className="text-xs text-gray-400 ml-2">{s.sub}</span>
                </div>
                <span className={`text-sm font-bold ${s.color}`}>{s.value}</span>
              </div>
              <div className="w-full h-2 rounded-full bg-gray-100">
                <div
                  className={`h-2 rounded-full ${s.bar} transition-all`}
                  style={{ width: `${Math.round((s.value / totalSegments) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
