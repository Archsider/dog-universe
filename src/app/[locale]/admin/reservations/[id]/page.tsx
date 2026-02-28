import { auth } from '../../../../../../auth';
import { redirect, notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatDate, formatMAD, getBookingStatusColor } from '@/lib/utils';
import ReservationActions from './ReservationActions';
import DeleteBookingButton from './DeleteBookingButton';
import CreateInvoiceFromBookingButton from './CreateInvoiceFromBookingButton';
import StayPhotosSection from './StayPhotosSection';
import AdminMessageSection from './AdminMessageSection';

interface PageProps { params: { locale: string; id: string } }

export default async function AdminReservationDetailPage({ params: { locale, id } }: PageProps) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') redirect(`/${locale}/auth/login`);

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true, email: true, phone: true } },
      bookingPets: { include: { pet: true } },
      boardingDetail: true,
      taxiDetail: true,
      invoice: true,
    },
  });

  if (!booking) notFound();

  const CANCELLATION_REASONS: Record<string, { fr: string; en: string }> = {
    plans_changed:  { fr: 'Changement de plans',            en: 'Plans changed' },
    emergency:      { fr: 'Urgence personnelle',             en: 'Personal emergency' },
    found_other:    { fr: 'Autre solution trouvée',          en: 'Found another solution' },
    dates_changed:  { fr: 'Dates modifiées',                 en: 'Dates changed' },
    price:          { fr: 'Raison financière',               en: 'Financial reason' },
    other:          { fr: 'Autre',                           en: 'Other' },
  };

  const labels = {
    fr: {
      back: 'Réservations',
      client: 'Client',
      animals: 'Animaux',
      type: 'Type',
      boarding: 'Pension',
      taxi: 'Taxi',
      dates: 'Dates',
      grooming: 'Toilettage',
      yes: 'Oui',
      no: 'Non',
      taxiType: 'Type de trajet',
      invoice: 'Facture liée',
      noInvoice: 'Aucune facture',
      notes: 'Notes client',
      cancelReason: "Motif d'annulation",
    },
    en: {
      back: 'Bookings',
      client: 'Client',
      animals: 'Pets',
      type: 'Type',
      boarding: 'Boarding',
      taxi: 'Taxi',
      dates: 'Dates',
      grooming: 'Grooming',
      yes: 'Yes',
      no: 'No',
      taxiType: 'Trip type',
      invoice: 'Invoice',
      noInvoice: 'No invoice',
      notes: 'Client notes',
      cancelReason: 'Cancellation reason',
    },
  };

  const sl: Record<string, Record<string, string>> = {
    fr: { PENDING: 'En attente', CONFIRMED: 'Confirmé', CANCELLED: 'Annulé', REJECTED: 'Refusé', COMPLETED: 'Terminé', IN_PROGRESS: 'En cours' },
    en: { PENDING: 'Pending', CONFIRMED: 'Confirmed', CANCELLED: 'Cancelled', REJECTED: 'Rejected', COMPLETED: 'Completed', IN_PROGRESS: 'In progress' },
  };

  const l = labels[locale as keyof typeof labels] || labels.fr;
  const statusLbls = sl[locale] || sl.fr;
  const isBoarding = booking.serviceType === 'BOARDING';
  const nights = booking.endDate
    ? Math.max(0, Math.floor((booking.endDate.getTime() - booking.startDate.getTime()) / (1000 * 60 * 60 * 24)))
    : 0;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/${locale}/admin/reservations`} className="text-gray-400 hover:text-charcoal">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-serif font-bold text-charcoal font-mono">{booking.id.slice(0, 8).toUpperCase()}</h1>
            <Badge className={`${getBookingStatusColor(booking.status)}`}>{statusLbls[booking.status]}</Badge>
          </div>
          <p className="text-sm text-gray-500">{formatDate(booking.createdAt, locale)}</p>
        </div>
        <DeleteBookingButton bookingId={id} locale={locale} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
            <h3 className="font-semibold text-charcoal mb-3 text-sm">{l.client}</h3>
            <Link href={`/${locale}/admin/clients/${booking.client.id}`} className="text-gold-600 hover:underline font-medium">
              {booking.client.name}
            </Link>
            <p className="text-sm text-gray-500">{booking.client.email}</p>
            {booking.client.phone && <p className="text-sm text-gray-500">{booking.client.phone}</p>}
          </div>

          <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
            <h3 className="font-semibold text-charcoal mb-3 text-sm">{l.animals}</h3>
            <div className="space-y-2">
              {booking.bookingPets.map(bp => (
                <div key={bp.id} className="flex items-center justify-between text-sm">
                  <Link href={`/${locale}/admin/animals/${bp.pet.id}`} className="text-charcoal hover:text-gold-600 font-medium">
                    {bp.pet.name}
                  </Link>
                  <span className="text-gray-400">{bp.pet.breed || bp.pet.species}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
            <h3 className="font-semibold text-charcoal mb-3 text-sm">{l.invoice}</h3>
            {booking.invoice ? (
              <div>
                <p className="font-mono text-sm font-semibold text-charcoal">{booking.invoice.invoiceNumber}</p>
                <p className="text-lg font-bold text-gold-600">{formatMAD(booking.invoice.amount)}</p>
                <a href={`/api/invoices/${booking.invoice.id}/pdf`} className="text-xs text-gold-600 hover:underline" target="_blank" rel="noopener noreferrer">
                  PDF
                </a>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-400">{l.noInvoice}</p>
                <CreateInvoiceFromBookingButton
                  bookingId={booking.id}
                  clientId={booking.client.id}
                  serviceType={booking.serviceType}
                  nights={nights}
                  petNames={booking.bookingPets.map(bp => bp.pet.name).join(', ')}
                  boardingDetail={booking.boardingDetail ? {
                    pricePerNight: booking.boardingDetail.pricePerNight,
                    includeGrooming: booking.boardingDetail.includeGrooming,
                    groomingPrice: booking.boardingDetail.groomingPrice,
                    taxiAddonPrice: booking.boardingDetail.taxiAddonPrice,
                  } : null}
                  taxiDetail={booking.taxiDetail ? {
                    taxiType: booking.taxiDetail.taxiType,
                    price: booking.taxiDetail.price,
                  } : null}
                  locale={locale}
                />
              </div>
            )}
          </div>
        </div>

        {/* Right */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
            <h3 className="font-semibold text-charcoal mb-3 text-sm">{l.type} / {l.dates}</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">{l.type}</span>
                <span className="font-medium text-charcoal">{isBoarding ? l.boarding : l.taxi}</span>
              </div>
              {isBoarding ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-500">{l.dates}</span>
                    <span className="font-medium text-charcoal">
                      {formatDate(booking.startDate, locale)}{booking.endDate ? ` → ${formatDate(booking.endDate, locale)}` : ''}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">{locale === 'fr' ? 'Durée' : 'Duration'}</span>
                    <span className="font-medium text-charcoal">{nights} {locale === 'fr' ? 'nuit(s)' : 'night(s)'}</span>
                  </div>
                  {booking.boardingDetail && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">{l.grooming}</span>
                      <span className="font-medium text-charcoal">{booking.boardingDetail.includeGrooming ? l.yes : l.no}</span>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-500">{l.dates}</span>
                    <span className="font-medium text-charcoal">{formatDate(booking.startDate, locale)}</span>
                  </div>
                  {booking.taxiDetail && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">{l.taxiType}</span>
                      <span className="font-medium text-charcoal">{booking.taxiDetail.taxiType}</span>
                    </div>
                  )}
                </>
              )}
              {booking.notes && (
                <div className="mt-2 pt-2 border-t border-ivory-100">
                  <p className="text-gray-500 text-xs mb-1">{l.notes}</p>
                  <p className="text-charcoal">{booking.notes}</p>
                </div>
              )}
              {booking.cancellationReason && (
                <div className="mt-2 pt-2 border-t border-red-100">
                  <p className="text-red-400 text-xs mb-1">{l.cancelReason}</p>
                  <p className="text-charcoal font-medium">
                    {CANCELLATION_REASONS[booking.cancellationReason]?.[locale as 'fr' | 'en'] ?? booking.cancellationReason}
                  </p>
                </div>
              )}
            </div>
          </div>

          <ReservationActions booking={{ id: booking.id, status: booking.status }} locale={locale} />
          <AdminMessageSection bookingId={booking.id} locale={locale} />
        </div>
      </div>

      {/* Stay photos — full width below the grid */}
      {isBoarding && (
        <div className="mt-4">
          <StayPhotosSection bookingId={booking.id} locale={locale} />
        </div>
      )}
    </div>
  );
}
