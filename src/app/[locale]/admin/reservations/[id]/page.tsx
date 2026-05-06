import { auth } from '../../../../../../auth';
import { redirect, notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import type { Decimal } from '@prisma/client/runtime/library';
import Link from 'next/link';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatDate, getBookingStatusColor } from '@/lib/utils';
import ReservationActions from './ReservationActions';
import TaxiTimeline, { type TaxiTripData } from '@/components/shared/TaxiTimeline';
import TaxiTrackingButton from '@/components/admin/TaxiTrackingButton';
import { TaxiNavBlock } from '@/components/admin/TaxiNavigationButton';
import DeleteBookingButton from './DeleteBookingButton';
import StayPhotosSection from './StayPhotosSection';
import AdminMessageSection from './AdminMessageSection';
import AddonRequestsSection from './AddonRequestsSection';
import TaxiHeartbeatIndicator from './TaxiHeartbeatIndicator';
import AdminTaxiLiveMap from './AdminTaxiLiveMap';
import AdminTaxiReplay from './AdminTaxiReplay';
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
import CheckoutBookingButton from './CheckoutBookingButton';
import { toNumber } from '@/lib/decimal';

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
    bookingMessages,
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
      where: { userId: clientId, type: 'ADMIN_MESSAGE', metadata: { contains: id } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, messageFr: true, messageEn: true, createdAt: true },
    }),
    // Addon requests for this booking. We DON'T filter on metadata in the DB
    // (substring match on a JSON-stringified blob is fragile — any whitespace
    // or escape difference and the row is silently skipped). Instead: pull
    // recent ADDON_REQUEST rows for the current admin (userId index → fast,
    // each request notifies every admin so this admin's view is complete),
    // then parse and filter by bookingId in JS.
    prisma.notification.findMany({
      where: { userId: session.user.id, type: 'ADDON_REQUEST' },
      orderBy: { createdAt: 'desc' },
      select: { metadata: true, createdAt: true },
      take: 100,
    }),
  ]);

  // Parse addon request metadata
  type ParsedAddonRequest = {
    requestId: string;
    serviceType: 'PET_TAXI' | 'TOILETTAGE' | 'AUTRE';
    message: string;
    createdAt: string;
  };
  const seenRequestIds = new Set<string>();
  let parseFailures = 0;
  let bookingIdMismatches = 0;
  const addonRequests: ParsedAddonRequest[] = addonRequestNotifs
    .map((n): ParsedAddonRequest | null => {
      if (!n.metadata) { parseFailures++; return null; }
      try {
        const parsed: unknown = JSON.parse(n.metadata);
        if (typeof parsed !== 'object' || parsed === null) { parseFailures++; return null; }
        const meta = parsed as Record<string, unknown>;
        // Filter by bookingId in JS (not via DB contains — see fetch comment).
        if (meta.bookingId !== id) { bookingIdMismatches++; return null; }
        const serviceType = meta.serviceType;
        if (serviceType !== 'PET_TAXI' && serviceType !== 'TOILETTAGE' && serviceType !== 'AUTRE') {
          parseFailures++;
          return null;
        }
        return {
          requestId: typeof meta.requestId === 'string' ? meta.requestId : `${n.createdAt.getTime()}`,
          serviceType,
          message: typeof meta.message === 'string' ? meta.message : '',
          createdAt: n.createdAt.toISOString(),
        };
      } catch { parseFailures++; return null; }
    })
    .filter((x): x is ParsedAddonRequest => {
      if (x === null) return false;
      if (seenRequestIds.has(x.requestId)) return false;
      seenRequestIds.add(x.requestId);
      return true;
    });

  // Diagnostic log — visible in Vercel Functions logs. Lets us see, for any
  // booking where the section is unexpectedly empty, whether the issue is
  // (a) no notifs in DB, (b) parse failures, or (c) bookingId mismatch.
  if (addonRequestNotifs.length > 0 && addonRequests.length === 0) {
    console.log('[addon-requests] empty result for booking', id.slice(0, 8), {
      raw: addonRequestNotifs.length,
      parsed: addonRequests.length,
      parseFailures,
      bookingIdMismatches,
      sampleMetadata: addonRequestNotifs[0]?.metadata?.slice(0, 200),
    });
  }

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

          {/* PET_TAXI navigation — pickup + dropoff (driver helper) */}
          {!isBoarding && booking.taxiDetail && (
            <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card space-y-4">
              <div>
                <h3 className="font-semibold text-charcoal text-sm flex items-center gap-2 mb-3">
                  <span className="text-base">📍</span>
                  {locale === 'fr' ? 'Localisation pickup' : 'Pickup location'}
                </h3>
                <TaxiNavBlock
                  lat={booking.taxiDetail.pickupLat}
                  lng={booking.taxiDetail.pickupLng}
                  address={booking.taxiDetail.pickupAddress}
                  locale={locale === 'en' ? 'en' : 'fr'}
                />
              </div>
              {(booking.taxiDetail.dropoffLat || booking.taxiDetail.dropoffLng || booking.taxiDetail.dropoffAddress) && (
                <div className="pt-4 border-t border-ivory-100">
                  <h3 className="font-semibold text-charcoal text-sm flex items-center gap-2 mb-3">
                    <span className="text-base">📍</span>
                    {locale === 'fr' ? 'Localisation dropoff' : 'Dropoff location'}
                  </h3>
                  <TaxiNavBlock
                    lat={booking.taxiDetail.dropoffLat}
                    lng={booking.taxiDetail.dropoffLng}
                    address={booking.taxiDetail.dropoffAddress}
                    locale={locale === 'en' ? 'en' : 'fr'}
                  />
                </div>
              )}
            </div>
          )}

          {/* Standalone PET_TAXI timeline */}
          {!isBoarding && standaloneTrip && (() => {
            const rawStandalone = booking.taxiTrips.find(t => t.tripType === 'STANDALONE');
            return (
              <div className="bg-white rounded-xl border border-[#F0D98A]/40 p-5 shadow-card space-y-3">
                <h3 className="font-semibold text-charcoal text-sm flex items-center gap-2">
                  <span className="text-base">🚗</span>
                  {locale === 'fr' ? 'Suivi du transport' : 'Transport tracking'}
                </h3>
                <TaxiTimeline trip={standaloneTrip} locale={locale} />
                {booking.status === 'IN_PROGRESS' && (
                  <TaxiHeartbeatIndicator bookingId={booking.id} locale={locale} />
                )}
                {rawStandalone && (
                  <TaxiTrackingButton
                    taxiTripId={rawStandalone.id}
                    tripType={rawStandalone.tripType}
                    status={rawStandalone.status}
                    trackingActive={rawStandalone.trackingActive}
                    trackingToken={rawStandalone.trackingToken}
                    locale={locale}
                  />
                )}
                {rawStandalone?.trackingActive && rawStandalone.trackingToken && (
                  <AdminTaxiLiveMap trackingToken={rawStandalone.trackingToken} locale={locale} />
                )}
                {/* REPLAY mode — visible once the trip reaches a terminal status
                    (driver arrived at destination) and live tracking is off. */}
                {rawStandalone && !rawStandalone.trackingActive && (
                  rawStandalone.status === 'ARRIVED_AT_PENSION' ||
                  rawStandalone.status === 'ARRIVED_AT_CLIENT' ||
                  rawStandalone.status === 'COMPLETED' ||
                  booking.status === 'COMPLETED'
                ) && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-charcoal/70 uppercase tracking-wider">
                      {locale === 'fr' ? 'Replay du trajet' : 'Trip replay'}
                    </h4>
                    <AdminTaxiReplay taxiTripId={rawStandalone.id} locale={locale} />
                  </div>
                )}
                {/* Persistent cumulative distance — survives tracking stop and page refresh. */}
                {rawStandalone && rawStandalone.distanceKm > 0 && (
                  <div className="flex items-center justify-between text-xs px-3 py-2 bg-[#FEFCF9] rounded-lg border border-[rgba(196,151,74,0.2)]">
                    <span className="text-charcoal/60">
                      {locale === 'fr' ? 'Distance totale parcourue' : 'Total distance traveled'}
                    </span>
                    <span className="font-semibold text-[#C4974A]">
                      {rawStandalone.distanceKm >= 10
                        ? `${rawStandalone.distanceKm.toFixed(1)} km`
                        : `${rawStandalone.distanceKm.toFixed(2)} km`}
                    </span>
                  </div>
                )}
              </div>
            );
          })()}

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
