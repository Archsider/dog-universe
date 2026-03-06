import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import ReservationsTable from './ReservationsTable';

interface PageProps {
  params: { locale: string };
  searchParams: { status?: string; type?: string; page?: string };
}

export default async function AdminReservationsPage({ params: { locale }, searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPERADMIN'].includes(session.user.role)) redirect(`/${locale}/auth/login`);

  const status = searchParams.status || '';
  const type = searchParams.type || '';
  const page = parseInt(searchParams.page || '1');
  const limit = 20;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {
    ...(status && { status }),
    ...(type && { serviceType: type }),
  };

  const [bookings, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      include: {
        client: { select: { id: true, name: true, email: true } },
        bookingPets: { include: { pet: { select: { name: true } } } },
        taxiDetail: true,
        invoice: { select: { amount: true } },
      },
      orderBy: { startDate: 'desc' },
      skip,
      take: limit,
    }),
    prisma.booking.count({ where }),
  ]);

  const labels = {
    fr: { title: 'Réservations', all: 'Toutes', pending: 'En attente', confirmed: 'Confirmées', completed: 'Terminées', cancelled: 'Annulées', allTypes: 'Tous', boarding: 'Pension', taxi: 'Taxi', client: 'Client', animals: 'Animaux', dates: 'Date', total: 'Total', noBookings: 'Aucune réservation' },
    en: { title: 'Bookings', all: 'All', pending: 'Pending', confirmed: 'Confirmed', completed: 'Completed', cancelled: 'Cancelled', allTypes: 'All', boarding: 'Boarding', taxi: 'Taxi', client: 'Client', animals: 'Pets', dates: 'Date', total: 'Total', noBookings: 'No bookings' },
  };

  const sl: Record<string, Record<string, string>> = {
    fr: { PENDING: 'En attente', CONFIRMED: 'Confirmé', CANCELLED: 'Annulé', REJECTED: 'Refusé', COMPLETED: 'Terminé', IN_PROGRESS: 'En cours' },
    en: { PENDING: 'Pending', CONFIRMED: 'Confirmed', CANCELLED: 'Cancelled', REJECTED: 'Rejected', COMPLETED: 'Completed', IN_PROGRESS: 'In progress' },
  };

  const l = labels[locale as keyof typeof labels] || labels.fr;
  const statusLbls = sl[locale] || sl.fr;

  const statusFilters = [['', l.all], ['PENDING', l.pending], ['CONFIRMED', l.confirmed], ['COMPLETED', l.completed], ['CANCELLED', l.cancelled]];
  const typeFilters = [['', l.allTypes], ['BOARDING', l.boarding], ['PET_TAXI', l.taxi]];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-serif font-bold text-charcoal">{l.title}</h1>
        <span className="text-sm text-gray-500">{total}</span>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {statusFilters.map(([val, lbl]) => (
          <Link key={val} href={`?status=${val}&type=${type}`}>
            <button className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${status === val ? 'bg-charcoal text-white' : 'bg-white border border-ivory-200 text-gray-600 hover:border-gold-300'}`}>{lbl}</button>
          </Link>
        ))}
        <div className="h-5 w-px bg-ivory-200 self-center mx-1" />
        {typeFilters.map(([val, lbl]) => (
          <Link key={val} href={`?status=${status}&type=${val}`}>
            <button className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${type === val ? 'bg-charcoal text-white' : 'bg-white border border-ivory-200 text-gray-600 hover:border-gold-300'}`}>{lbl}</button>
          </Link>
        ))}
      </div>

      <ReservationsTable
        bookings={bookings as Parameters<typeof ReservationsTable>[0]['bookings']}
        locale={locale}
        statusLbls={statusLbls}
        noBookings={l.noBookings}
      />
    </div>
  );
}
