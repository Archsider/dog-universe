import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { Calendar, PawPrint, Package, Car, Plus, FileText, Clock, CheckCircle2, XCircle, AlertCircle, PlayCircle } from 'lucide-react';
import { formatDate, formatMAD } from '@/lib/utils';
import CancelBookingButton from './CancelBookingButton';

interface PageProps {
  params: { locale: string };
  searchParams: { status?: string };
}

const STATUS_COLORS: Record<string, string> = {
  PENDING:     'bg-amber-50 text-amber-700 border-amber-200',
  CONFIRMED:   'bg-blue-50 text-blue-700 border-blue-200',
  IN_PROGRESS: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  COMPLETED:   'bg-green-50 text-green-700 border-green-200',
  CANCELLED:   'bg-gray-100 text-gray-500 border-gray-200',
  REJECTED:    'bg-red-50 text-red-600 border-red-200',
};

const STATUS_ICONS: Record<string, React.ElementType> = {
  PENDING:     AlertCircle,
  CONFIRMED:   CheckCircle2,
  IN_PROGRESS: PlayCircle,
  COMPLETED:   CheckCircle2,
  CANCELLED:   XCircle,
  REJECTED:    XCircle,
};

export default async function HistoryPage({ params: { locale }, searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/auth/login`);

  const statusFilter = searchParams.status || '';

  const bookings = await prisma.booking.findMany({
    where: {
      clientId: session.user.id,
      ...(statusFilter && {
      status: statusFilter === 'CANCELLED'
        ? { in: ['CANCELLED', 'REJECTED'] as const }
        : statusFilter,
    }),
    },
    include: {
      bookingPets: { include: { pet: true } },
      boardingDetail: true,
      taxiDetail: true,
      invoice: { select: { id: true, invoiceNumber: true, amount: true, status: true } },
    },
    orderBy: { startDate: 'desc' },
  });

  const allBookings = await prisma.booking.findMany({
    where: { clientId: session.user.id },
    select: { status: true },
  });
  const counts: Record<string, number> = {};
  allBookings.forEach(b => { counts[b.status] = (counts[b.status] || 0) + 1; });

  const l = {
    fr: {
      title: 'Mes réservations',
      newBooking: 'Nouvelle réservation',
      all: 'Toutes',
      noBookings: 'Aucune réservation',
      noBookingsDesc: "Vous n'avez pas encore effectué de réservation.",
      boarding: 'Pension',
      taxi: 'Taxi animalier',
      nights: 'nuits',
      night: 'nuit',
      from: 'Du',
      to: 'au',
      invoicePaid: 'Payée',
      invoicePending: 'En attente',
      notes: 'Notes',
      estimated: 'estimé',
      statusLabels: { PENDING: 'En attente', CONFIRMED: 'Confirmée', IN_PROGRESS: 'En cours', COMPLETED: 'Terminée', CANCELLED: 'Annulée', REJECTED: 'Refusée' },
    },
    en: {
      title: 'My bookings',
      newBooking: 'New booking',
      all: 'All',
      noBookings: 'No bookings',
      noBookingsDesc: "You haven't made any bookings yet.",
      boarding: 'Boarding',
      taxi: 'Pet Taxi',
      nights: 'nights',
      night: 'night',
      from: 'From',
      to: 'to',
      invoicePaid: 'Paid',
      invoicePending: 'Pending',
      notes: 'Notes',
      estimated: 'estimated',
      statusLabels: { PENDING: 'Pending', CONFIRMED: 'Confirmed', IN_PROGRESS: 'In progress', COMPLETED: 'Completed', CANCELLED: 'Cancelled', REJECTED: 'Rejected' },
    },
  };
  const t = l[locale as keyof typeof l] || l.fr;

  const tabs = [
    { key: '', label: t.all, count: allBookings.length },
    { key: 'PENDING',     label: t.statusLabels.PENDING,     count: counts.PENDING     || 0 },
    { key: 'CONFIRMED',   label: t.statusLabels.CONFIRMED,   count: counts.CONFIRMED   || 0 },
    { key: 'IN_PROGRESS', label: t.statusLabels.IN_PROGRESS, count: counts.IN_PROGRESS || 0 },
    { key: 'COMPLETED',   label: t.statusLabels.COMPLETED,   count: counts.COMPLETED   || 0 },
    { key: 'CANCELLED',   label: t.statusLabels.CANCELLED,   count: (counts.CANCELLED  || 0) + (counts.REJECTED || 0) },
  ].filter(tab => tab.key === '' || tab.count > 0);

  const calculateNights = (start: Date, end: Date | null) => {
    if (!end) return 0;
    return Math.max(0, Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-serif font-bold text-charcoal">{t.title}</h1>
        <Link href={`/${locale}/client/bookings/new`}>
          <button className="flex items-center gap-2 px-4 py-2 bg-charcoal text-white rounded-lg hover:bg-charcoal/90 text-sm font-medium transition-colors">
            <Plus className="h-4 w-4" />
            {t.newBooking}
          </button>
        </Link>
      </div>

      {tabs.length > 1 && (
        <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
          {tabs.map(tab => (
            <Link key={tab.key} href={`?status=${tab.key}`}>
              <button className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                statusFilter === tab.key
                  ? 'bg-charcoal text-white'
                  : 'bg-white border border-ivory-200 text-gray-600 hover:border-gold-300'
              }`}>
                {tab.label}
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  statusFilter === tab.key ? 'bg-white/20 text-white' : 'bg-ivory-100 text-gray-500'
                }`}>
                  {tab.count}
                </span>
              </button>
            </Link>
          ))}
        </div>
      )}

      {bookings.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-[#F0D98A]/40">
          <Calendar className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p className="font-medium text-charcoal mb-1">{t.noBookings}</p>
          <p className="text-sm text-gray-400 mb-5">{t.noBookingsDesc}</p>
          <Link href={`/${locale}/client/bookings/new`}>
            <button className="inline-flex items-center gap-2 px-4 py-2 bg-charcoal text-white rounded-lg text-sm font-medium hover:bg-charcoal/90">
              <Plus className="h-4 w-4" />{t.newBooking}
            </button>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {bookings.map((booking) => {
            const pets = booking.bookingPets.map(bp => bp.pet);
            const isBoarding = booking.serviceType === 'BOARDING';
            const nights = isBoarding ? calculateNights(booking.startDate, booking.endDate) : 0;
            const canCancel = ['PENDING', 'CONFIRMED'].includes(booking.status);
            const StatusIcon = STATUS_ICONS[booking.status] || AlertCircle;
            const isDimmed = booking.status === 'CANCELLED' || booking.status === 'REJECTED';

            return (
              <div key={booking.id} className={`bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card ${isDimmed ? 'opacity-60' : ''}`}>
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-xl flex-shrink-0 ${isBoarding ? 'bg-gold-50' : 'bg-blue-50'}`}>
                      {isBoarding ? <Package className="h-5 w-5 text-gold-500" /> : <Car className="h-5 w-5 text-blue-500" />}
                    </div>
                    <div>
                      <p className="font-semibold text-charcoal">{isBoarding ? t.boarding : t.taxi}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <PawPrint className="h-3 w-3 text-gray-400" />
                        <span className="text-sm text-gray-500">{pets.map(p => p.name).join(', ')}</span>
                      </div>
                    </div>
                  </div>
                  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium flex-shrink-0 ${STATUS_COLORS[booking.status]}`}>
                    <StatusIcon className="h-3.5 w-3.5" />
                    {t.statusLabels[booking.status as keyof typeof t.statusLabels] || booking.status}
                  </div>
                </div>

                <div className="flex items-center gap-2 text-sm text-gray-600 mb-3 bg-ivory-50 rounded-lg px-3 py-2">
                  <Clock className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                  {isBoarding ? (
                    <span>
                      {t.from} <strong className="text-charcoal">{formatDate(booking.startDate, locale)}</strong>
                      {booking.endDate && (
                        <> {t.to} <strong className="text-charcoal">{formatDate(booking.endDate, locale)}</strong>
                        {' · '}<span className="text-gold-600 font-semibold">{nights} {nights > 1 ? t.nights : t.night}</span></>
                      )}
                    </span>
                  ) : (
                    <span><strong className="text-charcoal">{formatDate(booking.startDate, locale)}</strong></span>
                  )}
                </div>

                {booking.notes && (
                  <p className="text-xs text-gray-400 italic mb-3 px-1">{t.notes} : {booking.notes}</p>
                )}

                <div className="flex items-center justify-between gap-3 pt-3 border-t border-ivory-100">
                  <div className="flex items-center gap-2 min-w-0">
                    {booking.invoice ? (
                      <Link href={`/${locale}/client/invoices`} className="flex items-center gap-1.5 text-sm text-gold-600 hover:text-gold-700 font-medium">
                        <FileText className="h-4 w-4 flex-shrink-0" />
                        <span>{formatMAD(booking.invoice.amount)}</span>
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                          booking.invoice.status === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {booking.invoice.status === 'PAID' ? t.invoicePaid : t.invoicePending}
                        </span>
                      </Link>
                    ) : booking.totalPrice && booking.totalPrice > 0 ? (
                      <span className="text-sm font-semibold text-gold-600">
                        {formatMAD(booking.totalPrice)} <span className="text-xs text-gray-400 font-normal">({t.estimated})</span>
                      </span>
                    ) : null}
                  </div>
                  {canCancel && <CancelBookingButton bookingId={booking.id} locale={locale} />}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
