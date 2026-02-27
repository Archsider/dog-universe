import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { Calendar, ChevronRight, Package, Car } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatDate, formatMAD, getBookingStatusColor } from '@/lib/utils';

interface PageProps {
  params: { locale: string };
  searchParams: { status?: string; type?: string; page?: string };
}

export default async function AdminReservationsPage({ params: { locale }, searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') redirect(`/${locale}/auth/login`);

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

      <div className="bg-white rounded-xl border border-[#F0D98A]/40 shadow-card overflow-hidden">
        {bookings.length === 0 ? (
          <div className="text-center py-12 text-gray-400"><Calendar className="h-10 w-10 mx-auto mb-3 opacity-30" /><p>{l.noBookings}</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-ivory-200 bg-ivory-50">
                  <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">ID</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">{l.client}</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden sm:table-cell">{l.animals}</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden md:table-cell">{l.dates}</th>
                  <th className="text-center text-xs font-semibold text-gray-500 px-4 py-3">Statut</th>
                  <th className="text-right text-xs font-semibold text-gray-500 px-4 py-3 hidden lg:table-cell">{l.total}</th>
                  <th className="px-4 py-3 w-8" />
                </tr>
              </thead>
              <tbody>
                {bookings.map(booking => {
                  const isBoarding = booking.serviceType === 'BOARDING';
                  return (
                    <tr key={booking.id} className="border-b border-ivory-100 last:border-0 hover:bg-ivory-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {isBoarding ? <Package className="h-4 w-4 text-gold-400" /> : <Car className="h-4 w-4 text-blue-400" />}
                          <span className="font-mono text-xs text-gray-500">{booking.id.slice(0, 8)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/${locale}/admin/clients/${booking.client.id}`} className="text-sm font-medium text-charcoal hover:text-gold-600">{booking.client.name}</Link>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 hidden sm:table-cell">{booking.bookingPets.map(bp => bp.pet.name).join(', ')}</td>
                      <td className="px-4 py-3 text-sm text-gray-500 hidden md:table-cell">
                        {formatDate(booking.startDate, locale)}{booking.endDate ? ` → ${formatDate(booking.endDate, locale)}` : ''}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge className={`text-xs ${getBookingStatusColor(booking.status)}`}>{statusLbls[booking.status]}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-medium text-charcoal hidden lg:table-cell">
                        {booking.invoice ? formatMAD(booking.invoice.amount) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/${locale}/admin/reservations/${booking.id}`}><ChevronRight className="h-4 w-4 text-gray-400 hover:text-gold-500" /></Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
