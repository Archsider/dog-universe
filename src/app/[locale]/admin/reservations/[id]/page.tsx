import { auth } from '../../../../../../auth';
import { redirect, notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import type { Decimal } from '@prisma/client/runtime/library';
import Link from 'next/link';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatDate, formatMAD, getBookingStatusColor } from '@/lib/utils';
import { getPensionPrice, getPricingSettings } from '@/lib/pricing';
import { differenceInCalendarDays } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { toNumber } from '@/lib/decimal';
import ReservationActions from './ReservationActions';
import type { TaxiTripData } from '@/components/shared/TaxiTimeline';
import DeleteBookingButton from './DeleteBookingButton';
import StayPhotosSection from './StayPhotosSection';
import AdminMessageSection from './AdminMessageSection';
import AddonRequestsSection from './AddonRequestsSection';
import ExtendBookingSection from './ExtendBookingSection';
import MergeBookingsSection from './MergeBookingsSection';
import EditDatesSection from './EditDatesSection';
import EditTaxiAddonSection from './EditTaxiAddonSection';
import EditGroomingSection from './EditGroomingSection';
import BookingClientSection from './BookingClientSection';
import BookingPetsSection from './BookingPetsSection';
import BookingInvoiceSection from './BookingInvoiceSection';
import BookingServiceSection from './BookingServiceSection';
import AddProductSection from './AddProductSection';
import UpsellSuggestions from '@/components/shared/UpsellSuggestions';
import CheckoutBookingButton from './CheckoutBookingButton';
import BookingTaxiSection from './BookingTaxiSection';

interface PageProps { params: Promise<{ locale: string; id: string }> }

export default async function AdminReservationDetailPage({ params }: PageProps) {
  const { locale, id } = await params;
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) redirect(`/${locale}/auth/login`);

  const booking = await prisma.booking.findFirst({
    where: { id, deletedAt: null }, // soft-delete: required — no global extension (Edge Runtime incompatible)
    include: {
      client: { select: { id: true, name: true, email: true, phone: true } },
      bookingPets: { include: { pet: true } },
      boardingDetail: true,
      taxiDetail: true,
      taxiTrips: {
        include: { history: { orderBy: { timestamp: 'asc' } } },
        orderBy: { createdAt: 'asc' },
      },
      invoice: { include: { items: { orderBy: { id: 'asc' } } } },
      bookingItems: { orderBy: { id: 'asc' } },
      stayPhotos: { orderBy: { createdAt: 'desc' }, take: 200 },
    },
  });

  if (!booking) notFound();

  // ── Pré-calcul des fenêtres de date pour les requêtes "adjacent bookings" ─
  // (logique pure, indépendante de la DB — permet de paralléliser les 6 queries)
  const clientId = booking.client.id;
  let beforeWindow: { gte: Date; lte: Date } | null = null;
  let afterWindow: { gte: Date; lte: Date } | null = null;
  if (booking.serviceType === 'BOARDING') {
    if (booking.startDate) {
      const startDayEnd = new Date(booking.startDate);
      startDayEnd.setUTCHours(23, 59, 59, 999);
      const dayBefore = new Date(booking.startDate);
      dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
      const dayBeforeStart = new Date(dayBefore);
      dayBeforeStart.setUTCHours(0, 0, 0, 0);
      beforeWindow = { gte: dayBeforeStart, lte: startDayEnd };
    }
    if (booking.endDate) {
      const endDayStart = new Date(booking.endDate);
      endDayStart.setUTCHours(0, 0, 0, 0);
      const dayAfter = new Date(booking.endDate);
      dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);
      const dayAfterEnd = new Date(dayAfter);
      dayAfterEnd.setUTCHours(23, 59, 59, 999);
      afterWindow = { gte: endDayStart, lte: dayAfterEnd };
    }
  }

  type AdjacentBooking = {
    id: string;
    startDate: Date;
    endDate: Date | null;
    totalPrice: number | Decimal;
    status: string;
    pets: string;
    relation: 'before' | 'after';
  };

  // ── 7 queries indépendantes en parallèle ──────────────────────────────────
  const [
    supplementaryInvoice,
    pendingExtensionBooking,
    originalBooking,
    before,
    after,
    rawBookingMessages,
    addonRequestNotifs,
  ] = await Promise.all([
    prisma.invoice.findFirst({
      where: {
        OR: [
          { supplementaryForBookingId: id },
          // legacy fallback for rows created before the FK column was added
          { clientId, notes: `EXTENSION_SURCHARGE:${id}` },
        ],
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.booking.findFirst({
      where: { extensionForBookingId: id, status: 'PENDING_EXTENSION', deletedAt: null }, // soft-delete: required — no global extension (Edge Runtime incompatible)
      select: { id: true, startDate: true, endDate: true, totalPrice: true },
    }),
    booking.extensionForBookingId
      ? prisma.booking.findFirst({
          where: { id: booking.extensionForBookingId, deletedAt: null }, // soft-delete: required — no global extension (Edge Runtime incompatible)
          select: { id: true, startDate: true, endDate: true, totalPrice: true, status: true },
        })
      : Promise.resolve(null),
    beforeWindow
      ? prisma.booking.findFirst({
          where: {
            id: { not: id },
            clientId,
            serviceType: 'BOARDING',
            status: { notIn: ['CANCELLED', 'REJECTED'] },
            endDate: beforeWindow,
            deletedAt: null, // soft-delete: required — no global extension (Edge Runtime incompatible)
          },
          include: { bookingPets: { include: { pet: true } } },
          orderBy: { startDate: 'desc' },
        })
      : Promise.resolve(null),
    afterWindow
      ? prisma.booking.findFirst({
          where: {
            id: { not: id },
            clientId,
            serviceType: 'BOARDING',
            status: { notIn: ['CANCELLED', 'REJECTED'] },
            startDate: afterWindow,
            deletedAt: null, // soft-delete: required — no global extension (Edge Runtime incompatible)
          },
          include: { bookingPets: { include: { pet: true } } },
          orderBy: { startDate: 'asc' },
        })
      : Promise.resolve(null),
    prisma.notification.findMany({
      where: { userId: clientId, type: 'ADMIN_MESSAGE' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, messageFr: true, messageEn: true, createdAt: true, metadata: true },
      take: 200,
    }),
    // Addon requests for this booking — dedicated model since 2026-05-10.
    // Legacy Notification.metadata rows are NOT migrated and ignored here.
    prisma.addonRequest.findMany({
      where: { bookingId: id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, serviceType: true, description: true, status: true, createdAt: true },
      take: 100,
    }),
  ]);

  // Filter booking messages by bookingId in JS (avoids fragile metadata.contains
  // substring scan — same pattern as client/bookings/[id]/page.tsx).
  const bookingMessages = rawBookingMessages.filter((n) => {
    if (!n.metadata) return false;
    try {
      const parsed: unknown = JSON.parse(n.metadata);
      return (
        typeof parsed === 'object' &&
        parsed !== null &&
        !Array.isArray(parsed) &&
        (parsed as Record<string, unknown>).bookingId === id
      );
    } catch { return false; }
  });

  type ParsedAddonRequest = {
    requestId: string;
    serviceType: 'PET_TAXI' | 'TOILETTAGE' | 'AUTRE';
    message: string;
    createdAt: string;
  };
  const addonRequests: ParsedAddonRequest[] = addonRequestNotifs
    .filter((r) =>
      r.serviceType === 'PET_TAXI' || r.serviceType === 'TOILETTAGE' || r.serviceType === 'AUTRE',
    )
    .map((r) => ({
      requestId: r.id,
      serviceType: r.serviceType as 'PET_TAXI' | 'TOILETTAGE' | 'AUTRE',
      message: r.description,
      createdAt: r.createdAt.toISOString(),
    }));

  const adjacentBookings: AdjacentBooking[] = [];
  if (before) {
    adjacentBookings.push({
      id: before.id,
      startDate: before.startDate,
      endDate: before.endDate,
      totalPrice: Number(before.totalPrice),
      status: before.status,
      pets: before.bookingPets.map(bp => bp.pet.name).join(', '),
      relation: 'before',
    });
  }
  if (after) {
    adjacentBookings.push({
      id: after.id,
      startDate: after.startDate,
      endDate: after.endDate,
      totalPrice: Number(after.totalPrice),
      status: after.status,
      pets: after.bookingPets.map(bp => bp.pet.name).join(', '),
      relation: 'after',
    });
  }

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
    fr: { PENDING: 'En attente', CONFIRMED: 'Confirmé', AT_PICKUP: 'Sur place', CANCELLED: 'Annulé', REJECTED: 'Refusé', COMPLETED: 'Terminé', IN_PROGRESS: 'En cours', PENDING_EXTENSION: 'Extension en attente' },
    en: { PENDING: 'Pending', CONFIRMED: 'Confirmed', AT_PICKUP: 'At pickup', CANCELLED: 'Cancelled', REJECTED: 'Rejected', COMPLETED: 'Completed', IN_PROGRESS: 'In progress', PENDING_EXTENSION: 'Extension pending' },
  };

  const l = labels[locale as keyof typeof labels] || labels.fr;
  const statusLbls = sl[locale] || sl.fr;
  const isBoarding = booking.serviceType === 'BOARDING';
  const isPendingExtension = booking.status === 'PENDING_EXTENSION';

  // Serialize TaxiTrip data for client components (Date → ISO string)
  const serializedTrips: TaxiTripData[] = booking.taxiTrips.map(t => ({
    id: t.id,
    tripType: t.tripType,
    status: t.status,
    date: t.date,
    time: t.time,
    address: t.address,
    history: t.history.map(h => ({
      id: h.id,
      status: h.status,
      timestamp: h.timestamp.toISOString(),
      updatedBy: h.updatedBy,
    })),
  }));
  const goTrip    = serializedTrips.find(t => t.tripType === 'OUTBOUND') ?? null;
  const returnTrip = serializedTrips.find(t => t.tripType === 'RETURN') ?? null;
  const standaloneTrip = serializedTrips.find(t => t.tripType === 'STANDALONE') ?? null;
  const nights = booking.endDate
    ? Math.max(0, Math.floor((booking.endDate.getTime() - booking.startDate.getTime()) / (1000 * 60 * 60 * 24)))
    : (() => {
        // BUG5: endDate not saved yet — use quantity from BOARDING invoice item as ground truth
        const boardingItem = booking.invoice?.items.find((i) => i.category === 'BOARDING');
        if (boardingItem) return boardingItem.quantity;
        // Fallback: days elapsed since start (for in-progress open-ended stays)
        return Math.max(0, Math.floor((Date.now() - booking.startDate.getTime()) / (1000 * 60 * 60 * 24)));
      })();

  // ── Live open-ended total (server-computed each render) ───────────────────
  // Shown as a provisional banner on the booking detail page for walk-in stays
  // that have no endDate yet. Uses the same pricing logic as the checkout route.
  const CASA_TZ = 'Africa/Casablanca';
  let liveOpenEnded: { nights: number; total: number; perPet: { name: string; price: number }[] } | null = null;
  if (booking.isOpenEnded && !['CANCELLED', 'REJECTED', 'COMPLETED'].includes(booking.status)) {
    try {
      const pricingSettings = await getPricingSettings();
      const liveNights = Math.max(
        1,
        differenceInCalendarDays(
          toZonedTime(new Date(), CASA_TZ),
          toZonedTime(booking.startDate, CASA_TZ),
        ),
      );
      const dogsCount = booking.bookingPets.filter((bp) => bp.pet.species === 'DOG').length;
      const perPet = booking.bookingPets.map((bp) => {
        const unitPrice = getPensionPrice(bp.pet, dogsCount, liveNights, pricingSettings);
        return { name: bp.pet.name, price: toNumber(unitPrice.times(liveNights)) };
      });
      liveOpenEnded = { nights: liveNights, total: perPet.reduce((s, p) => s + p.price, 0), perPet };
    } catch {
      // fail-open: banner hidden if pricing lookup fails
    }
  }

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

      {/* Live open-ended banner — shown only for active walk-in stays without endDate */}
      {liveOpenEnded && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-5 py-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-amber-900 flex items-center gap-2">
                <span>⏳</span>
                {locale === 'en' ? 'Open-ended stay in progress' : 'Séjour ouvert en cours'}
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                {locale === 'en'
                  ? `Day ${liveOpenEnded.nights} — provisional total`
                  : `Jour ${liveOpenEnded.nights} — total provisoire`}
                {' '}
                <span className="font-bold text-amber-900">{formatMAD(liveOpenEnded.total)}</span>
              </p>
              {liveOpenEnded.perPet.length > 1 && (
                <p className="text-xs text-amber-600 mt-0.5">
                  {liveOpenEnded.perPet.map((p) => `${p.name} : ${formatMAD(p.price)}`).join(' · ')}
                </p>
              )}
            </div>
            <p className="text-xs text-amber-600 italic">
              {locale === 'en'
                ? 'Price locked at checkout using actual nights × pension rate.'
                : 'Prix figé à la clôture : nuits réelles × tarif pension.'}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left */}
        <div className="space-y-4">
          <BookingClientSection
            client={booking.client}
            locale={locale}
            label={l.client}
            isBoarding={isBoarding}
            bookingId={booking.id}
            bookingStatus={booking.status}
            standaloneTrip={standaloneTrip}
            taxiTrips={booking.taxiTrips.map(t => ({
              tripType: t.tripType,
              trackingActive: t.trackingActive,
              trackingToken: t.trackingToken,
            }))}
          />

          <BookingPetsSection
            bookingPets={booking.bookingPets}
            locale={locale}
            label={l.animals}
          />

          <BookingInvoiceSection
            invoice={booking.invoice ?? null}
            supplementaryInvoice={supplementaryInvoice}
            bookingId={booking.id}
            clientId={booking.client.id}
            locale={locale}
            label={l.invoice}
            noInvoiceLabel={l.noInvoice}
            isOpenEnded={booking.isOpenEnded && !['CANCELLED', 'REJECTED', 'COMPLETED'].includes(booking.status)}
            liveTotal={liveOpenEnded?.total}
          />
        </div>

        {/* Right */}
        <div className="space-y-4">
          <BookingServiceSection
            locale={locale}
            isBoarding={isBoarding}
            serviceType={booking.serviceType}
            startDate={booking.startDate}
            endDate={booking.endDate ?? null}
            nights={nights}
            notes={booking.notes}
            cancellationReason={booking.cancellationReason}
            boardingDetail={booking.boardingDetail}
            taxiDetail={booking.taxiDetail}
            bookingItems={booking.bookingItems.map(i => ({
              id: i.id,
              description: i.description,
              quantity: i.quantity,
              unitPrice: Number(i.unitPrice),
              total: Number(i.total),
            }))}
            labels={{
              type: l.type,
              boarding: l.boarding,
              taxi: l.taxi,
              dates: l.dates,
              grooming: l.grooming,
              no: l.no,
              taxiType: l.taxiType,
              notes: l.notes,
              cancelReason: l.cancelReason,
            }}
          />

          <ReservationActions booking={{ id: booking.id, version: booking.version, status: booking.status, serviceType: booking.serviceType }} locale={locale} />

          {/* PET_TAXI navigation + standalone timeline */}
          {!isBoarding && booking.taxiDetail && (
            <BookingTaxiSection
              bookingId={booking.id}
              bookingStatus={booking.status}
              taxiDetail={booking.taxiDetail}
              standaloneTrip={standaloneTrip}
              rawStandaloneTrip={booking.taxiTrips.find(t => t.tripType === 'STANDALONE') ?? null}
              locale={locale}
            />
          )}

          {/* Edit dates (available on all BOARDING bookings) */}
          {isBoarding && (
            <EditDatesSection
              booking={{ id: booking.id, version: booking.version, startDate: booking.startDate, endDate: booking.endDate ?? null, serviceType: booking.serviceType }}
              locale={locale}
            />
          )}

          {/* Edit taxi add-ons (available on all BOARDING bookings) */}
          {isBoarding && (
            <EditTaxiAddonSection
              bookingId={booking.id}
              bookingVersion={booking.version}
              boardingDetail={booking.boardingDetail ? {
                taxiGoEnabled: booking.boardingDetail.taxiGoEnabled,
                taxiGoDate: booking.boardingDetail.taxiGoDate,
                taxiGoTime: booking.boardingDetail.taxiGoTime,
                taxiGoAddress: booking.boardingDetail.taxiGoAddress,
                taxiGoLat: booking.boardingDetail.taxiGoLat ?? null,
                taxiGoLng: booking.boardingDetail.taxiGoLng ?? null,
                taxiReturnEnabled: booking.boardingDetail.taxiReturnEnabled,
                taxiReturnDate: booking.boardingDetail.taxiReturnDate,
                taxiReturnTime: booking.boardingDetail.taxiReturnTime,
                taxiReturnAddress: booking.boardingDetail.taxiReturnAddress,
                taxiReturnLat: booking.boardingDetail.taxiReturnLat ?? null,
                taxiReturnLng: booking.boardingDetail.taxiReturnLng ?? null,
              } : null}
              goTrip={goTrip}
              returnTrip={returnTrip}
              goTracking={(() => {
                const raw = booking.taxiTrips.find(t => t.tripType === 'OUTBOUND');
                return raw ? { trackingActive: raw.trackingActive, trackingToken: raw.trackingToken } : null;
              })()}
              returnTracking={(() => {
                const raw = booking.taxiTrips.find(t => t.tripType === 'RETURN');
                return raw ? { trackingActive: raw.trackingActive, trackingToken: raw.trackingToken } : null;
              })()}
              locale={locale}
            />
          )}

          {/* Grooming status (available on all BOARDING bookings) */}
          {isBoarding && (
            <EditGroomingSection
              bookingId={booking.id}
              bookingVersion={booking.version}
              boardingDetail={booking.boardingDetail ? {
                includeGrooming: booking.boardingDetail.includeGrooming,
                groomingSize: booking.boardingDetail.groomingSize,
                groomingStatus: booking.boardingDetail.groomingStatus,
              } : null}
              locale={locale}
            />
          )}

          {/* Open-ended checkout — visible for any active boarding stay without
              a known endDate (walk-in flag OR endDate=null are treated identically). */}
          {isBoarding && (booking.isOpenEnded || booking.endDate == null) && !['CANCELLED', 'REJECTED', 'COMPLETED'].includes(booking.status) && (
            <CheckoutBookingButton bookingId={booking.id} locale={locale} />
          )}

          {/* Suggestions upsell smart — détection auto espèce + âge */}
          {isBoarding && !isPendingExtension && (
            <UpsellSuggestions
              bookingId={booking.id}
              context="admin"
              locale={locale}
              hasInvoice={!!booking.invoice}
            />
          )}

          {/* Add product to invoice — walk-in friendly. Available on any boarding booking with an invoice. */}
          {isBoarding && !isPendingExtension && (
            <AddProductSection
              bookingId={booking.id}
              hasInvoice={!!booking.invoice}
              initialItems={(booking.invoice?.items ?? []).map((it) => ({
                id: it.id,
                description: it.description,
                quantity: it.quantity,
                unitPrice: toNumber(it.unitPrice),
                total: toNumber(it.total),
                category: String(it.category),
              }))}
              startDate={booking.startDate.toISOString()}
              endDate={booking.endDate ? booking.endDate.toISOString() : null}
              isOpenEnded={booking.isOpenEnded || booking.endDate == null}
              pricePerNight={toNumber(booking.boardingDetail?.pricePerNight ?? 0)}
              petCount={booking.bookingPets.length}
              locale={locale}
            />
          )}

          {isBoarding && !['CANCELLED', 'REJECTED', 'COMPLETED'].includes(booking.status) && !isPendingExtension && (
            <ExtendBookingSection
              booking={{
                id: booking.id,
                version: booking.version,
                startDate: booking.startDate,
                endDate: booking.endDate ?? null,
                totalPrice: Number(booking.totalPrice),
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
          {!isPendingExtension && (
            <AddonRequestsSection
              bookingRef={booking.id.slice(0, 8).toUpperCase()}
              clientName={booking.client.name}
              clientPhone={booking.client.phone}
              requests={addonRequests}
              locale={locale}
            />
          )}
        </div>
      </div>

      {/* Stay photos — full width below the grid */}
      {isBoarding && !isPendingExtension && (
        <div className="mt-4">
          <StayPhotosSection
            bookingId={booking.id}
            locale={locale}
            initialPhotos={booking.stayPhotos.map(p => ({
              id: p.id,
              url: p.url,
              caption: p.caption,
              createdAt: p.createdAt.toISOString(),
            }))}
          />
        </div>
      )}
    </div>
  );
}
