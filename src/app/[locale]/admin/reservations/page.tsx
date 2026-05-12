// /admin/reservations — tabbed workspace (depuis 2026-05-12).
// Tabs: today (default) · upcoming · in-progress · history. URL: ?view=…
// The Board/List display toggle moved to ?display=board|list and only
// applies to the List view (today/upcoming/in-progress/history are
// task-oriented; the Kanban is reserved for the legacy free-form board).
import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { LayoutList, LayoutGrid, Plus } from 'lucide-react';
import { startOfMonth, endOfMonth, format } from 'date-fns';

import { ReservationsKanban, type KanbanBooking } from './ReservationsKanban';
import ReservationsList, { type ReservationRow } from './ReservationsList';
import { toNumber } from '@/lib/decimal';
import { getMonthlyInvoicesWhere } from '@/lib/billing';
import { getPricingSettings } from '@/lib/pricing';

import TabBar, { type ViewTab } from './_components/TabBar';
import TodayClient from './_components/TodayClient';
import HistoryFilters from './_components/HistoryFilters';
import { loadTodaySnapshot, dayRangeUTC } from './_lib/today-queries';

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
        status: { in: ['PENDING', 'CONFIRMED'] },
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
            status: { in: ['PENDING', 'CONFIRMED'] },
            startDate: { gt: todayEnd },
          }}
          orderBy={[{ startDate: 'asc' }]}
          initialFilter={(searchParams.f as never) ?? 'ALL'}
          locale_={locale}
        />
      )}
      {view === 'in-progress' && (
        <ListView
          locale={locale}
          display={display}
          where={{ deletedAt: null, status: 'IN_PROGRESS' }}
          orderBy={[{ endDate: 'asc' }]}
          initialFilter={(searchParams.f as never) ?? 'ALL'}
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
type WhereInput = Parameters<typeof prisma.booking.findMany>[0] extends { where?: infer W } ? W : never;

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
  orderBy: { startDate?: 'asc' | 'desc'; endDate?: 'asc' | 'desc' }[];
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
    where: where as never,
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
  orderBy: { startDate?: 'asc' | 'desc'; endDate?: 'asc' | 'desc' }[],
): Promise<ReservationRow[]> {
  const raw = await prisma.booking.findMany({
    where: where as never,
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
    orderBy: orderBy as never,
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

  const terminalStatuses = ['COMPLETED', 'CANCELLED', 'REJECTED', 'NO_SHOW'];
  const statusWhere = statusFilter && terminalStatuses.includes(statusFilter)
    ? { status: statusFilter }
    : { status: { in: terminalStatuses } };

  const typeWhere: Record<string, unknown> = {};
  if (typeFilter === 'BOARDING' || typeFilter === 'PET_TAXI') typeWhere.serviceType = typeFilter;
  if (typeFilter === 'WALKIN') typeWhere.client = { isWalkIn: true };

  const where = {
    deletedAt: null,
    ...statusWhere,
    ...typeWhere,
    OR: [
      { endDate: { gte: fromDate, lte: toDate } },
      { endDate: null, startDate: { gte: fromDate, lte: toDate } },
    ],
  };

  const [bookings, stats] = await Promise.all([
    fetchListBookings(where as never, [{ endDate: 'desc' }, { startDate: 'desc' }]),
    prisma.booking.aggregate({
      where: where as never,
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
        <BoardView where={where as never} locale={locale} />
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
