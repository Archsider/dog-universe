import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { LayoutList, LayoutGrid } from 'lucide-react';
import { startOfMonth, endOfMonth } from 'date-fns';
import { ReservationsKanban, type KanbanBooking } from './ReservationsKanban';
import ReservationsList, { type ReservationRow } from './ReservationsList';
import { toNumber } from '@/lib/decimal';
import { getMonthlyInvoicesWhere } from '@/lib/billing';

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string; type?: string; view?: string; noInvoice?: string; f?: string }>;
}

const VALID_FILTERS = ['ALL', 'IN_PROGRESS', 'CONFIRMED', 'PENDING', 'WALKIN', 'CANCELLED', 'NO_SHOW', 'BOARDING', 'PET_TAXI'] as const;
type Filter = typeof VALID_FILTERS[number];

function deriveInitialFilter(sp: { status?: string; type?: string; f?: string; noInvoice?: string }): Filter {
  if (sp.f && (VALID_FILTERS as readonly string[]).includes(sp.f)) return sp.f as Filter;
  if (sp.status === 'PENDING') return 'PENDING';
  if (sp.status === 'IN_PROGRESS') return 'IN_PROGRESS';
  if (sp.status === 'CONFIRMED') return 'CONFIRMED';
  if (sp.status === 'CANCELLED') return 'CANCELLED';
  if (sp.status === 'NO_SHOW') return 'NO_SHOW';
  if (sp.type === 'BOARDING') return 'BOARDING';
  if (sp.type === 'PET_TAXI') return 'PET_TAXI';
  return 'ALL';
}

export default async function AdminReservationsPage(props: PageProps) {
  const { locale } = await props.params;
  const searchParams = await props.searchParams;
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) redirect(`/${locale}/auth/login`);

  const view = searchParams.view === 'board' ? 'board' : 'list';

  const labels = {
    fr: { list: 'Liste', board: 'Board' },
    en: { list: 'List', board: 'Board' },
  };
  const l = labels[locale as keyof typeof labels] || labels.fr;

  // ── Kanban view (unchanged) ────────────────────────────────────────────
  if (view === 'board') {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const raw = await prisma.booking.findMany({
      where: {
        deletedAt: null,
        OR: [
          { status: { in: ['PENDING', 'CONFIRMED', 'AT_PICKUP', 'IN_PROGRESS'] } },
          { status: 'COMPLETED', updatedAt: { gte: sevenDaysAgo } },
        ],
      },
      select: {
        id: true,
        version: true,
        serviceType: true,
        status: true,
        startDate: true,
        endDate: true,
        arrivalTime: true,
        notes: true,
        client: { select: { id: true, name: true, email: true } },
        bookingPets: { select: { pet: { select: { name: true } } } },
      },
      orderBy: { startDate: 'asc' },
      // Kanban view: bornage de sécurité — 7 jours d'historique COMPLETED + actifs.
      // Cap à 500 pour éviter une explosion mémoire si l'app tourne longtemps sans housekeeping.
      take: 500,
    });
    const kanbanBookings: KanbanBooking[] = raw.map((b) => ({
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

    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-serif font-bold text-charcoal">{locale === 'fr' ? 'Réservations' : 'Bookings'}</h1>
          <ViewToggle locale={locale} view={view} l={l} />
        </div>
        <ReservationsKanban bookings={kanbanBookings} locale={locale} />
      </div>
    );
  }

  // ── List view ──────────────────────────────────────────────────────────
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const [bookingsRaw, monthRevenueAgg] = await Promise.all([
    prisma.booking.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        status: true,
        serviceType: true,
        startDate: true,
        endDate: true,
        isOpenEnded: true,
        totalPrice: true,
        client: {
          select: { id: true, firstName: true, lastName: true, phone: true, isWalkIn: true },
        },
        bookingPets: { select: { pet: { select: { name: true, species: true } } } },
        taxiDetail: { select: { id: true } },
        boardingDetail: { select: { taxiGoEnabled: true, taxiReturnEnabled: true } },
        taxiTrips: { select: { tripType: true } },
        invoice: { select: { amount: true } },
      },
      orderBy: { startDate: 'desc' },
      take: 500,
    }),
    prisma.invoice.aggregate({
      where: {
        status: { in: ['PAID', 'PARTIALLY_PAID'] },
        ...getMonthlyInvoicesWhere(monthStart, monthEnd),
      },
      _sum: { paidAmount: true },
    }),
  ]);

  const bookings: ReservationRow[] = bookingsRaw.map((b) => {
    const hasBoardingTaxi = !!(b.boardingDetail?.taxiGoEnabled || b.boardingDetail?.taxiReturnEnabled);
    const hasStandaloneTaxi = b.serviceType === 'PET_TAXI' && !!b.taxiDetail;
    const hasTaxi = hasBoardingTaxi || hasStandaloneTaxi;
    const taxiReturn =
      (b.boardingDetail?.taxiReturnEnabled ?? false) ||
      (hasStandaloneTaxi && b.taxiTrips.some((t) => t.tripType === 'RETURN'));
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
      hasTaxi,
      taxiReturn,
      taxiAddon: hasBoardingTaxi,
    };
  });

  const monthlyRevenue = toNumber(monthRevenueAgg._sum.paidAmount);
  const initialFilter = deriveInitialFilter(searchParams);

  return (
    <div>
      <div className="flex items-center justify-end mb-2">
        <ViewToggle locale={locale} view={view} l={l} />
      </div>
      <ReservationsList
        bookings={bookings}
        locale={locale}
        monthlyRevenue={monthlyRevenue}
        initialFilter={initialFilter}
      />
    </div>
  );
}

function ViewToggle({ locale, view, l }: { locale: string; view: 'list' | 'board'; l: { list: string; board: string } }) {
  return (
    <div className="flex rounded-lg border border-ivory-200 overflow-hidden">
      <Link href={`/${locale}/admin/reservations?view=list`}>
        <button className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors ${view === 'list' ? 'bg-charcoal text-white' : 'bg-white text-gray-600 hover:bg-ivory-50'}`}>
          <LayoutList className="h-3.5 w-3.5" />
          {l.list}
        </button>
      </Link>
      <Link href={`/${locale}/admin/reservations?view=board`}>
        <button className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors border-l border-ivory-200 ${view === 'board' ? 'bg-charcoal text-white' : 'bg-white text-gray-600 hover:bg-ivory-50'}`}>
          <LayoutGrid className="h-3.5 w-3.5" />
          {l.board}
        </button>
      </Link>
    </div>
  );
}
