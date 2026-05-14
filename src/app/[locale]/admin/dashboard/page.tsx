// Slim orchestrator — see _lib/ and _components/ for the extracted helpers
// and section components.
//
// File went from 563 LOC to ~280 by extracting:
//   - _lib/labels.ts                 (FR/EN dictionaries — 95L)
//   - _components/AlertBanners.tsx   (pending + missing-dob amber alerts — 50L)
//   - _components/MainKpis.tsx       (Row 1: 4 KPI cards — 120L)
//   - _components/ServiceRevenues.tsx (Row 2: 4 service cards — 130L)
//   - _components/ClientInsights.tsx (Row 3: loyal + new clients — 45L)
//
// What stays here: the 18-table Promise.all (centralised so tx ordering and
// caps are visible together), the KPI list item builders, the JSX shell that
// wires the section components into the dashboard layout. Suspense
// streaming for activity / check-in-out / lower sections is preserved.

import { Suspense } from 'react';
import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import { Star, MessageSquare } from 'lucide-react';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { formatMAD } from '@/lib/utils';
import { subMonths } from 'date-fns';
import { startOfMonthCasa, endOfMonthCasa } from '@/lib/dates-casablanca';
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
import { notDeleted } from '@/lib/prisma-soft';
import { getDashboardLabels, getDashboardStatusLabels } from './_lib/labels';
import { AlertBanners } from './_components/AlertBanners';
import { MainKpis } from './_components/MainKpis';
import { ServiceRevenues } from './_components/ServiceRevenues';
import { ClientInsights } from './_components/ClientInsights';

// Cache ISR — revalidation toutes les 60 s. Les actions admin (PATCH bookings,
// invoices) appellent revalidateTag('admin-counts') pour invalider en cas de
// mutation.
export const revalidate = 60;

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function AdminDashboardPage({ params }: PageProps) {
  const { locale } = await params;
  const session = await auth();
  if (
    !session?.user ||
    (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')
  ) {
    redirect(`/${locale}/auth/login`);
  }

  const now = new Date();
  // Month bounds in Africa/Casablanca (UTC+1 fixed). Pre-fix this used
  // date-fns `startOfMonth(new Date())` which snaps to the UTC local
  // month — at 00:30 Casa on the 1st of a month, UTC was still the
  // previous month, so the dashboard showed "ce mois" stats from the
  // wrong month for ~1h. See ADR-0008 / src/lib/dates-casablanca.ts.
  const thisMonthStart = startOfMonthCasa(now);
  const thisMonthEnd = endOfMonthCasa(now);
  const lastMonthStart = startOfMonthCasa(subMonths(now, 1));
  const lastMonthEnd = endOfMonthCasa(subMonths(now, 1));

  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  // Shared filters for the unbilled-bookings & pending-invoices KPI lists.
  const unbilledWhere = notDeleted({
    status: 'COMPLETED' as const,
    invoice: null,
  });
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
      where: notDeleted({ client: { isWalkIn: false } }),
      _count: { clientId: true },
      having: { clientId: { _count: { gt: 1 } } },
    }),
    newClientsCount(thisMonthStart, thisMonthEnd, true),
    prisma.invoice.aggregate({
      // Cap à 12 mois pour borner la lecture (un PENDING vieux d'un an n'a
      // plus de valeur indicateur — il devrait être en relance overdue).
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
    prisma.monthlyRevenueSummary
      .findFirst({
        where: { year: thisMonthStart.getFullYear(), month: thisMonthStart.getMonth() + 1 },
        select: {
          boardingRevenue: true,
          groomingRevenue: true,
          taxiRevenue: true,
          otherRevenue: true,
        },
      })
      .catch(() => null),
    prisma.monthlyRevenueSummary
      .findFirst({
        where: { year: lastMonthStart.getFullYear(), month: lastMonthStart.getMonth() + 1 },
        select: {
          boardingRevenue: true,
          groomingRevenue: true,
          taxiRevenue: true,
          otherRevenue: true,
        },
      })
      .catch(() => null),
    billedByCategory(thisMonthStart, thisMonthEnd),
    billedByCategory(lastMonthStart, lastMonthEnd),
    prisma.pet.count({
      where: notDeleted({
        dateOfBirth: null,
        owner: { isWalkIn: false },
      }),
    }),
    prisma.review.aggregate({
      where: {
        createdAt: { gte: thirtyDaysAgo },
        booking: notDeleted({ client: safeClientWhere }),
      },
      _avg: { rating: true },
      _count: { id: true },
    }),
    prisma.setting.findMany({
      where: { key: { in: ['capacity_dog', 'capacity_cat'] } },
    }),
  ]);

  const { cat: currentCatBoarders, dog: currentDogBoarders } = boarders;

  const capMap = Object.fromEntries(
    capacitySettings.map((s) => [s.key, parseInt(s.value, 10)]),
  );
  const capacityDog = capMap.capacity_dog ?? 50;
  const capacityCat = capMap.capacity_cat ?? 10;

  // CA global — paiements réels priment sur saisies historiques manuelles.
  // Voir cashByMonth (lib/metrics.ts) pour la logique fallback only-if-zero.
  const sumHist = (h: typeof thisMonthHistorical) =>
    h
      ? Number(h.boardingRevenue) +
        Number(h.groomingRevenue) +
        Number(h.taxiRevenue) +
        Number(h.otherRevenue)
      : 0;
  const thisAmt = thisCash > 0 ? thisCash : sumHist(thisMonthHistorical);
  const lastAmt = lastCash > 0 ? lastCash : sumHist(lastMonthHistorical);
  const delta = deltaPercent(thisAmt, lastAmt);

  // Service cards — billed family (item.total, PAID+PARTIALLY_PAID, issuedAt).
  const boardingDelta = deltaPercent(thisBilled.boarding, lastBilled.boarding);
  const taxiDelta = deltaPercent(thisBilled.taxi, lastBilled.taxi);
  const groomingDelta = deltaPercent(thisBilled.grooming, lastBilled.grooming);
  const croquettesDelta = deltaPercent(thisBilled.croquettes, lastBilled.croquettes);

  const loyalClients = loyalClientsGroups.length;
  const pendingInvoicesUnpaid =
    toNumber(pendingInvoicesAgg._sum.amount ?? 0) -
    toNumber(pendingInvoicesAgg._sum.paidAmount ?? 0);
  const pendingInvoicesCount = pendingInvoicesAgg._count.id ?? 0;

  // ── KPI list item builders ────────────────────────────────────────────
  const fr = locale !== 'en';
  const dateFmt = new Intl.DateTimeFormat(fr ? 'fr-MA' : 'en-GB', {
    day: '2-digit',
    month: 'short',
  });
  type ClientLike = {
    firstName: string | null;
    lastName: string | null;
    name: string | null;
  } | null;
  function clientLabel(c: ClientLike, displayOverride?: string | null): string {
    if (displayOverride && displayOverride.trim()) return displayOverride.trim();
    if (!c) return fr ? 'Client' : 'Client';
    const fl = `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim();
    return fl || c.name || (fr ? 'Client' : 'Client');
  }
  function petsLabel(pets: { pet: { name: string } }[]): string {
    if (pets.length === 0) return '—';
    return pets.map((p) => p.pet.name).join(', ');
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

  const labels = getDashboardLabels(locale);
  const statusLabels = getDashboardStatusLabels(locale);

  const monthName = now.toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', {
    month: 'long',
    year: 'numeric',
  });
  const variationColor =
    delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-500' : 'text-gray-400';

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-serif font-bold text-charcoal">{labels.title}</h1>
        <p className="text-sm text-charcoal/50 mt-0.5 capitalize">
          {locale === 'fr' ? "Vue d'ensemble" : 'Overview'} — {monthName}
        </p>
      </div>

      <AlertBanners
        locale={locale}
        pendingBookings={pendingBookings}
        petsWithoutDob={petsWithoutDob}
      />

      <MainKpis
        locale={locale}
        labels={labels}
        thisAmt={thisAmt}
        delta={delta}
        variationColor={variationColor}
        currentCatBoarders={currentCatBoarders}
        currentDogBoarders={currentDogBoarders}
        capacityCat={capacityCat}
        capacityDog={capacityDog}
        pendingBookings={pendingBookings}
        totalClients={totalClients}
      />

      {/* Reviews KPI — small inline card; only renders when at least one
          review exists in the last 30 days. */}
      {reviewStats._count.id > 0 && (
        <div className="mb-4">
          <Link href={`/${locale}/admin/reviews`}>
            <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-4 shadow-card hover:shadow-card-hover transition-shadow flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-gold-50 flex items-center justify-center flex-shrink-0">
                <Star className="h-5 w-5 text-gold-500" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold text-charcoal">
                    {(reviewStats._avg.rating ?? 0).toFixed(1)}
                  </span>
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        className={`h-3.5 w-3.5 ${
                          s <= Math.round(reviewStats._avg.rating ?? 0)
                            ? 'text-gold-500 fill-gold-500'
                            : 'text-gray-200 fill-gray-200'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-xs text-gray-400">
                    ({reviewStats._count.id}{' '}
                    {locale === 'fr' ? 'avis' : 'reviews'} — 30j)
                  </span>
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {locale === 'fr'
                    ? 'Note moyenne — 30 derniers jours'
                    : 'Average rating — last 30 days'}
                </div>
              </div>
              <MessageSquare className="h-4 w-4 text-gray-400 flex-shrink-0" />
            </div>
          </Link>
        </div>
      )}

      <ServiceRevenues
        labels={labels}
        monthlyBoardingRevenue={thisBilled.boarding}
        monthlyTaxiRevenue={thisBilled.taxi}
        monthlyGroomingRevenue={thisBilled.grooming}
        monthlyCroquettesRevenue={thisBilled.croquettes}
        boardingDelta={boardingDelta}
        taxiDelta={taxiDelta}
        groomingDelta={groomingDelta}
        croquettesDelta={croquettesDelta}
        hadBoardingLastMonth={lastBilled.boarding > 0}
        hadTaxiLastMonth={lastBilled.taxi > 0}
        hadGroomingLastMonth={lastBilled.grooming > 0}
        hadCroquettesLastMonth={lastBilled.croquettes > 0}
      />

      {/* Row 2b — Finance alerts: actionable mini-lists */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <DashboardKpiList
          title={labels.noInvoice}
          count={unbilledBookingsCount}
          items={unbilledItems}
          viewAllHref={`/${locale}/admin/reservations?noInvoice=1`}
          viewAllLabel={labels.viewAllShort}
          emptyMessage={labels.allInvoiced}
          severity={unbilledBookingsCount > 0 ? 'warning' : 'neutral'}
          variant="unbilled"
        />
        <DashboardKpiList
          title={labels.pendingInvoices}
          count={pendingInvoicesCount}
          totalSummary={
            pendingInvoicesCount > 0 ? formatMAD(pendingInvoicesUnpaid) : undefined
          }
          items={pendingInvoiceItems}
          viewAllHref={`/${locale}/admin/billing?status=PENDING`}
          viewAllLabel={labels.viewAllShort}
          emptyMessage={labels.noPendingPayments}
          severity={pendingInvoicesCount > 0 ? 'warning' : 'neutral'}
          variant="pending-invoices"
        />
      </div>

      {/* Arrivées / Départs du jour — streamé via Suspense */}
      <Suspense
        fallback={
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6 animate-pulse">
            <div className="bg-white rounded-xl border border-gray-200 p-5 h-32" />
            <div className="bg-white rounded-xl border border-gray-200 p-5 h-32" />
          </div>
        }
      >
        <DashboardCheckInOut
          locale={locale}
          labels={{
            checkInsToday: labels.checkInsToday,
            checkOutsToday: labels.checkOutsToday,
            noMovement: labels.noMovement,
          }}
        />
      </Suspense>

      {/* Chart + Recent bookings — streamed via Suspense */}
      <Suspense fallback={<SectionSkeleton height="h-72" />}>
        <DashboardActivity
          locale={locale}
          labels={{
            recentBookings: labels.recentBookings,
            viewAll: labels.viewAll,
            revenueTitle: labels.revenueTitle,
          }}
          statusLabels={statusLabels}
        />
      </Suspense>

      {/* Top 5 clients — streamed via Suspense */}
      <Suspense fallback={<SectionSkeleton height="h-48" />}>
        <DashboardLowerSections
          locale={locale}
          labels={{ top5: labels.top5, viewAll: labels.viewAll }}
        />
      </Suspense>

      <ClientInsights
        locale={locale}
        labels={labels}
        loyalClients={loyalClients}
        newClients={newClients}
      />
    </div>
  );
}
