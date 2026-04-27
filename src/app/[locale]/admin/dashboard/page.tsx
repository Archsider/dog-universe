import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { Users, Calendar, TrendingUp, Clock, AlertCircle, Scissors, Car, Star, UserPlus, FileWarning, Receipt, LogIn, LogOut, Package } from 'lucide-react';
import { formatMAD } from '@/lib/utils';
import RevenueChartWrapper from './RevenueChartWrapper';
import { startOfMonth, endOfMonth, subMonths } from 'date-fns';
import {
  totalCashCollected,
  cashByMonth,
  billedByCategory,
  deltaPercent,
  currentBoarders,
  pendingBookingsCount,
  newClientsCount,
} from '@/lib/metrics';

interface PageProps { params: Promise<{ locale: string }> }

export default async function AdminDashboardPage({ params }: PageProps) {
  const { locale } = await params;
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) redirect(`/${locale}/auth/login`);

  const now = new Date();
  const currentYear = now.getFullYear();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  const thisMonthStart = startOfMonth(now);
  const thisMonthEnd = endOfMonth(now);
  const lastMonthStart = startOfMonth(subMonths(now, 1));
  const lastMonthEnd = endOfMonth(subMonths(now, 1));

  const [
    totalClients,
    pendingBookings,
    boarders,
    thisCash,
    lastCash,
    recentBookings,
    lastYearMonthly,
    currentYearMonthly,
    loyalClientsGroups,
    newClients,
    top5Revenue,
    pendingInvoicesAgg,
    bookingsWithoutInvoice,
    todayCheckIns,
    todayCheckOuts,
    historicalSummaries,
    thisMonthHistorical,
    lastMonthHistorical,
    thisBilled,
    lastBilled,
  ] = await Promise.all([
    prisma.user.count({ where: { role: 'CLIENT', isWalkIn: false } }),
    pendingBookingsCount(),
    currentBoarders(),
    totalCashCollected(thisMonthStart, thisMonthEnd),
    totalCashCollected(lastMonthStart, lastMonthEnd),
    prisma.booking.findMany({
      where: { deletedAt: null },
      include: {
        client: { select: { name: true, email: true } },
        bookingPets: { include: { pet: { select: { name: true } } } },
      },
      orderBy: { startDate: 'desc' },
      take: 8,
    }),
    cashByMonth(currentYear - 1),
    cashByMonth(currentYear),
    prisma.booking.groupBy({
      by: ['clientId'],
      where: { deletedAt: null },
      _count: { clientId: true },
      having: { clientId: { _count: { gt: 1 } } },
    }),
    newClientsCount(thisMonthStart, thisMonthEnd, true),
    prisma.invoice.groupBy({
      by: ['clientId'],
      where: { status: { in: ['PAID', 'PARTIALLY_PAID'] } },
      _sum: { paidAmount: true },
      orderBy: { _sum: { paidAmount: 'desc' } },
      take: 5,
    }),
    prisma.invoice.aggregate({
      where: { status: 'PENDING' },
      _sum: { amount: true },
      _count: { id: true },
    }),
    prisma.booking.count({
      where: {
        status: { in: ['CONFIRMED', 'COMPLETED', 'IN_PROGRESS'] },
        invoice: null,
        deletedAt: null,
      },
    }),
    prisma.booking.findMany({
      where: {
        serviceType: 'BOARDING',
        status: { in: ['CONFIRMED', 'PENDING'] },
        startDate: { gte: todayStart, lte: todayEnd },
        deletedAt: null,
      },
      include: {
        client: { select: { name: true } },
        bookingPets: { include: { pet: { select: { name: true, species: true } } } },
      },
      orderBy: { arrivalTime: 'asc' },
    }),
    prisma.booking.findMany({
      where: {
        serviceType: 'BOARDING',
        status: { in: ['CONFIRMED', 'IN_PROGRESS'] },
        endDate: { gte: todayStart, lte: todayEnd },
        deletedAt: null,
      },
      include: {
        client: { select: { name: true } },
        bookingPets: { include: { pet: { select: { name: true, species: true } } } },
      },
    }),
    prisma.monthlyRevenueSummary.findMany({
      select: { year: true, month: true, boardingRevenue: true, groomingRevenue: true, taxiRevenue: true, otherRevenue: true },
    }).catch(() => [] as { year: number; month: number; boardingRevenue: number; groomingRevenue: number; taxiRevenue: number; otherRevenue: number }[]),
    prisma.monthlyRevenueSummary.findFirst({
      where: { year: thisMonthStart.getFullYear(), month: thisMonthStart.getMonth() + 1 },
      select: { boardingRevenue: true, groomingRevenue: true, taxiRevenue: true, otherRevenue: true },
    }).catch(() => null),
    prisma.monthlyRevenueSummary.findFirst({
      where: { year: lastMonthStart.getFullYear(), month: lastMonthStart.getMonth() + 1 },
      select: { boardingRevenue: true, groomingRevenue: true, taxiRevenue: true, otherRevenue: true },
    }).catch(() => null),
    billedByCategory(thisMonthStart, thisMonthEnd),
    billedByCategory(lastMonthStart, lastMonthEnd),
  ]);

  const { cat: currentCatBoarders, dog: currentDogBoarders } = boarders;

  const capacitySettings = await prisma.setting.findMany({
    where: { key: { in: ['capacity_dog', 'capacity_cat'] } },
  });
  const capMap = Object.fromEntries(capacitySettings.map(s => [s.key, parseInt(s.value, 10)]));
  const capacityDog = capMap.capacity_dog ?? 50;
  const capacityCat = capMap.capacity_cat ?? 10;

  const top5Users = await prisma.user.findMany({
    where: { id: { in: top5Revenue.map(r => r.clientId) } },
    select: { id: true, name: true, email: true },
  });
  const topClients = top5Revenue.map(r => ({
    id: r.clientId,
    name: top5Users.find(u => u.id === r.clientId)?.name ?? r.clientId,
    email: top5Users.find(u => u.id === r.clientId)?.email ?? '',
    totalRevenue: r._sum.paidAmount ?? 0,
  }));

  // CA global — paiements réels + données historiques manuelles
  const thisHistAmt = thisMonthHistorical
    ? thisMonthHistorical.boardingRevenue + thisMonthHistorical.groomingRevenue + thisMonthHistorical.taxiRevenue + thisMonthHistorical.otherRevenue
    : 0;
  const lastHistAmt = lastMonthHistorical
    ? lastMonthHistorical.boardingRevenue + lastMonthHistorical.groomingRevenue + lastMonthHistorical.taxiRevenue + lastMonthHistorical.otherRevenue
    : 0;
  const thisAmt = thisCash + thisHistAmt;
  const lastAmt = lastCash + lastHistAmt;
  const delta = deltaPercent(thisAmt, lastAmt);

  // Cartes service — billed family (item.total, PAID+PARTIALLY_PAID, issuedAt)
  const monthlyBoardingRevenue   = thisBilled.boarding;
  const monthlyTaxiRevenue       = thisBilled.taxi;
  const monthlyGroomingRevenue   = thisBilled.grooming;
  const monthlyCroquettesRevenue = thisBilled.croquettes;
  const boardingDelta   = deltaPercent(thisBilled.boarding,   lastBilled.boarding);
  const taxiDelta       = deltaPercent(thisBilled.taxi,       lastBilled.taxi);
  const groomingDelta   = deltaPercent(thisBilled.grooming,   lastBilled.grooming);
  const croquettesDelta = deltaPercent(thisBilled.croquettes, lastBilled.croquettes);

  // Graphe 12 mois — cash family (cashByMonth, 2 calendar years combined)
  const chartLocale = locale === 'fr' ? 'fr-FR' : 'en-US';
  const chartData: { month: string; boarding: number; taxi: number; grooming: number; croquettes: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.toLocaleDateString(chartLocale, { month: 'short', year: '2-digit' });
    const yr = d.getFullYear();
    const mo = d.getMonth();
    const entry = yr === currentYear ? currentYearMonthly[mo] : lastYearMonthly[mo];
    chartData.push({ month: key, boarding: entry.boarding, taxi: entry.taxi, grooming: entry.grooming, croquettes: entry.croquettes });
  }
  historicalSummaries.forEach(s => {
    const d = new Date(s.year, s.month - 1, 1);
    const key = d.toLocaleDateString(chartLocale, { month: 'short', year: '2-digit' });
    const existing = chartData.find(c => c.month === key);
    if (existing) {
      existing.boarding += s.boardingRevenue;
      existing.grooming += s.groomingRevenue;
      existing.taxi += s.taxiRevenue;
      existing.croquettes += s.otherRevenue;
    }
  });

  const loyalClients = loyalClientsGroups.length;
  const pendingInvoicesAmount = pendingInvoicesAgg._sum.amount ?? 0;
  const pendingInvoicesCount = pendingInvoicesAgg._count.id ?? 0;

  const labels = {
    fr: {
      title: 'Tableau de bord',
      caMonthly: 'CA mensuel · encaissé',
      animauxHeberges: 'Pension actuelle',
      pending: 'En attente',
      totalClients: 'Total clients',
      pension: 'Pension',
      taxi: 'Taxi animalier',
      grooming: 'Toilettage',
      croquettes: 'Croquettes',
      loyalClients: 'Clients fidèles',
      newClients: 'Nouveaux clients',
      recentBookings: 'Réservations récentes',
      viewAll: 'Voir tout',
      revenueTitle: 'CA mensuel — 12 derniers mois',
      thisMth: 'ce mois · facturé',
      top5: 'Top 5 clients',
      cats: 'Chats',
      dogs: 'Chiens',
      places: 'places',
      revenue: 'CA total',
      pendingInvoices: 'Factures en attente',
      noInvoice: 'Réserv. sans facture',
      checkInsToday: "Arrivées aujourd'hui",
      checkOutsToday: "Départs aujourd'hui",
      noMovement: 'Aucun mouvement',
    },
    en: {
      title: 'Dashboard',
      caMonthly: 'Monthly revenue · collected',
      animauxHeberges: 'Current boarders',
      pending: 'Pending',
      totalClients: 'Total clients',
      pension: 'Boarding',
      taxi: 'Pet taxi',
      grooming: 'Grooming',
      croquettes: 'Croquettes',
      loyalClients: 'Loyal clients',
      newClients: 'New clients',
      recentBookings: 'Recent bookings',
      viewAll: 'View all',
      revenueTitle: 'Monthly revenue — last 12 months',
      thisMth: 'this month · billed',
      top5: 'Top 5 clients',
      cats: 'Cats',
      dogs: 'Dogs',
      places: 'spots',
      revenue: 'Total revenue',
      pendingInvoices: 'Pending invoices',
      noInvoice: 'Bookings w/o invoice',
      checkInsToday: 'Check-ins today',
      checkOutsToday: 'Check-outs today',
      noMovement: 'No movement',
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
  const variationColor = delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-500' : 'text-gray-400';

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
            <div className="text-xl font-bold text-charcoal">{formatMAD(thisAmt)}</div>
            <div className="text-xs text-gray-500 mt-0.5">{l.caMonthly}</div>
            <div className={`text-xs mt-1 font-medium ${variationColor}`}>
              {`${delta > 0 ? '+' : ''}${delta}% vs mois préc.`}
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
                <span className="text-sm font-bold text-charcoal">{currentCatBoarders}<span className="text-xs font-normal text-gray-400"> / {capacityCat}</span></span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full">
                <div className="h-1.5 bg-gold-400 rounded-full transition-all" style={{ width: `${Math.min(100, (currentCatBoarders / capacityCat) * 100)}%` }} />
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-gray-500">🐕 {l.dogs}</span>
                <span className="text-sm font-bold text-charcoal">{currentDogBoarders}<span className="text-xs font-normal text-gray-400"> / {capacityDog}</span></span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full">
                <div className="h-1.5 bg-charcoal rounded-full transition-all" style={{ width: `${Math.min(100, (currentDogBoarders / capacityDog) * 100)}%` }} />
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-gradient-to-br from-[#FBF5E0] to-[#FDF8EC] rounded-xl border border-[#E2C048]/30 p-4 shadow-card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gold-700 uppercase tracking-wide">{l.pension}</span>
            <Calendar className="h-4 w-4 text-gold-500" />
          </div>
          <div className="text-2xl font-bold text-gold-800">{formatMAD(monthlyBoardingRevenue)}</div>
          <div className="text-xs text-gold-600 mt-1 flex items-center gap-1.5">
            {l.thisMth}
            {lastBilled.boarding > 0 && <span className={boardingDelta >= 0 ? 'text-green-600' : 'text-red-400'}>{boardingDelta > 0 ? '+' : ''}{boardingDelta}%</span>}
          </div>
        </div>

        <div className="bg-gradient-to-br from-[#EBF4FF] to-[#F0F7FF] rounded-xl border border-blue-200/50 p-4 shadow-card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-blue-700 uppercase tracking-wide">{l.taxi}</span>
            <Car className="h-4 w-4 text-blue-500" />
          </div>
          <div className="text-2xl font-bold text-blue-800">{formatMAD(monthlyTaxiRevenue)}</div>
          <div className="text-xs text-blue-600 mt-1 flex items-center gap-1.5">
            {l.thisMth}
            {lastBilled.taxi > 0 && <span className={taxiDelta >= 0 ? 'text-green-600' : 'text-red-400'}>{taxiDelta > 0 ? '+' : ''}{taxiDelta}%</span>}
          </div>
        </div>

        <div className="bg-gradient-to-br from-[#F3EEFF] to-[#F7F2FF] rounded-xl border border-purple-200/50 p-4 shadow-card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-purple-700 uppercase tracking-wide">{l.grooming}</span>
            <Scissors className="h-4 w-4 text-purple-500" />
          </div>
          <div className="text-2xl font-bold text-purple-800">{formatMAD(monthlyGroomingRevenue)}</div>
          <div className="text-xs text-purple-600 mt-1 flex items-center gap-1.5">
            {l.thisMth}
            {lastBilled.grooming > 0 && <span className={groomingDelta >= 0 ? 'text-green-600' : 'text-red-400'}>{groomingDelta > 0 ? '+' : ''}{groomingDelta}%</span>}
          </div>
        </div>

        <div className="bg-gradient-to-br from-[#FEF3E2] to-[#FFF8EE] rounded-xl border border-orange-200/50 p-4 shadow-card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-orange-700 uppercase tracking-wide">{l.croquettes}</span>
            <Package className="h-4 w-4 text-orange-500" />
          </div>
          <div className="text-2xl font-bold text-orange-800">{formatMAD(monthlyCroquettesRevenue)}</div>
          <div className="text-xs text-orange-600 mt-1 flex items-center gap-1.5">
            {l.thisMth}
            {lastBilled.croquettes > 0 && <span className={croquettesDelta >= 0 ? 'text-green-600' : 'text-red-400'}>{croquettesDelta > 0 ? '+' : ''}{croquettesDelta}%</span>}
          </div>
        </div>
      </div>

      {/* Row 2b — Finance alerts */}
      {(pendingInvoicesCount > 0 || bookingsWithoutInvoice > 0) && (
        <div className="grid grid-cols-2 gap-4 mb-6">
          {pendingInvoicesCount > 0 && (
            <Link href={`/${locale}/admin/billing?status=PENDING`}>
              <div className="bg-white rounded-xl border border-orange-200/60 p-4 shadow-card hover:shadow-card-hover transition-shadow flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center flex-shrink-0">
                  <Receipt className="h-5 w-5 text-orange-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-lg font-bold text-charcoal">{formatMAD(pendingInvoicesAmount)}</div>
                  <div className="text-xs text-gray-500">{l.pendingInvoices} <span className="font-medium text-orange-600">({pendingInvoicesCount})</span></div>
                </div>
              </div>
            </Link>
          )}
          {bookingsWithoutInvoice > 0 && (
            <Link href={`/${locale}/admin/billing`}>
              <div className="bg-white rounded-xl border border-red-200/60 p-4 shadow-card hover:shadow-card-hover transition-shadow flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
                  <FileWarning className="h-5 w-5 text-red-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-lg font-bold text-charcoal">{bookingsWithoutInvoice}</div>
                  <div className="text-xs text-gray-500">{l.noInvoice}</div>
                </div>
              </div>
            </Link>
          )}
        </div>
      )}

      {/* Arrivées / Départs du jour */}
      {(todayCheckIns.length > 0 || todayCheckOuts.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {/* Check-ins */}
          <div className="bg-white rounded-xl border border-green-200/60 p-5 shadow-card">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center flex-shrink-0">
                <LogIn className="h-4 w-4 text-green-600" />
              </div>
              <h2 className="font-semibold text-charcoal text-sm">{l.checkInsToday}</h2>
              <span className="ml-auto text-xs font-bold text-green-700 bg-green-50 rounded-full px-2 py-0.5">
                {todayCheckIns.length}
              </span>
            </div>
            {todayCheckIns.length === 0 ? (
              <p className="text-xs text-gray-400">{l.noMovement}</p>
            ) : (
              <div className="space-y-2">
                {todayCheckIns.map(b => (
                  <Link key={b.id} href={`/${locale}/admin/reservations/${b.id}`}>
                    <div className="flex items-center gap-2 py-1.5 hover:bg-ivory-50 -mx-2 px-2 rounded transition-colors">
                      <span className="text-base">{b.bookingPets[0]?.pet.species === 'CAT' ? '🐱' : '🐶'}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-charcoal truncate">
                          {b.bookingPets.map(bp => bp.pet.name).join(', ')}
                        </p>
                        <p className="text-xs text-gray-400 truncate">{b.client.name}</p>
                      </div>
                      {b.arrivalTime && (
                        <span className="text-xs text-green-600 font-medium flex-shrink-0">{b.arrivalTime}</span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Check-outs */}
          <div className="bg-white rounded-xl border border-blue-200/60 p-5 shadow-card">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                <LogOut className="h-4 w-4 text-blue-600" />
              </div>
              <h2 className="font-semibold text-charcoal text-sm">{l.checkOutsToday}</h2>
              <span className="ml-auto text-xs font-bold text-blue-700 bg-blue-50 rounded-full px-2 py-0.5">
                {todayCheckOuts.length}
              </span>
            </div>
            {todayCheckOuts.length === 0 ? (
              <p className="text-xs text-gray-400">{l.noMovement}</p>
            ) : (
              <div className="space-y-2">
                {todayCheckOuts.map(b => (
                  <Link key={b.id} href={`/${locale}/admin/reservations/${b.id}`}>
                    <div className="flex items-center gap-2 py-1.5 hover:bg-ivory-50 -mx-2 px-2 rounded transition-colors">
                      <span className="text-base">{b.bookingPets[0]?.pet.species === 'CAT' ? '🐱' : '🐶'}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-charcoal truncate">
                          {b.bookingPets.map(bp => bp.pet.name).join(', ')}
                        </p>
                        <p className="text-xs text-gray-400 truncate">{b.client.name}</p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

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
              <div className="text-2xl font-bold text-charcoal">{newClients}</div>
              <div className="text-sm text-gray-500">{l.newClients}</div>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
