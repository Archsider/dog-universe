import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { formatMAD } from '@/lib/utils';
import AnalyticsCharts from './AnalyticsCharts';

interface PageProps { params: { locale: string } }

export default async function AdminAnalyticsPage({ params: { locale } }: PageProps) {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPERADMIN'].includes(session.user.role)) redirect(`/${locale}/auth/login`);

  const now = new Date();
  const thisMonthStart = startOfMonth(now);
  const thisMonthEnd = endOfMonth(now);
  const lastMonthStart = startOfMonth(subMonths(now, 1));
  const lastMonthEnd = endOfMonth(subMonths(now, 1));
  const threeMonthsAgo = subMonths(now, 3);
  const sixMonthsAgo = subMonths(now, 6);

  const start2026 = new Date('2026-01-01T00:00:00.000Z');
  const end2026 = new Date('2026-12-31T23:59:59.999Z');

  const boardingNow = {
    serviceType: 'BOARDING' as const,
    status: { in: ['CONFIRMED', 'IN_PROGRESS'] },
    startDate: { lte: now }, endDate: { gte: now },
  };

  const [
    invoices2026,
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
    completedBoardings,
    activeClients,
    semiActiveIds,
    lastMonthInvoices,
  ] = await Promise.all([
    prisma.invoice.findMany({
      where: { status: 'PAID', paidAt: { gte: start2026, lte: end2026 } },
      select: {
        amount: true, paidAt: true,
        booking: { select: { serviceType: true, boardingDetail: { select: { groomingPrice: true } } } },
      },
    }),
    prisma.invoice.aggregate({
      where: { status: 'PAID', paidAt: { gte: thisMonthStart, lte: thisMonthEnd } },
      _sum: { amount: true },
    }),
    prisma.invoice.aggregate({
      where: { status: 'PAID', paidAt: { gte: lastMonthStart, lte: lastMonthEnd } },
      _sum: { amount: true },
    }),
    prisma.booking.count({ where: { status: 'PENDING' } }),
    prisma.bookingPet.count({ where: { pet: { species: 'CAT' }, booking: boardingNow } }),
    prisma.bookingPet.count({ where: { pet: { species: 'DOG' }, booking: boardingNow } }),
    prisma.user.count({ where: { role: 'CLIENT', createdAt: { gte: thisMonthStart, lte: thisMonthEnd } } }),
    prisma.user.count({ where: { role: 'CLIENT' } }),
    prisma.invoiceItem.aggregate({ where: { description: { contains: 'Pension' } }, _sum: { total: true } }),
    prisma.invoiceItem.aggregate({ where: { description: { contains: 'Taxi' } }, _sum: { total: true } }),
    prisma.invoiceItem.aggregate({ where: { description: { contains: 'Toilettage' } }, _sum: { total: true } }),
    prisma.booking.findMany({
      where: { serviceType: 'BOARDING', status: 'COMPLETED', endDate: { not: null } },
      select: { startDate: true, endDate: true }, take: 100,
    }),
    prisma.user.count({ where: { role: 'CLIENT', bookings: { some: { createdAt: { gte: threeMonthsAgo } } } } }),
    prisma.booking.findMany({
      where: { createdAt: { gte: sixMonthsAgo, lt: threeMonthsAgo } },
      select: { clientId: true }, distinct: ['clientId'],
    }),
    prisma.invoice.findMany({
      where: { status: 'PAID', paidAt: { gte: lastMonthStart, lte: lastMonthEnd } },
      select: { clientId: true },
    }),
  ]);

  // Build 2026 monthly chart
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
    boarding: monthly[i].boarding,
    grooming: monthly[i].grooming,
    taxi: monthly[i].taxi,
  }));

  const thisMonthAmt = thisMonthRevenue._sum.amount ?? 0;
  const lastMonthAmt = lastMonthRevenue._sum.amount ?? 0;
  const monthVariation = lastMonthAmt > 0
    ? Math.round(((thisMonthAmt - lastMonthAmt) / lastMonthAmt) * 1000) / 10
    : 0;
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

  const uniqueLastMonth = new Set(lastMonthInvoices.map(i => i.clientId)).size;
  const avgBasket = uniqueLastMonth > 0 ? Math.round(lastMonthAmt / uniqueLastMonth) : 0;

  const boardingRevenue = boardingTotal._sum.total ?? 0;
  const taxiRevenue = taxiTotal._sum.total ?? 0;
  const groomingRevenue = groomingTotal._sum.total ?? 0;

  const l = {
    title: locale === 'en' ? 'Analytics' : 'Analytiques',
    overview: locale === 'en' ? 'Overview' : 'Vue d\'ensemble',
    revenueChart: locale === 'en' ? 'Revenue trend — 2026' : 'Évolution du chiffre d\'affaires — 2026',
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
  const variationColor = monthVariation > 0 ? 'text-green-600' : monthVariation < 0 ? 'text-red-500' : 'text-gray-400';
  const variationSign = monthVariation > 0 ? '+' : '';

  const segmentRows = [
    { label: l.active, sub: l.activeSub, value: activeClients, color: 'text-green-600', bar: 'bg-green-400' },
    { label: l.semiActive, sub: l.semiActiveSub, value: semiActiveCount, color: 'text-amber-600', bar: 'bg-amber-400' },
    { label: l.inactive, sub: l.inactiveSub, value: inactiveCount, color: 'text-gray-500', bar: 'bg-gray-300' },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-serif font-bold text-charcoal">{l.title}</h1>
          <p className="text-sm text-charcoal/50 mt-0.5 capitalize">{l.overview} — {monthName}</p>
        </div>
        <a
          href="/api/admin/analytics/export"
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-charcoal/70 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          {locale === 'fr' ? 'Export CSV' : 'Export CSV'}
        </a>
      </div>

      {/* Row 1 — KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">

        {/* CA with % variation */}
        <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
          <p className="text-xs text-gray-500 mb-1">{l.monthlyRevenue}</p>
          <p className="text-2xl font-bold text-charcoal">{formatMAD(thisMonthAmt)}</p>
          <p className={`text-xs mt-1 font-medium ${variationColor}`}>
            {variationSign}{monthVariation}% {l.vsPrev}
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
