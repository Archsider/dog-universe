import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { Users, Calendar, TrendingUp, Clock, AlertCircle, Scissors, Car, Star, UserPlus } from 'lucide-react';
import { formatMAD } from '@/lib/utils';
import RevenueChartWrapper from './RevenueChartWrapper';
import { startOfMonth, endOfMonth, subMonths } from 'date-fns';

interface PageProps { params: { locale: string } }

export default async function AdminDashboardPage({ params: { locale } }: PageProps) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') redirect(`/${locale}/auth/login`);

  const now = new Date();
  const thisMonthStart = startOfMonth(now);
  const thisMonthEnd = endOfMonth(now);
  const lastMonthStart = startOfMonth(subMonths(now, 1));
  const lastMonthEnd = endOfMonth(subMonths(now, 1));
  const startOfLast12Months = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  const boardingNow = {
    serviceType: 'BOARDING' as const,
    status: { in: ['CONFIRMED', 'IN_PROGRESS'] },
    startDate: { lte: now },
    endDate: { gte: now },
  };

  const [
    totalClients,
    pendingBookings,
    currentCatBoarders,
    currentDogBoarders,
    monthlyRevenue,
    lastMonthRevenue,
    recentBookings,
    revenueData,
    monthlyBoardingInvoices,
    monthlyTaxiAgg,
    loyalClientsGroups,
    newClientsThisMonth,
    top5Revenue,
  ] = await Promise.all([
    prisma.user.count({ where: { role: 'CLIENT' } }),
    prisma.booking.count({ where: { status: 'PENDING' } }),
    prisma.bookingPet.count({ where: { pet: { species: 'CAT' }, booking: boardingNow } }),
    prisma.bookingPet.count({ where: { pet: { species: 'DOG' }, booking: boardingNow } }),
    prisma.invoice.aggregate({
      where: { status: 'PAID', issuedAt: { gte: thisMonthStart, lte: thisMonthEnd } },
      _sum: { amount: true },
    }),
    prisma.invoice.aggregate({
      where: { status: 'PAID', issuedAt: { gte: lastMonthStart, lte: lastMonthEnd } },
      _sum: { amount: true },
    }),
    prisma.booking.findMany({
      include: {
        client: { select: { name: true, email: true } },
        bookingPets: { include: { pet: { select: { name: true } } } },
      },
      orderBy: { startDate: 'desc' },
      take: 8,
    }),
    prisma.invoice.findMany({
      where: { status: 'PAID', issuedAt: { gte: startOfLast12Months } },
      select: { amount: true, issuedAt: true, booking: { select: { serviceType: true, boardingDetail: { select: { groomingPrice: true } } } } },
    }),
    prisma.invoice.findMany({
      where: { status: 'PAID', issuedAt: { gte: thisMonthStart, lte: thisMonthEnd }, booking: { serviceType: 'BOARDING' } },
      select: { amount: true, booking: { select: { boardingDetail: { select: { groomingPrice: true } } } } },
    }),
    prisma.invoice.aggregate({
      where: { status: 'PAID', issuedAt: { gte: thisMonthStart, lte: thisMonthEnd }, booking: { serviceType: 'PET_TAXI' } },
      _sum: { amount: true },
    }),
    prisma.booking.groupBy({
      by: ['clientId'],
      _count: { clientId: true },
      having: { clientId: { _count: { gt: 1 } } },
    }),
    prisma.user.count({
      where: { role: 'CLIENT', createdAt: { gte: thisMonthStart, lte: thisMonthEnd } },
    }),
    prisma.invoice.groupBy({
      by: ['clientId'],
      where: { status: 'PAID' },
      _sum: { amount: true },
      orderBy: { _sum: { amount: 'desc' } },
      take: 5,
    }),
  ]);

  const top5Users = await prisma.user.findMany({
    where: { id: { in: top5Revenue.map(r => r.clientId) } },
    select: { id: true, name: true, email: true },
  });
  const topClients = top5Revenue.map(r => ({
    id: r.clientId,
    name: top5Users.find(u => u.id === r.clientId)?.name ?? r.clientId,
    email: top5Users.find(u => u.id === r.clientId)?.email ?? '',
    totalRevenue: r._sum.amount ?? 0,
  }));

  // CA variation vs previous month
  const thisMonthAmt = monthlyRevenue._sum.amount ?? 0;
  const lastMonthAmt = lastMonthRevenue._sum.amount ?? 0;
  const monthVariation = lastMonthAmt > 0
    ? Math.round(((thisMonthAmt - lastMonthAmt) / lastMonthAmt) * 1000) / 10
    : 0;

  // Build monthly chart data
  const monthlyData: Record<string, { boarding: number; taxi: number; grooming: number }> = {};
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', { month: 'short', year: '2-digit' });
    monthlyData[key] = { boarding: 0, taxi: 0, grooming: 0 };
  }
  revenueData.forEach(inv => {
    const d = new Date(inv.issuedAt);
    const key = d.toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', { month: 'short', year: '2-digit' });
    if (monthlyData[key]) {
      if (inv.booking?.serviceType === 'PET_TAXI') {
        monthlyData[key].taxi += inv.amount;
      } else {
        const groomingPrice = inv.booking?.boardingDetail?.groomingPrice ?? 0;
        monthlyData[key].grooming += groomingPrice;
        monthlyData[key].boarding += inv.amount - groomingPrice;
      }
    }
  });
  const chartData = Object.entries(monthlyData).map(([month, v]) => ({ month, ...v }));

  // Service revenue this month
  const monthlyGroomingRevenue = monthlyBoardingInvoices.reduce((sum, inv) => sum + (inv.booking?.boardingDetail?.groomingPrice ?? 0), 0);
  const monthlyBoardingRevenue = monthlyBoardingInvoices.reduce((sum, inv) => sum + inv.amount, 0) - monthlyGroomingRevenue;
  const monthlyTaxiRevenue = monthlyTaxiAgg._sum.amount ?? 0;
  const loyalClients = loyalClientsGroups.length;

  const labels = {
    fr: {
      title: 'Tableau de bord',
      caMonthly: 'CA mensuel',
      animauxHeberges: 'Pension actuelle',
      pending: 'En attente',
      totalClients: 'Total clients',
      pension: 'Pension',
      taxi: 'Taxi animalier',
      grooming: 'Toilettage',
      loyalClients: 'Clients fidèles',
      newClients: 'Nouveaux clients',
      recentBookings: 'Réservations récentes',
      viewAll: 'Voir tout',
      revenueTitle: 'CA mensuel — 12 derniers mois',
      thisMth: 'ce mois',
      top5: 'Top 5 clients',
      cats: 'Chats',
      dogs: 'Chiens',
      places: 'places',
      revenue: 'CA total',
    },
    en: {
      title: 'Dashboard',
      caMonthly: 'Monthly revenue',
      animauxHeberges: 'Current boarders',
      pending: 'Pending',
      totalClients: 'Total clients',
      pension: 'Boarding',
      taxi: 'Pet taxi',
      grooming: 'Grooming',
      loyalClients: 'Loyal clients',
      newClients: 'New clients',
      recentBookings: 'Recent bookings',
      viewAll: 'View all',
      revenueTitle: 'Monthly revenue — last 12 months',
      thisMth: 'this month',
      top5: 'Top 5 clients',
      cats: 'Cats',
      dogs: 'Dogs',
      places: 'spots',
      revenue: 'Total revenue',
    },
  };

  const statusColors: Record<string, string> = {
    PENDING: 'bg-amber-100 text-amber-700',
    CONFIRMED: 'bg-green-100 text-green-700',
    IN_PROGRESS: 'bg-blue-100 text-blue-700',
    COMPLETED: 'bg-gray-100 text-gray-600',
    CANCELLED: 'bg-red-100 text-red-600',
    REJECTED: 'bg-red-100 text-red-600',
  };

  const statusLabels: Record<string, Record<string, string>> = {
    fr: { PENDING: 'En attente', CONFIRMED: 'Confirmé', CANCELLED: 'Annulé', REJECTED: 'Refusé', COMPLETED: 'Terminé', IN_PROGRESS: 'En cours' },
    en: { PENDING: 'Pending', CONFIRMED: 'Confirmed', CANCELLED: 'Cancelled', REJECTED: 'Rejected', COMPLETED: 'Completed', IN_PROGRESS: 'In progress' },
  };

  const l = labels[locale as keyof typeof labels] || labels.fr;
  const sl = statusLabels[locale] || statusLabels.fr;

  const monthName = now.toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', { month: 'long', year: 'numeric' });
  const variationColor = monthVariation > 0 ? 'text-green-600' : monthVariation < 0 ? 'text-red-500' : 'text-gray-400';
  const variationSign = monthVariation > 0 ? '+' : '';

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-serif font-bold text-charcoal">{l.title}</h1>
        <p className="text-sm text-charcoal/50 mt-0.5 capitalize">
          {locale === 'fr' ? 'Vue d\'ensemble' : 'Overview'} — {monthName}
        </p>
      </div>

      {pendingBookings > 0 && (
        <Link href={`/${locale}/admin/reservations?status=PENDING`}>
          <div className="mb-6 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 hover:bg-amber-100 transition-colors cursor-pointer">
            <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0" />
            <span className="text-amber-700 font-medium">
              {pendingBookings} {locale === 'fr' ? `réservation${pendingBookings > 1 ? 's' : ''} en attente de confirmation` : `booking${pendingBookings > 1 ? 's' : ''} pending confirmation`}
            </span>
          </div>
        </Link>
      )}

      {/* Row 1 — Main KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <Link href={`/${locale}/admin/billing`}>
          <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-4 shadow-card hover:shadow-card-hover transition-shadow">
            <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center mb-3">
              <TrendingUp className="h-5 w-5 text-purple-500" />
            </div>
            <div className="text-xl font-bold text-charcoal">{formatMAD(thisMonthAmt)}</div>
            <div className="text-xs text-gray-500 mt-0.5">{l.caMonthly}</div>
            <div className={`text-xs mt-1 font-medium ${variationColor}`}>
              {variationSign}{monthVariation}% vs mois préc.
            </div>
          </div>
        </Link>

        <Link href={`/${locale}/admin/reservations`}>
          <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-4 shadow-card hover:shadow-card-hover transition-shadow">
            <div className="w-10 h-10 rounded-lg bg-gold-50 flex items-center justify-center mb-3">
              <Calendar className="h-5 w-5 text-gold-500" />
            </div>
            <div className="text-xs text-gray-500 mb-2">{l.animauxHeberges}</div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">🐱 {l.cats}</span>
                <span className="text-sm font-bold text-charcoal">{currentCatBoarders}<span className="text-xs font-normal text-gray-400"> / 10</span></span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full">
                <div className="h-1.5 bg-gold-400 rounded-full transition-all" style={{ width: `${Math.min(100, (currentCatBoarders / 10) * 100)}%` }} />
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-gray-500">🐕 {l.dogs}</span>
                <span className="text-sm font-bold text-charcoal">{currentDogBoarders}<span className="text-xs font-normal text-gray-400"> / 50</span></span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full">
                <div className="h-1.5 bg-charcoal rounded-full transition-all" style={{ width: `${Math.min(100, (currentDogBoarders / 50) * 100)}%` }} />
              </div>
            </div>
          </div>
        </Link>

        <Link href={`/${locale}/admin/reservations?status=PENDING`}>
          <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-4 shadow-card hover:shadow-card-hover transition-shadow">
            <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center mb-3">
              <Clock className="h-5 w-5 text-amber-500" />
            </div>
            <div className="text-xl font-bold text-charcoal">{pendingBookings}</div>
            <div className="text-xs text-gray-500 mt-0.5">{l.pending}</div>
          </div>
        </Link>

        <Link href={`/${locale}/admin/clients`}>
          <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-4 shadow-card hover:shadow-card-hover transition-shadow">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center mb-3">
              <Users className="h-5 w-5 text-blue-500" />
            </div>
            <div className="text-xl font-bold text-charcoal">{totalClients}</div>
            <div className="text-xs text-gray-500 mt-0.5">{l.totalClients}</div>
          </div>
        </Link>
      </div>

      {/* Row 2 — Service revenues this month */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-gradient-to-br from-[#FBF5E0] to-[#FDF8EC] rounded-xl border border-[#E2C048]/30 p-4 shadow-card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gold-700 uppercase tracking-wide">{l.pension}</span>
            <Calendar className="h-4 w-4 text-gold-500" />
          </div>
          <div className="text-2xl font-bold text-gold-800">{formatMAD(monthlyBoardingRevenue)}</div>
          <div className="text-xs text-gold-600 mt-1">{l.thisMth}</div>
        </div>

        <div className="bg-gradient-to-br from-[#EBF4FF] to-[#F0F7FF] rounded-xl border border-blue-200/50 p-4 shadow-card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-blue-700 uppercase tracking-wide">{l.taxi}</span>
            <Car className="h-4 w-4 text-blue-500" />
          </div>
          <div className="text-2xl font-bold text-blue-800">{formatMAD(monthlyTaxiRevenue)}</div>
          <div className="text-xs text-blue-600 mt-1">{l.thisMth}</div>
        </div>

        <div className="bg-gradient-to-br from-[#F3EEFF] to-[#F7F2FF] rounded-xl border border-purple-200/50 p-4 shadow-card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-purple-700 uppercase tracking-wide">{l.grooming}</span>
            <Scissors className="h-4 w-4 text-purple-500" />
          </div>
          <div className="text-2xl font-bold text-purple-800">{formatMAD(monthlyGroomingRevenue)}</div>
          <div className="text-xs text-purple-600 mt-1">{l.thisMth}</div>
        </div>
      </div>

      {/* Chart + Recent bookings */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl border border-[#F0D98A]/40 p-6 shadow-card">
          <h2 className="font-semibold text-charcoal mb-4">{l.revenueTitle}</h2>
          <RevenueChartWrapper data={chartData} locale={locale} />
        </div>

        <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-6 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-charcoal">{l.recentBookings}</h2>
            <Link href={`/${locale}/admin/reservations`} className="text-xs text-gold-600 hover:underline">{l.viewAll}</Link>
          </div>
          <div className="space-y-3">
            {recentBookings.map(booking => (
              <Link key={booking.id} href={`/${locale}/admin/reservations/${booking.id}`}>
                <div className="flex items-center justify-between py-2 border-b border-ivory-100 last:border-0 hover:bg-ivory-50 -mx-2 px-2 rounded transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-charcoal truncate">
                      {booking.client.name || booking.client.email}
                    </p>
                    <p className="text-xs text-gray-400">{booking.bookingPets.map(bp => bp.pet.name).join(', ')}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ml-2 flex-shrink-0 ${statusColors[booking.status] || 'bg-gray-100 text-gray-600'}`}>
                    {sl[booking.status] || booking.status}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Top 5 clients */}
      {topClients.length > 0 && (
        <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card mt-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-charcoal">{l.top5}</h2>
            <Link href={`/${locale}/admin/clients`} className="text-xs text-gold-600 hover:underline">{l.viewAll}</Link>
          </div>
          <div className="space-y-3">
            {topClients.map((client, i) => (
              <Link key={client.id} href={`/${locale}/admin/clients/${client.id}`}>
                <div className="flex items-center gap-3 py-2 hover:bg-ivory-50 -mx-2 px-2 rounded transition-colors">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{ background: ['#C9A84C','#9CA3AF','#CD7F32','#E5E7EB','#E5E7EB'][i], color: i < 3 ? '#fff' : '#374151' }}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-charcoal truncate">{client.name}</p>
                    <p className="text-xs text-gray-400 truncate">{client.email}</p>
                  </div>
                  <span className="text-sm font-semibold text-gold-700 flex-shrink-0">{formatMAD(client.totalRevenue)}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Row 3 — Client insights */}
      <div className="grid grid-cols-2 gap-4 mt-6">
        <Link href={`/${locale}/admin/clients`}>
          <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card hover:shadow-card-hover transition-shadow flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
              <Star className="h-6 w-6 text-amber-500" />
            </div>
            <div>
              <div className="text-2xl font-bold text-charcoal">{loyalClients}</div>
              <div className="text-sm text-gray-500">{l.loyalClients}</div>
            </div>
          </div>
        </Link>

        <Link href={`/${locale}/admin/clients`}>
          <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card hover:shadow-card-hover transition-shadow flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center flex-shrink-0">
              <UserPlus className="h-6 w-6 text-green-500" />
            </div>
            <div>
              <div className="text-2xl font-bold text-charcoal">{newClientsThisMonth}</div>
              <div className="text-sm text-gray-500">{l.newClients}</div>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
