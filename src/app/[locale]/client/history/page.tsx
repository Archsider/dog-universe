import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { Calendar, PawPrint, Package, Car, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatDate, formatMAD, getBookingStatusColor } from '@/lib/utils';

interface PageProps { params: { locale: string } }

export default async function HistoryPage({ params: { locale } }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/auth/login`);

  const bookings = await prisma.booking.findMany({
    where: { clientId: session.user.id },
    include: {
      bookingPets: { include: { pet: true } },
      boardingDetail: true,
      taxiDetail: true,
      invoice: { select: { id: true, invoiceNumber: true, amount: true } },
    },
    orderBy: { startDate: 'desc' },
  });

  const labels = {
    fr: {
      title: 'Mes réservations',
      noBookings: 'Aucune réservation pour l\'instant.',
      newBooking: 'Faire une réservation',
      invoice: 'Facture',
      boarding: 'Pension',
      taxi: 'Taxi',
      nights: 'nuits',
      night: 'nuit',
      from: 'du',
      to: 'au',
    },
    en: {
      title: 'My bookings',
      noBookings: 'No bookings yet.',
      newBooking: 'Make a booking',
      invoice: 'Invoice',
      boarding: 'Boarding',
      taxi: 'Taxi',
      nights: 'nights',
      night: 'night',
      from: 'from',
      to: 'to',
    },
  };

  const sl: Record<string, Record<string, string>> = {
    fr: { PENDING: 'En attente', CONFIRMED: 'Confirmé', CANCELLED: 'Annulé', REJECTED: 'Refusé', COMPLETED: 'Terminé', IN_PROGRESS: 'En cours' },
    en: { PENDING: 'Pending', CONFIRMED: 'Confirmed', CANCELLED: 'Cancelled', REJECTED: 'Rejected', COMPLETED: 'Completed', IN_PROGRESS: 'In progress' },
  };

  const l = labels[locale as keyof typeof labels] || labels.fr;
  const statusLbls = sl[locale] || sl.fr;

  const calculateNights = (start: Date, end: Date | null) => {
    if (!end) return 0;
    return Math.max(0, Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-serif font-bold text-charcoal">{l.title}</h1>
        <Link href={`/${locale}/client/bookings/new`}>
          <button className="flex items-center gap-2 px-4 py-2 bg-charcoal text-white rounded-lg hover:bg-charcoal/90 text-sm font-medium transition-colors">
            <Plus className="h-4 w-4" />{l.newBooking}
          </button>
        </Link>
      </div>

      {bookings.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-[#F0D98A]/40">
          <Calendar className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500 mb-4">{l.noBookings}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {bookings.map((booking) => {
            const pets = booking.bookingPets.map(bp => bp.pet);
            const isBoarding = booking.serviceType === 'BOARDING';
            const nights = isBoarding ? calculateNights(booking.startDate, booking.endDate) : 0;

            return (
              <div key={booking.id} className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card hover:shadow-card-hover transition-shadow">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className={`p-2 rounded-lg flex-shrink-0 ${isBoarding ? 'bg-gold-50' : 'bg-blue-50'}`}>
                      {isBoarding ? <Package className="h-5 w-5 text-gold-500" /> : <Car className="h-5 w-5 text-blue-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-charcoal">{isBoarding ? l.boarding : l.taxi}</span>
                        <Badge className={`text-xs ${getBookingStatusColor(booking.status)}`}>{statusLbls[booking.status] || booking.status}</Badge>
                      </div>
                      <div className="flex items-center gap-1 mt-1 text-sm text-gray-500">
                        <PawPrint className="h-3 w-3" />
                        {pets.map(p => p.name).join(', ')}
                      </div>
                      <div className="flex items-center gap-1 mt-1 text-sm text-gray-500">
                        <Calendar className="h-3 w-3" />
                        {isBoarding ? (
                          <span>{l.from} {formatDate(booking.startDate, locale)}{booking.endDate ? ` ${l.to} ${formatDate(booking.endDate, locale)} · ${nights} ${nights > 1 ? l.nights : l.night}` : ''}</span>
                        ) : (
                          <span>{formatDate(booking.startDate, locale)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {booking.invoice && (
                      <div>
                        <div className="font-semibold text-charcoal">{formatMAD(booking.invoice.amount)}</div>
                        <Link href={`/${locale}/client/invoices`}>
                          <span className="text-xs text-gold-600 hover:underline">{l.invoice}</span>
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
