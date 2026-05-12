// /admin/reservations — tabbed workspace (depuis 2026-05-12).
// Tabs: today (default) · upcoming · in-progress · history. URL: ?view=…
// ?booking=<id> opens the side panel without leaving the list.
import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { LayoutList, LayoutGrid, Plus } from 'lucide-react';
import { startOfMonth, endOfMonth, format } from 'date-fns';

import { Prisma, type BookingStatus } from '@prisma/client';
import { ReservationsKanban, type KanbanBooking } from './ReservationsKanban';
import ReservationsList, { type ReservationRow } from './ReservationsList';
import { toNumber } from '@/lib/decimal';
import { getMonthlyInvoicesWhere } from '@/lib/billing';
import { getPricingSettings } from '@/lib/pricing';

import TabBar, { type ViewTab } from './_components/TabBar';
import TodayClient from './_components/TodayClient';
import HistoryFilters from './_components/HistoryFilters';
import { loadTodaySnapshot, dayRangeUTC } from './_lib/today-queries';
import type { BookingDetail } from '@/types/booking-detail';
// Client wrapper — dynamic({ ssr: false }) is illegal in Server Components (Next.js 15)
import LazyBookingDetailPanel from './_components/LazyBookingDetailPanel';

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    view?: string;
    display?: string;
    status?: string;
    type?: string;
    noInvoice?: string;
    f?: string;
    from?: string;
    to?: string;
    booking?: string;
  }>;
}

const VALID_VIEWS: ViewTab[] = ['today', 'upcoming', 'in-progress', 'history'];

function parseView(v: string | undefined): ViewTab {
  return (VALID_VIEWS as string[]).includes(v ?? '') ? (v as ViewTab) : 'today';
}

export default async function AdminReservationsPage(props: PageProps) {
  const { locale } = await props.params;
  const searchParams = await props.searchParams;
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    redirect(`/${locale}/auth/login`);
  }

  const view = parseView(searchParams.view);
  const fr = locale !== 'en';
  const display = searchParams.display === 'board' ? 'board' : 'list';
  const panelBookingId = searchParams.booking ?? null;

  // ── Header counts for tab badges (cheap, runs always) ────────────────────
  const now = new Date();
  const { start: todayStart, end: todayEnd } = dayRangeUTC(now);
  const weekEnd = new Date(todayEnd);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

  const [todayArrivalsCount, todayDeparturesCount, upcomingCount, inProgressCount] = await Promise.all([
    prisma.booking.count({
      where: { deletedAt: null, status: 'CONFIRMED', startDate: { gte: todayStart, lte: todayEnd } },
    }),
    prisma.booking.count({
      where: { deletedAt: null, status: 'IN_PROGRESS', endDate: { gte: todayStart, lte: todayEnd } },
    }),
    prisma.booking.count({
      where: {
        deletedAt: null,
        status: { in: ['PENDING', 'CONFIRMED'] as BookingStatus[] },
        startDate: { gt: todayEnd, lte: weekEnd },
      },
    }),
    prisma.booking.count({ where: { deletedAt: null, status: 'IN_PROGRESS' } }),
  ]);

  const badges = {
    today: todayArrivalsCount + todayDeparturesCount,
    upcoming: upcomingCount,
    inProgress: inProgressCount,
  };

  // Pet count for the subtitle (cheap aggregate)
  const presentPets = await prisma.bookingPet.count({
    where: {
      booking: {
        deletedAt: null,
        status: 'IN_PROGRESS',
        startDate: { lte: todayEnd },
        OR: [{ endDate: null }, { endDate: { gte: todayStart } }],
      },
    },
  });

  const subtitle = (() => {
    const dateLabel = now.toLocaleDateString(fr ? 'fr-MA' : 'en-GB', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
    });
    const petsLabel = fr ? `${presentPets} animaux présents` : `${presentPets} animals on site`;
    return `${dateLabel} · ${petsLabel}`;
  })();

  // Pre-fetch panel data server-side when ?booking= is in the initial URL
  // (subsequent navigations are client-side via the fetch in BookingDetailPanel)
  let panelInitialData: BookingDetail | null = null;
  const pricing = await getPricingSettings();
  if (panelBookingId) {
    try {
      const b = await prisma.booking.findFirst({
        where: { id: panelBookingId, deletedAt: null },
        include: {
          client: { select: { id: true, name: true, email: true, phone: true, isWalkIn: true } },
          bookingPets: { include: { pet: { select: { id: true, name: true, species: true, breed: true, photoUrl: true, gender: true, allergies: true, currentMedication: true, behaviorWithDogs: true, behaviorWithCats: true, notes: true } } } },
          boardingDetail: true,
          taxiDetail: { select: { pickupAddress: true, dropoffAddress: true, price: true } },
          invoice: { select: { id: true, invoiceNumber: true, status: true, amount: true, paidAmount: true, version: true } },
        },
      });
      if (b) {
        panelInitialData = {
          id: b.id,
          status: b.status as BookingDetail['status'],
          serviceType: b.serviceType as BookingDetail['serviceType'],
          startDate: b.startDate.toISOString(),
          endDate: b.endDate?.toISOString() ?? null,
          isOpenEnded: b.isOpenEnded,
          totalPrice: toNumber(b.totalPrice),
          notes: b.notes ?? null,
          cancellationReason: b.cancellationReason ?? null,
          arrivalTime: b.arrivalTime ?? null,
          version: b.version,
          createdAt: b.createdAt.toISOString(),
          client: { id: b.client.id, name: b.client.name ?? null, email: b.client.email, phone: b.client.phone ?? null, isWalkIn: b.client.isWalkIn },
          pets: b.bookingPets.map((bp) => ({ id: bp.pet.id, name: bp.pet.name, species: bp.pet.species as 'DOG' | 'CAT', breed: bp.pet.breed ?? null, photoUrl: bp.pet.photoUrl ?? null, gender: bp.pet.gender ?? null, allergies: bp.pet.allergies ?? null, currentMedication: bp.pet.currentMedication ?? null, behaviorWithDogs: bp.pet.behaviorWithDogs ?? null, behaviorWithCats: bp.pet.behaviorWithCats ?? null, notes: bp.pet.notes ?? null })),
          invoice: b.invoice ? { id: b.invoice.id, invoiceNumber: b.invoice.invoiceNumber, status: b.invoice.status, amount: toNumber(b.invoice.amount), paidAmount: toNumber(b.invoice.paidAmount), version: b.invoice.version } : null,
          supplementaryInvoice: null,
          boarding: b.boardingDetail ? { groomingEnabled: b.boardingDetail.groomingEnabled ?? false, groomingPrice: toNumber(b.boardingDetail.groomingPrice) || null, taxiGoEnabled: b.boardingDetail.taxiGoEnabled ?? false, taxiReturnEnabled: b.boardingDetail.taxiReturnEnabled ?? false, pricePerNight: toNumber(b.boardingDetail.pricePerNight) || null } : null,
          taxi: b.taxiDetail ? { pickupAddress: b.taxiDetail.pickupAddress ?? null, dropoffAddress: b.taxiDetail.dropoffAddress ?? null, price: b.taxiDetail.price ? toNumber(b.taxiDetail.price) : null } : null,
          adminNotes: null,
          actionLog: [],
          liveTotal: null,
          liveNights: null,
        };
      }
    } catch { /* non-blocking — panel will fetch client-side */ }
  }

  return (
    <div>
      <PageHeader locale={locale} subtitle={subtitle} />
      <TabBar current={view} locale={locale} badges={badges} />
      {view !== 'today' && (
        <div className="flex items-center justify-end mb-3">
          <ViewToggle locale={locale} view={view} display={display} fr={fr} />
        </div>
      )}

      {view === 'today' && <TodayView locale={locale} />}
      {view === 'upcoming' && (
        <ListView
          locale={locale}
          display={display}
          where={{
            deletedAt: null,
            status: { in: ['PENDING', 'CONFIRMED'] as BookingStatus[] },
            startDate: { gt: todayEnd },
          }}
          orderBy={[{ startDate: 'asc' }]}
          initialFilter='ALL'
          locale_={locale}
        />
      )}
      {view === 'in-progress' && (
        <ListView
          locale={locale}
          display={display}
          where={{ deletedAt: null, status: 'IN_PROGRESS' }}
          orderBy={[{ endDate: 'asc' }]}
          initialFilter='ALL'
          locale_={locale}
        />
      )}
      {view === 'history' && (
        <HistoryView
          locale={locale}
          display={display}
          searchParams={searchParams}
        />
      )}

      {/* Booking detail side panel — lazy-loaded, URL-driven via ?booking= */}
      <PanelWrapper
        locale={locale}
        pricing={pricing}
        panelBookingId={panelBookingId}
        panelInitialData={panelInitialData}
        view={view}
        todayEnd={todayEnd}
        weekEnd={weekEnd}
        searchParams={searchParams}
      />
    </div>
  );
}

// ─── Page header ────────────────────────────────────────────────────────────
function PageHeader({ locale, subtitle }: { locale: string; subtitle: string }) {
  const fr = locale !== 'en';
  return (
    <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
      <div>
        <h1 className="text-2xl font-serif font-bold text-charcoal">
          {fr ? 'Réservations' : 'Bookings'}
        </h1>
        <p className="text-sm text-gray-500 mt-0.5 capitalize">{subtitle}</p>
      </div>
      <Link
        href={`/${locale}/admin/reservations/new`}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-charcoal text-white text-sm hover:bg-charcoal/90"
      >
        <Plus className="h-4 w-4" />
        {fr ? 'Nouvelle réservation' : 'New booking'}
      </Link>
    </div>
  );
}

function ViewToggle({
  locale, view, display, fr,
}: { locale: string; view: ViewTab; display: 'list' | 'board'; fr: boolean }) {
  const base = `/${locale}/admin/reservations?view=${view}`;
  return (
    <div className="flex rounded-lg border border-ivory-200 overflow-hidden">
      <Link href={`${base}&display=list`}>
        <button className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium ${display === 'list' ? 'bg-charcoal text-white' : 'bg-white text-gray-600 hover:bg-ivory-50'}`}>
          <LayoutList className="h-3.5 w-3.5" />
          {fr ? 'Liste' : 'List'}
        </button>
      </Link>
      <Link href={`${base}&display=board`}>
        <button className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border-l border-ivory-200 ${display === 'board' ? 'bg-charcoal text-white' : 'bg-white text-gray-600 hover:bg-ivory-50'}`}>
          <LayoutGrid className="h-3.5 w-3.5" />
          {fr ? 'Board' : 'Board'}
        </button>
      </Link>
    </div>
  );
}

// ─── Today view ─────────────────────────────────────────────────────────────
async function TodayView({ locale }: { locale: string }) {
  const [snapshot, pricing] = await Promise.all([loadTodaySnapshot(), getPricingSettings()]);
  return <TodayClient snapshot={snapshot} pricing={pricing} locale={locale} />;
}

// ─── List view (upcoming / in-progress) ─────────────────────────────────────
type WhereInput = Prisma.BookingWhereInput;

async function ListView({
  display,
  where,
  orderBy,
  initialFilter,
  locale_,
}: {
  locale: string;
  display: 'list' | 'board';
  where: WhereInput;
  orderBy: Prisma.BookingOrderByWithRelationInput[];
  initialFilter: 'ALL' | 'IN_PROGRESS' | 'CONFIRMED' | 'PENDING' | 'WALKIN' | 'CANCELLED' | 'NO_SHOW' | 'BOARDING' | 'PET_TAXI';
  locale_: string;
}) {
  if (display === 'board') {
    return <BoardView where={where} locale={locale_} />;
  }
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const [bookingsRaw, monthRevenueAgg] = await Promise.all([
    fetchListBookings(where, orderBy),
    prisma.invoice.aggregate({
      where: {
        status: { in: ['PAID', 'PARTIALLY_PAID'] },
        ...getMonthlyInvoicesWhere(monthStart, monthEnd),
      },
      _sum: { paidAmount: true },
    }),
  ]);
  return (
    <ReservationsList
      bookings={bookingsRaw}
      locale={locale_}
      monthlyRevenue={toNumber(monthRevenueAgg._sum.paidAmount)}
      initialFilter={initialFilter}
    />
  );
}

async function BoardView({ where, locale }: { where: WhereInput; locale: string }) {
  const raw = await prisma.booking.findMany({
    where,
    select: {
      id: true, version: true, serviceType: true, status: true,
      startDate: true, endDate: true, arrivalTime: true, notes: true,
      client: { select: { id: true, name: true, email: true } },
      bookingPets: { select: { pet: { select: { name: true } } } },
    },
    orderBy: { startDate: 'asc' },
    take: 500,
  });
  const kanban: KanbanBooking[] = raw.map((b) => ({
    id: b.id,
    version: b.version,
    serviceType: b.serviceType as 'BOARDING' | 'PET_TAXI',
    status: b.status,
    startDate: b.startDate.toISOString(),
    endDate: b.endDate?.toISOString() ?? null,
    arrivalTime: b.arrivalTime ?? null,
    notes: b.notes ?? null,
    clientName: b.client.name ?? b.client.email,
    clientId: b.client.id,
    pets: b.bookingPets.map((bp) => bp.pet.name).join(', '),
  }));
  return <ReservationsKanban bookings={kanban} locale={locale} />;
}

async function fetchListBookings(
  where: WhereInput,
  orderBy: Prisma.BookingOrderByWithRelationInput[],
): Promise<ReservationRow[]> {
  const raw = await prisma.booking.findMany({
    where,
    select: {
      id: true, status: true, serviceType: true,
      startDate: true, endDate: true, isOpenEnded: true, totalPrice: true,
      client: { select: { id: true, firstName: true, lastName: true, phone: true, isWalkIn: true } },
      bookingPets: { select: { pet: { select: { name: true, species: true } } } },
      taxiDetail: { select: { id: true } },
      boardingDetail: { select: { taxiGoEnabled: true, taxiReturnEnabled: true } },
      taxiTrips: { select: { tripType: true } },
      invoice: { select: { amount: true } },
    },
    orderBy,
    take: 500,
  });
  return raw.map((b) => {
    const hasBoardingTaxi = !!(b.boardingDetail?.taxiGoEnabled || b.boardingDetail?.taxiReturnEnabled);
    const hasStandaloneTaxi = b.serviceType === 'PET_TAXI' && !!b.taxiDetail;
    return {
      id: b.id,
      status: b.status,
      serviceType: b.serviceType as 'BOARDING' | 'PET_TAXI',
      startDate: b.startDate.toISOString(),
      endDate: b.endDate?.toISOString() ?? null,
      isOpenEnded: b.isOpenEnded,
      totalPrice: toNumber(b.totalPrice),
      invoiceAmount: b.invoice ? toNumber(b.invoice.amount) : null,
      client: {
        id: b.client.id,
        firstName: b.client.firstName,
        lastName: b.client.lastName,
        phone: b.client.phone ?? null,
        isWalkIn: b.client.isWalkIn,
      },
      pets: b.bookingPets.map((bp) => ({
        name: bp.pet.name,
        species: (bp.pet.species === 'CAT' ? 'CAT' : 'DOG') as 'CAT' | 'DOG',
      })),
      hasTaxi: hasBoardingTaxi || hasStandaloneTaxi,
      taxiReturn:
        (b.boardingDetail?.taxiReturnEnabled ?? false) ||
        (hasStandaloneTaxi && b.taxiTrips.some((t) => t.tripType === 'RETURN')),
      taxiAddon: hasBoardingTaxi,
    };
  });
}

// ─── History view ───────────────────────────────────────────────────────────
async function HistoryView({
  locale,
  display,
  searchParams,
}: {
  locale: string;
  display: 'list' | 'board';
  searchParams: { from?: string; to?: string; status?: string; type?: string; f?: string };
}) {
  const fr = locale !== 'en';
  const now = new Date();
  const defaultFrom = format(startOfMonth(now), 'yyyy-MM-dd');
  const defaultTo = format(endOfMonth(now), 'yyyy-MM-dd');
  const from = searchParams.from || defaultFrom;
  const to = searchParams.to || defaultTo;
  const statusFilter = searchParams.status;
  const typeFilter = searchParams.type;

  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T23:59:59.999Z`);

  const terminalStatuses: BookingStatus[] = ['COMPLETED', 'CANCELLED', 'REJECTED', 'NO_SHOW'];
  const statusWhere: Prisma.BookingWhereInput =
    statusFilter && (terminalStatuses as string[]).includes(statusFilter)
      ? { status: statusFilter as BookingStatus }
      : { status: { in: terminalStatuses } };

  const typeWhere: Prisma.BookingWhereInput = {};
  if (typeFilter === 'BOARDING' || typeFilter === 'PET_TAXI') typeWhere.serviceType = typeFilter;
  if (typeFilter === 'WALKIN') typeWhere.client = { isWalkIn: true };

  const where: Prisma.BookingWhereInput = {
    deletedAt: null,
    ...statusWhere,
    ...typeWhere,
    OR: [
      { endDate: { gte: fromDate, lte: toDate } },
      { endDate: null, startDate: { gte: fromDate, lte: toDate } },
    ],
  };

  const [bookings, stats] = await Promise.all([
    fetchListBookings(where, [{ endDate: 'desc' }, { startDate: 'desc' }]),
    prisma.booking.aggregate({
      where,
      _count: { _all: true },
    }),
  ]);

  const completed = bookings.filter((b) => b.status === 'COMPLETED');
  const cancelled = bookings.filter((b) => b.status === 'CANCELLED' || b.status === 'REJECTED');
  const revenue = completed.reduce((s, b) => s + (b.invoiceAmount ?? b.totalPrice), 0);
  const cancelRate = stats._count._all > 0 ? Math.round((cancelled.length / stats._count._all) * 100) : 0;

  return (
    <>
      <HistoryFilters
        locale={locale}
        rangeFrom={from}
        rangeTo={to}
        status={statusFilter ?? ''}
        type={typeFilter ?? ''}
      />
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Stat label={fr ? 'Réservations' : 'Bookings'} value={String(stats._count._all)} />
        <Stat label={fr ? 'CA' : 'Revenue'} value={`${Math.round(revenue).toLocaleString(fr ? 'fr-MA' : 'en-GB')} MAD`} />
        <Stat label={fr ? 'Taux annulation' : 'Cancel rate'} value={`${cancelRate}%`} />
      </div>
      {display === 'board' ? (
        <BoardView where={where} locale={locale} />
      ) : (
        <ReservationsList
          bookings={bookings}
          locale={locale}
          monthlyRevenue={revenue}
          initialFilter="ALL"
        />
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-lg border border-ivory-200 px-4 py-3">
      <p className="text-lg font-semibold text-charcoal">{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

// ─── Panel wrapper (server — fetches orderedIds for navigation) ──────────────
async function PanelWrapper({
  locale,
  pricing,
  panelBookingId,
  panelInitialData,
  view,
  todayEnd,
  weekEnd,
  searchParams,
}: {
  locale: string;
  pricing: import('@/lib/pricing-rules').PricingSettings;
  panelBookingId: string | null;
  panelInitialData: BookingDetail | null;
  view: ViewTab;
  todayEnd: Date;
  weekEnd: Date;
  searchParams: { from?: string; to?: string; status?: string; type?: string };
}) {
  // Build the same where clause that the list uses — to get orderedIds for ↑↓ nav
  let where: Prisma.BookingWhereInput;
  let orderBy: Prisma.BookingOrderByWithRelationInput[];

  if (view === 'upcoming') {
    where = { deletedAt: null, status: { in: ['PENDING', 'CONFIRMED'] as BookingStatus[] }, startDate: { gt: todayEnd } };
    orderBy = [{ startDate: 'asc' }];
  } else if (view === 'in-progress') {
    where = { deletedAt: null, status: 'IN_PROGRESS' };
    orderBy = [{ endDate: 'asc' }];
  } else if (view === 'history') {
    const defaultFrom = format(startOfMonth(new Date()), 'yyyy-MM-dd');
    const defaultTo = format(endOfMonth(new Date()), 'yyyy-MM-dd');
    const from = searchParams.from || defaultFrom;
    const to = searchParams.to || defaultTo;
    const fromDate = new Date(`${from}T00:00:00.000Z`);
    const toDate = new Date(`${to}T23:59:59.999Z`);
    const terminalStatuses: BookingStatus[] = ['COMPLETED', 'CANCELLED', 'REJECTED', 'NO_SHOW'];
    const statusWhere: Prisma.BookingWhereInput =
      searchParams.status && (terminalStatuses as string[]).includes(searchParams.status)
        ? { status: searchParams.status as BookingStatus }
        : { status: { in: terminalStatuses } };
    where = { deletedAt: null, ...statusWhere, OR: [{ endDate: { gte: fromDate, lte: toDate } }, { endDate: null, startDate: { gte: fromDate, lte: toDate } }] };
    orderBy = [{ endDate: 'desc' }, { startDate: 'desc' }];
  } else {
    // Today view — ordered by arrivalTime for check-ins
    where = { deletedAt: null, status: { in: ['CONFIRMED', 'IN_PROGRESS', 'PENDING'] as BookingStatus[] } };
    orderBy = [{ startDate: 'asc' }];
  }

  const ids = await prisma.booking.findMany({
    where,
    orderBy,
    select: { id: true },
    take: 500,
  });
  const orderedIds = ids.map((b) => b.id);

  return (
    <LazyBookingDetailPanel
      orderedIds={orderedIds}
      locale={locale}
      pricing={pricing}
      initialData={panelInitialData}
    />
  );
}
