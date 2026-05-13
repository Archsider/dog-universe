import { Suspense } from 'react';
import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { Users, Calendar, TrendingUp, Clock, AlertCircle, Scissors, Car, Star, UserPlus, Package, CalendarOff, MessageSquare } from 'lucide-react';
import { formatMAD } from '@/lib/utils';
import { startOfMonth, endOfMonth, subMonths } from 'date-fns';
import {
  totalCashCollected,
  billedByCategory,
  deltaPercent,
  currentBoarders,
  pendingBookingsCount,
  newClientsCount,
} from '@/lib/metrics';
import DashboardActivity from './sections/DashboardActivity';
import DashboardCheckInOut from './sections/DashboardCheckInOut';
import DashboardLowerSections from './sections/DashboardLowerSections';
import DashboardKpiList, { type KpiListItem } from './sections/DashboardKpiList';
import { SectionSkeleton } from './sections/SectionSkeleton';
import { safeClientWhere } from '@/lib/queries/safe-where';
import { toNumber } from '@/lib/decimal';

// Cache ISR — revalidation toutes les 60 s. Les actions admin (PATCH bookings,
// invoices) appellent revalidateTag('admin-counts') pour invalider en cas de
// mutation, donc 60 s ne fait que limiter les hits DB sur lectures bulk.
export const revalidate = 60;

interface PageProps { params: Promise<{ locale: string }> }

export default async function AdminDashboardPage({ params }: PageProps) {
  const { locale } = await params;
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) redirect(`/${locale}/auth/login`);

  const now = new Date();
  const thisMonthStart = startOfMonth(now);
  const thisMonthEnd = endOfMonth(now);
  const lastMonthStart = startOfMonth(subMonths(now, 1));
  const lastMonthEnd = endOfMonth(subMonths(now, 1));

  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  // Shared filters for the unbilled-bookings & pending-invoices KPI lists.
  const unbilledWhere = {
    status: 'COMPLETED' as const,
    invoice: null,
    deletedAt: null,
  };
  const pendingInvoiceStatuses = ['PENDING', 'PARTIALLY_PAID'] as const;
  const pendingInvoiceWhere = {
    status: { in: [...pendingInvoiceStatuses] },
    issuedAt: { gte: oneYearAgo },
  };

  const [
    totalClients,
    pendingBookings,
    boarders,
    thisCash,
    lastCash,
    loyalClientsGroups,
    newClients,
    pendingInvoicesAgg,
    pendingInvoicesList,
    unbilledBookingsCount,
    unbilledBookingsList,
    thisMonthHistorical,
    lastMonthHistorical,
    thisBilled,
    lastBilled,
    petsWithoutDob,
    reviewStats,
    capacitySettings,
  ] = await Promise.all([
    prisma.user.count({ where: { role: 'CLIENT', isWalkIn: false } }),
    pendingBookingsCount(),
    currentBoarders(),
    totalCashCollected(thisMonthStart, thisMonthEnd),
    totalCashCollected(lastMonthStart, lastMonthEnd),
    prisma.booking.groupBy({
      by: ['clientId'],
      where: {
        deletedAt: null, // soft-delete: required — no global extension (Edge Runtime incompatible)
        client: { isWalkIn: false },
      },
      _count: { clientId: true },
      having: { clientId: { _count: { gt: 1 } } },
    }),
    newClientsCount(thisMonthStart, thisMonthEnd, true),
    prisma.invoice.aggregate({
      // Cap à 12 mois pour borner la lecture (un PENDING vieux d'un an n'a plus
      // de valeur indicateur — il devrait être en relance overdue).
      where: pendingInvoiceWhere,
      _sum: { amount: true, paidAmount: true },
      _count: { id: true },
    }),
    prisma.invoice.findMany({
      where: pendingInvoiceWhere,
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: {
        id: true,
        amount: true,
        paidAmount: true,
        createdAt: true,
        clientDisplayName: true,
        client: { select: { firstName: true, lastName: true, name: true } },
        booking: {
          select: {
            id: true,
            bookingPets: {
              select: { pet: { select: { name: true } } },
              take: 3,
            },
          },
        },
      },
    }),
    prisma.booking.count({ where: unbilledWhere }),
    prisma.booking.findMany({
      where: unbilledWhere,
      orderBy: { endDate: 'desc' },
      take: 3,
      select: {
        id: true,
        endDate: true,
        totalPrice: true,
        client: { select: { firstName: true, lastName: true, name: true } },
        bookingPets: {
          select: { pet: { select: { name: true } } },
          take: 3,
        },
      },
    }),
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
    prisma.pet.count({
      where: {
        dateOfBirth: null,
        deletedAt: null,
        owner: { isWalkIn: false },
      },
    }),
    prisma.review.aggregate({
      where: {
        createdAt: { gte: thirtyDaysAgo },
        booking: { deletedAt: null, client: safeClientWhere },
      },
      _avg: { rating: true },
      _count: { id: true },
    }),
    prisma.setting.findMany({
      where: { key: { in: ['capacity_dog', 'capacity_cat'] } },
    }),
  ]);

  const { cat: currentCatBoarders, dog: currentDogBoarders } = boarders;

  const capMap = Object.fromEntries(capacitySettings.map(s => [s.key, parseInt(s.value, 10)]));
  const capacityDog = capMap.capacity_dog ?? 50;
  const capacityCat = capMap.capacity_cat ?? 10;

  // CA global — paiements réels + données historiques manuelles
  const thisHistAmt = thisMonthHistorical
    ? Number(thisMonthHistorical.boardingRevenue) + Number(thisMonthHistorical.groomingRevenue) + Number(thisMonthHistorical.taxiRevenue) + Number(thisMonthHistorical.otherRevenue)
    : 0;
  const lastHistAmt = lastMonthHistorical
    ? Number(lastMonthHistorical.boardingRevenue) + Number(lastMonthHistorical.groomingRevenue) + Number(lastMonthHistorical.taxiRevenue) + Number(lastMonthHistorical.otherRevenue)
    : 0;
  // Fallback only-if-zero — cohérent avec cashByMonth (lib/metrics.ts) :
  // les paiements réels priment sur les saisies historiques manuelles.
  // L'addition aveugle double-comptait les mois où l'on a saisi à la fois la
  // synthèse historique ET les paiements réels.
  const thisAmt = thisCash > 0 ? thisCash : thisHistAmt;
  const lastAmt = lastCash > 0 ? lastCash : lastHistAmt;
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

  // Graphe 12 mois et top clients : streamés via <Suspense> (DashboardActivity / DashboardLowerSections)
  const loyalClients = loyalClientsGroups.length;
  const pendingInvoicesUnpaid =
    toNumber(pendingInvoicesAgg._sum.amount ?? 0) - toNumber(pendingInvoicesAgg._sum.paidAmount ?? 0);
  const pendingInvoicesCount = pendingInvoicesAgg._count.id ?? 0;

  // ── KPI list item builders ──────────────────────────────────────────────
  const fr = locale !== 'en';
  const dateFmt = new Intl.DateTimeFormat(fr ? 'fr-MA' : 'en-GB', { day: '2-digit', month: 'short' });
  type ClientLike = { firstName: string | null; lastName: string | null; name: string | null } | null;
  function clientLabel(c: ClientLike, displayOverride?: string | null): string {
    if (displayOverride && displayOverride.trim()) return displayOverride.trim();
    if (!c) return fr ? 'Client' : 'Client';
    const fl = `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim();
    return fl || c.name || (fr ? 'Client' : 'Client');
  }
  function petsLabel(pets: { pet: { name: string } }[]): string {
    if (pets.length === 0) return '—';
    return pets.map(p => p.pet.name).join(', ');
  }

  const unbilledItems: KpiListItem[] = unbilledBookingsList.map((b) => ({
    id: b.id,
    href: `/${locale}/admin/reservations/${b.id}`,
    primary: clientLabel(b.client),
    secondary: petsLabel(b.bookingPets),
    tertiary: b.endDate ? dateFmt.format(b.endDate) : undefined,
    quaternary: formatMAD(b.totalPrice),
  }));

  const pendingInvoiceItems: KpiListItem[] = pendingInvoicesList.map((inv) => {
    const balance = toNumber(inv.amount) - toNumber(inv.paidAmount);
    return {
      id: inv.id,
      href: `/${locale}/admin/invoices/${inv.id}`,
      primary: clientLabel(inv.client, inv.clientDisplayName),
      secondary: inv.booking ? petsLabel(inv.booking.bookingPets) : undefined,
      tertiary: dateFmt.format(inv.createdAt),
      quaternary: formatMAD(balance),
    };
  });

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
      allInvoiced: 'Tout est facturé',
      noPendingPayments: 'Aucun encaissement en attente',
      viewAllShort: 'Voir tout',
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
      noInvoice: 'Bookings without invoice',
      allInvoiced: 'All invoiced',
      noPendingPayments: 'No pending payments',
      viewAllShort: 'View all',
      checkInsToday: 'Check-ins today',
      checkOutsToday: 'Check-outs today',
      noMovement: 'No movement',
    },
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

      {petsWithoutDob > 0 && (
        <Link href={`/${locale}/admin/animals?missingDob=true`}>
          <div className="mb-6 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 hover:bg-amber-100 transition-colors cursor-pointer">
            <CalendarOff className="h-5 w-5 text-amber-500 flex-shrink-0" />
            <span className="text-amber-700 font-medium">
              {petsWithoutDob} {locale === 'fr'
                ? `animal${petsWithoutDob > 1 ? 'aux' : ''} sans date de naissance — affecter les anniversaires`
                : `pet${petsWithoutDob > 1 ? 's' : ''} without date of birth — assign birthdays`}
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

      {/* Reviews KPI card */}
      {reviewStats._count.id > 0 && (
        <div className="mb-4">
          <Link href={`/${locale}/admin/reviews`}>
            <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-4 shadow-card hover:shadow-card-hover transition-shadow flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-gold-50 flex items-center justify-center flex-shrink-0">
                <Star className="h-5 w-5 text-gold-500" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold text-charcoal">{(reviewStats._avg.rating ?? 0).toFixed(1)}</span>
                  <div className="flex gap-0.5">
                    {[1,2,3,4,5].map(s => (
                      <Star key={s} className={`h-3.5 w-3.5 ${s <= Math.round(reviewStats._avg.rating ?? 0) ? 'text-gold-500 fill-gold-500' : 'text-gray-200 fill-gray-200'}`} />
                    ))}
                  </div>
                  <span className="text-xs text-gray-400">({reviewStats._count.id} {locale === 'fr' ? 'avis' : 'reviews'} — 30j)</span>
                </div>
                <div className="text-xs text-gray-500 mt-0.5">{locale === 'fr' ? 'Note moyenne — 30 derniers jours' : 'Average rating — last 30 days'}</div>
              </div>
              <MessageSquare className="h-4 w-4 text-gray-400 flex-shrink-0" />
            </div>
          </Link>
        </div>
      )}

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

      {/* Row 2b — Finance alerts: actionable mini-lists */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <DashboardKpiList
          title={l.noInvoice}
          count={unbilledBookingsCount}
          items={unbilledItems}
          viewAllHref={`/${locale}/admin/reservations?noInvoice=1`}
          viewAllLabel={l.viewAllShort}
          emptyMessage={l.allInvoiced}
          severity={unbilledBookingsCount > 0 ? 'warning' : 'neutral'}
          variant="unbilled"
        />
        <DashboardKpiList
          title={l.pendingInvoices}
          count={pendingInvoicesCount}
          totalSummary={pendingInvoicesCount > 0 ? formatMAD(pendingInvoicesUnpaid) : undefined}
          items={pendingInvoiceItems}
          viewAllHref={`/${locale}/admin/billing?status=PENDING`}
          viewAllLabel={l.viewAllShort}
          emptyMessage={l.noPendingPayments}
          severity={pendingInvoicesCount > 0 ? 'warning' : 'neutral'}
          variant="pending-invoices"
        />
      </div>

      {/* Arrivées / Départs du jour — streamé via Suspense, indépendant des KPIs */}
      <Suspense fallback={<div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6 animate-pulse"><div className="bg-white rounded-xl border border-gray-200 p-5 h-32" /><div className="bg-white rounded-xl border border-gray-200 p-5 h-32" /></div>}>
        <DashboardCheckInOut
          locale={locale}
          labels={{ checkInsToday: l.checkInsToday, checkOutsToday: l.checkOutsToday, noMovement: l.noMovement }}
        />
      </Suspense>

      {/* Chart + Recent bookings — streamed via Suspense, KPIs render first */}
      <Suspense fallback={<SectionSkeleton height="h-72" />}>
        <DashboardActivity
          locale={locale}
          labels={{ recentBookings: l.recentBookings, viewAll: l.viewAll, revenueTitle: l.revenueTitle }}
          statusLabels={sl}
        />
      </Suspense>

      {/* Top 5 clients — streamed via Suspense */}
      <Suspense fallback={<SectionSkeleton height="h-48" />}>
        <DashboardLowerSections locale={locale} labels={{ top5: l.top5, viewAll: l.viewAll }} />
      </Suspense>

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
