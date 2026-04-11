import { auth } from '../../../../../../auth';
import { redirect, notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatDate, formatMAD, getBookingStatusColor } from '@/lib/utils';
import ReservationActions from './ReservationActions';
import DeleteBookingButton from './DeleteBookingButton';
import CreateInvoiceFromBookingButton from './CreateInvoiceFromBookingButton';
import StayPhotosSection from './StayPhotosSection';
import AdminMessageSection from './AdminMessageSection';
import ExtendBookingSection from './ExtendBookingSection';
import MergeBookingsSection from './MergeBookingsSection';
import EditDatesSection from './EditDatesSection';
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
      bookingItems: { orderBy: { id: 'asc' } },
    },
  });

  if (!booking) notFound();

  const supplementaryInvoice = await prisma.invoice.findFirst({
    where: {
      OR: [
        { supplementaryForBookingId: id },
        // legacy fallback for rows created before the FK column was added
        { clientId: booking.client.id, notes: `EXTENSION_SURCHARGE:${id}` },
      ],
    },
    orderBy: { createdAt: 'desc' },
  });

  // Pending extension booking (if any) — for showing a notice on the original booking
  const pendingExtensionBooking = await prisma.booking.findFirst({
    where: { extensionForBookingId: id, status: 'PENDING_EXTENSION' },
    select: { id: true, startDate: true, endDate: true, totalPrice: true },
  });

  // If this IS a PENDING_EXTENSION booking, find the original booking
  const originalBooking = booking.extensionForBookingId
    ? await prisma.booking.findUnique({
        where: { id: booking.extensionForBookingId },
        select: { id: true, startDate: true, endDate: true, totalPrice: true, status: true },
      })
    : null;

  // Adjacent bookings for manual merge (same client, BOARDING, contiguous dates)
  // New rule: same-day contiguity (endDate === startDate)
  type AdjacentBooking = {
    id: string;
    startDate: Date;
    endDate: Date | null;
    totalPrice: number;
    status: string;
    pets: string;
    relation: 'before' | 'after';
  };
  const adjacentBookings: AdjacentBooking[] = [];
  if (booking.serviceType === 'BOARDING') {
    const clientId = booking.client.id;

    // Booking that ends on the same day this one starts (same-day contiguous)
    // OR ends the day before (legacy next-day contiguous)
    if (booking.startDate) {
      const startDayStart = new Date(booking.startDate);
      startDayStart.setUTCHours(0, 0, 0, 0);
      const startDayEnd = new Date(booking.startDate);
      startDayEnd.setUTCHours(23, 59, 59, 999);

      // Also check the day before (legacy behavior)
      const dayBefore = new Date(booking.startDate);
      dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
      const dayBeforeStart = new Date(dayBefore);
      dayBeforeStart.setUTCHours(0, 0, 0, 0);
      const dayBeforeEnd = new Date(dayBefore);
      dayBeforeEnd.setUTCHours(23, 59, 59, 999);

      const before = await prisma.booking.findFirst({
        where: {
          id: { not: id },
          clientId,
          serviceType: 'BOARDING',
          status: { notIn: ['CANCELLED', 'REJECTED'] },
          endDate: {
            gte: dayBeforeStart,
            lte: startDayEnd, // covers both same-day and day-before
          },
        },
        include: { bookingPets: { include: { pet: true } } },
        orderBy: { startDate: 'desc' },
      });
      if (before) {
        adjacentBookings.push({
          id: before.id,
          startDate: before.startDate,
          endDate: before.endDate,
          totalPrice: before.totalPrice,
          status: before.status,
          pets: before.bookingPets.map(bp => bp.pet.name).join(', '),
          relation: 'before',
        });
      }
    }

    // Booking that starts on the same day this one ends (same-day contiguous)
    // OR starts the day after (legacy next-day contiguous)
    if (booking.endDate) {
      const endDayStart = new Date(booking.endDate);
      endDayStart.setUTCHours(0, 0, 0, 0);
      const endDayEnd = new Date(booking.endDate);
      endDayEnd.setUTCHours(23, 59, 59, 999);

      // Also check the day after (legacy behavior)
      const dayAfter = new Date(booking.endDate);
      dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);
      const dayAfterStart = new Date(dayAfter);
      dayAfterStart.setUTCHours(0, 0, 0, 0);
      const dayAfterEnd = new Date(dayAfter);
      dayAfterEnd.setUTCHours(23, 59, 59, 999);

      const after = await prisma.booking.findFirst({
        where: {
          id: { not: id },
          clientId,
          serviceType: 'BOARDING',
          status: { notIn: ['CANCELLED', 'REJECTED'] },
          startDate: {
            gte: endDayStart, // covers same-day and day-after
            lte: dayAfterEnd,
          },
        },
        include: { bookingPets: { include: { pet: true } } },
        orderBy: { startDate: 'asc' },
      });
      if (after) {
        adjacentBookings.push({
          id: after.id,
          startDate: after.startDate,
          endDate: after.endDate,
          totalPrice: after.totalPrice,
          status: after.status,
          pets: after.bookingPets.map(bp => bp.pet.name).join(', '),
          relation: 'after',
        });
      }
    }
  }

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
      originalBooking: 'Réservation d\'origine',
      pendingExtension: 'Extension en attente',
      viewExtension: 'Voir la demande',
      viewOriginal: 'Voir la réservation d\'origine',
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
      originalBooking: 'Original booking',
      pendingExtension: 'Pending extension',
      viewExtension: 'View request',
      viewOriginal: 'View original booking',
    },
  };

  const sl: Record<string, Record<string, string>> = {
    fr: { PENDING: 'En attente', CONFIRMED: 'Confirmé', CANCELLED: 'Annulé', REJECTED: 'Refusé', COMPLETED: 'Terminé', IN_PROGRESS: 'En cours', PENDING_EXTENSION: 'Extension en attente' },
    en: { PENDING: 'Pending', CONFIRMED: 'Confirmed', CANCELLED: 'Cancelled', REJECTED: 'Rejected', COMPLETED: 'Completed', IN_PROGRESS: 'In progress', PENDING_EXTENSION: 'Extension pending' },
  };

  const l = labels[locale as keyof typeof labels] || labels.fr;
  const statusLbls = sl[locale] || sl.fr;
  const isBoarding = booking.serviceType === 'BOARDING';
  const isPendingExtension = booking.status === 'PENDING_EXTENSION';
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
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-serif font-bold text-charcoal font-mono">{booking.id.slice(0, 8).toUpperCase()}</h1>
            <Badge className={`${getBookingStatusColor(booking.status)}`}>{statusLbls[booking.status] ?? booking.status}</Badge>
            {booking.source === 'MANUAL' && (
              <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-medium">
                {locale === 'fr' ? 'Saisie manuelle' : 'Manual entry'}
              </span>
            )}
            {isPendingExtension && (
              <span className="text-xs bg-orange-50 text-orange-700 border border-orange-200 px-2 py-0.5 rounded-full font-medium">
                {locale === 'fr' ? 'Demande d\'extension' : 'Extension request'}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500">{formatDate(booking.createdAt, locale)}</p>
        </div>
        <DeleteBookingButton bookingId={id} locale={locale} />
      </div>

      {/* Link to original booking if this is a PENDING_EXTENSION */}
      {isPendingExtension && originalBooking && (
        <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-orange-50 border border-orange-200 rounded-xl text-sm">
          <span className="font-medium text-orange-800">{l.originalBooking} :</span>
          <Link
            href={`/${locale}/admin/reservations/${originalBooking.id}`}
            className="font-mono font-bold text-orange-700 hover:underline flex items-center gap-1"
          >
            #{originalBooking.id.slice(0, 8).toUpperCase()}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <span className="text-gray-500">
            {formatDate(originalBooking.startDate, locale)}
            {originalBooking.endDate ? ` → ${formatDate(originalBooking.endDate, locale)}` : ''}
          </span>
        </div>
      )}

      {/* Notice on original booking if there's a pending extension */}
      {!isPendingExtension && pendingExtensionBooking && (
        <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm">
          <span className="font-medium text-amber-800">{l.pendingExtension} :</span>
          <Link
            href={`/${locale}/admin/reservations/${pendingExtensionBooking.id}`}
            className="font-mono font-bold text-amber-700 hover:underline flex items-center gap-1"
          >
            #{pendingExtensionBooking.id.slice(0, 8).toUpperCase()}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          {pendingExtensionBooking.endDate && (
            <span className="text-gray-500">
              → {formatDate(pendingExtensionBooking.endDate, locale)}
            </span>
          )}
        </div>
      )}

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
                    <span className={`text-xs font-semibold ${
                      supplementaryInvoice.status === 'PAID'
                        ? 'text-green-700'
                        : supplementaryInvoice.status === 'PARTIALLY_PAID'
                        ? 'text-blue-600'
                        : 'text-orange-600'
                    }`}>
                      {supplementaryInvoice.status === 'PAID'
                        ? (locale === 'fr' ? 'Payée' : 'Paid')
                        : supplementaryInvoice.status === 'PARTIALLY_PAID'
                        ? (locale === 'fr' ? 'Part. payée' : 'Part. paid')
                        : (locale === 'fr' ? 'En attente' : 'Pending')}
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

          {booking.bookingItems.length > 0 && (
            <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card">
              <h3 className="font-semibold text-charcoal mb-3 text-sm">
                {locale === 'fr' ? 'Produits / services additionnels' : 'Extra products / services'}
              </h3>
              <div className="border border-ivory-200 rounded-xl overflow-hidden">
                <div className="bg-ivory-50 px-3 py-2 grid grid-cols-[1fr_36px_72px_64px] gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  <span>{locale === 'fr' ? 'Description' : 'Description'}</span>
                  <span className="text-center">{locale === 'fr' ? 'Qté' : 'Qty'}</span>
                  <span className="text-right">P.U.</span>
                  <span className="text-right">Total</span>
                </div>
                {booking.bookingItems.map(item => (
                  <div key={item.id} className="px-3 py-2 grid grid-cols-[1fr_36px_72px_64px] gap-2 border-t border-ivory-100 text-xs items-center">
                    <span className="text-charcoal">{item.description}</span>
                    <span className="text-center text-gray-500">{item.quantity}</span>
                    <span className="text-right text-gray-500">{formatMAD(item.unitPrice)}</span>
                    <span className="text-right font-medium text-charcoal">{formatMAD(item.total)}</span>
                  </div>
                ))}
                <div className="px-3 py-2 border-t border-gold-200/60 bg-ivory-50 flex justify-between items-center text-xs">
                  <span className="font-semibold text-charcoal">{locale === 'fr' ? 'Sous-total additionnels' : 'Extras subtotal'}</span>
                  <span className="font-bold text-gold-600">
                    {formatMAD(booking.bookingItems.reduce((s, i) => s + i.total, 0))}
                  </span>
                </div>
              </div>
            </div>
          )}

          <ReservationActions booking={{ id: booking.id, status: booking.status, serviceType: booking.serviceType }} locale={locale} />

          {/* Edit dates (available on all BOARDING bookings) */}
          {isBoarding && (
            <EditDatesSection
              booking={{ id: booking.id, startDate: booking.startDate, endDate: booking.endDate ?? null, serviceType: booking.serviceType }}
              locale={locale}
            />
          )}

          {isBoarding && !['CANCELLED', 'REJECTED', 'COMPLETED'].includes(booking.status) && !isPendingExtension && (
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
          {isBoarding && (
            <MergeBookingsSection
              booking={{ id: booking.id }}
              adjacentBookings={adjacentBookings}
              locale={locale}
            />
          )}
          {!isPendingExtension && (
            <AdminMessageSection bookingId={booking.id} locale={locale} initialMessages={bookingMessages} />
          )}
        </div>
      </div>

      {/* Stay photos — full width below the grid */}
      {isBoarding && !isPendingExtension && (
        <div className="mt-4">
          <StayPhotosSection bookingId={booking.id} locale={locale} />
        </div>
      )}
    </div>
  );
}
