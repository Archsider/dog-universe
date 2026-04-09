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
import ExtendBookingSection from './ExtendBookingSection';
import RecordPaymentButton from '@/app/[locale]/admin/billing/CreateInvoiceButton';

interface PageProps { params: { locale: string; id: string } }

export default async function AdminReservationDetailPage({ params: { locale, id } }: PageProps) {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) redirect(`/${locale}/auth/login`);

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

  const supplementaryInvoice = await prisma.invoice.findFirst({
    where: { clientId: booking.client.id, notes: `EXTENSION_SURCHARGE:${id}` },
  });

  const bookingMessages = await prisma.notification.findMany({
    where: { userId: booking.client.id, type: 'ADMIN_MESSAGE', metadata: { contains: id } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, messageFr: true, messageEn: true, createdAt: true },
  });

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
            {booking.source === 'MANUAL' && (
              <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-medium">
                {locale === 'fr' ? 'Saisie manuelle' : 'Manual entry'}
              </span>
            )}
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
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="font-mono text-sm font-semibold text-charcoal">{booking.invoice.invoiceNumber}</p>
                  <a href={`/api/invoices/${booking.invoice.id}/pdf`} className="text-xs text-gold-600 hover:underline" target="_blank" rel="noopener noreferrer">PDF</a>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">{locale === 'fr' ? 'Total' : 'Total'}</span>
                    <span className="font-bold text-charcoal">{formatMAD(booking.invoice.amount)}</span>
                  </div>
                  {booking.invoice.paidAmount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">{locale === 'fr' ? 'Payé' : 'Paid'}</span>
                      <span className="font-medium text-green-700">{formatMAD(booking.invoice.paidAmount)}</span>
                    </div>
                  )}
                  {booking.invoice.status !== 'PAID' && (
                    <div className="flex justify-between border-t border-ivory-100 pt-1">
                      <span className="text-gray-600 font-medium">{locale === 'fr' ? 'Restant' : 'Remaining'}</span>
                      <span className="font-bold text-orange-600">{formatMAD(Math.max(0, booking.invoice.amount - booking.invoice.paidAmount))}</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <RecordPaymentButton
                    invoiceId={booking.invoice.id}
                    currentStatus={booking.invoice.status}
                    locale={locale}
                    invoiceAmount={booking.invoice.amount}
                    paidAmount={booking.invoice.paidAmount}
                  />
                  <Link href={`/${locale}/admin/billing?status=`} className="text-xs text-gray-400 hover:text-gold-600">
                    {locale === 'fr' ? 'Voir facturation' : 'View billing'}
                  </Link>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-400">{l.noInvoice}</p>
                <CreateInvoiceFromBookingButton
                  bookingId={booking.id}
                  clientId={booking.client.id}
                  locale={locale}
                />
              </div>
            )}
            {supplementaryInvoice && (
              <div className="mt-4 pt-4 border-t border-[#F0D98A]/40 space-y-2">
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
                  {locale === 'fr' ? 'Supplément prolongation' : 'Extension surcharge'}
                </p>
                <div className="flex items-center justify-between">
                  <p className="font-mono text-sm font-semibold text-charcoal">{supplementaryInvoice.invoiceNumber}</p>
                  <a href={`/api/invoices/${supplementaryInvoice.id}/pdf`} className="text-xs text-gold-600 hover:underline" target="_blank" rel="noopener noreferrer">PDF</a>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Total</span>
                    <span className="font-bold text-charcoal">{formatMAD(supplementaryInvoice.amount)}</span>
                  </div>
                  {supplementaryInvoice.paidAmount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">{locale === 'fr' ? 'Payé' : 'Paid'}</span>
                      <span className="font-medium text-green-700">{formatMAD(supplementaryInvoice.paidAmount)}</span>
                    </div>
                  )}
                  {supplementaryInvoice.status !== 'PAID' && (
                    <div className="flex justify-between border-t border-ivory-100 pt-1">
                      <span className="text-gray-600 font-medium">{locale === 'fr' ? 'Restant' : 'Remaining'}</span>
                      <span className="font-bold text-orange-600">{formatMAD(Math.max(0, supplementaryInvoice.amount - supplementaryInvoice.paidAmount))}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-500">Statut</span>
                    <span className={`text-xs font-semibold ${supplementaryInvoice.status === 'PAID' ? 'text-green-700' : 'text-orange-600'}`}>
                      {supplementaryInvoice.status}
                    </span>
                  </div>
                </div>
                <RecordPaymentButton
                  invoiceId={supplementaryInvoice.id}
                  currentStatus={supplementaryInvoice.status}
                  locale={locale}
                  invoiceAmount={supplementaryInvoice.amount}
                  paidAmount={supplementaryInvoice.paidAmount}
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

          <ReservationActions booking={{ id: booking.id, status: booking.status, serviceType: booking.serviceType }} locale={locale} />
          {isBoarding && !['CANCELLED', 'REJECTED', 'COMPLETED'].includes(booking.status) && (
            <ExtendBookingSection
              booking={{
                id: booking.id,
                startDate: booking.startDate,
                endDate: booking.endDate ?? null,
                totalPrice: booking.totalPrice,
                hasExtensionRequest: booking.hasExtensionRequest,
                extensionRequestedEndDate: booking.extensionRequestedEndDate ?? null,
                extensionRequestNote: booking.extensionRequestNote ?? null,
              }}
              locale={locale}
            />
          )}
          <AdminMessageSection bookingId={booking.id} locale={locale} initialMessages={bookingMessages} />
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
