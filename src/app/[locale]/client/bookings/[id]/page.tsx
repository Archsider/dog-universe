import { auth } from '../../../../../../auth';
import { redirect, notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { toNumber } from '@/lib/decimal';
import AutoRefresh from '@/components/shared/AutoRefresh';
import UpsellSuggestions from '@/components/shared/UpsellSuggestions';
import ClientProductOrder from './ClientProductOrder';
import ArrivalCheckIn from './ArrivalCheckIn';
import CountdownHero from './CountdownHero';
import LiveTaxiBanner from '@/components/client/LiveTaxiBanner';
import { getTranslations } from './_lib/i18n';
import { serializeTrips, computeRunningTotal } from './_lib/derived';
import BookingHeader from './_components/BookingHeader';
import BookingProgressCard from './_components/BookingProgressCard';
import BookingServiceCard from './_components/BookingServiceCard';
import BookingPetsCard from './_components/BookingPetsCard';
import BookingAddonCard from './_components/BookingAddonCard';
import BookingPricingCard from './_components/BookingPricingCard';
import BookingRunningTotalCard from './_components/BookingRunningTotalCard';
import BookingInvoiceCard from './_components/BookingInvoiceCard';
import BookingSupplementaryInvoiceCard from './_components/BookingSupplementaryInvoiceCard';
import BookingStayPhotosCard from './_components/BookingStayPhotosCard';
import BookingMessagesCard from './_components/BookingMessagesCard';
import BookingRebookCard from './_components/BookingRebookCard';
import RescheduleBanner from './_components/RescheduleBanner';
import { notDeleted } from '@/lib/prisma-soft';

interface PageProps { params: Promise<{ locale: string; id: string }> }

export default async function ClientBookingDetailPage({ params }: PageProps) {
  const { locale, id } = await params;
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/auth/login`);

  const booking = await prisma.booking.findFirst({
    where: notDeleted({ id }),
    include: {
      bookingPets: { include: { pet: true } },
      boardingDetail: true,
      taxiDetail: true,
      taxiTrips: {
        include: { history: { orderBy: { timestamp: 'asc' } } },
        orderBy: { createdAt: 'asc' },
      },
      invoice: { include: { items: true } },
      stayPhotos: { orderBy: { createdAt: 'desc' } },
      preStayBriefing: { select: { submittedAt: true, formData: true } },
    },
  });

  if (!booking || booking.clientId !== session.user.id) notFound();

  const [supplementaryInvoice, adminMessages] = await Promise.all([
    prisma.invoice.findFirst({
      where: {
        status: { notIn: ['CANCELLED'] },
        OR: [
          { supplementaryForBookingId: id },
          // legacy fallback for rows created before the FK column was added
          { clientId: session.user.id, notes: `EXTENSION_SURCHARGE:${id}` },
        ],
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.notification.findMany({
      // admin-soft-deleted messages don't show on the client booking detail
      // page either. See docs/CLIENT_MESSAGES.md.
      where: {
        ...notDeleted(),
        userId: session.user.id,
        type: { in: ['ADMIN_MESSAGE', 'STAY_PHOTO'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ]);

  const bookingMessages = adminMessages.filter(n => {
    if (!n.metadata) return false;
    try {
      const parsed: unknown = JSON.parse(n.metadata);
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        && (parsed as Record<string, unknown>).bookingId === id;
    } catch { return false; }
  });

  const t = getTranslations(locale);
  const isBoarding = booking.serviceType === 'BOARDING';
  const isActive = ['PENDING', 'CONFIRMED', 'AT_PICKUP', 'IN_PROGRESS'].includes(booking.status);
  const canCancel = ['PENDING', 'CONFIRMED'].includes(booking.status);
  const statusLabel = t.statusLabels[booking.status as keyof typeof t.statusLabels] || booking.status;

  const nights = booking.endDate
    ? Math.max(0, Math.floor((booking.endDate.getTime() - booking.startDate.getTime()) / (1000 * 60 * 60 * 24)))
    : 0;
  const taxiDeparture = booking.notes?.match(/Départ:\s*([^|]+)/)?.[1]?.trim() ?? null;
  const taxiArrival = booking.notes?.match(/Arrivée:\s*([^|]+)/)?.[1]?.trim() ?? null;
  const hasRescheduleRequest =
    booking.status === 'PENDING' && /\[RESCHEDULE_REQUEST\]\{/.test(booking.notes ?? '');

  const serializedTrips = serializeTrips(booking.taxiTrips);
  const standaloneTrip = serializedTrips.find(t => t.tripType === 'STANDALONE') ?? null;
  const goTrip         = serializedTrips.find(t => t.tripType === 'OUTBOUND')   ?? null;
  const returnTrip     = serializedTrips.find(t => t.tripType === 'RETURN')     ?? null;

  const { isStayActive, elapsedNights, elapsedBoardingTotal, nonBoardingItems, provisionalTotal } =
    computeRunningTotal({
      isBoarding,
      status: booking.status,
      startDate: booking.startDate,
      boardingDetail: booking.boardingDetail,
      invoiceItems: booking.invoice?.items ?? null,
    });

  return (
    <div className="max-w-2xl mx-auto">
      {isActive && <AutoRefresh intervalMs={30000} />}
      {hasRescheduleRequest && <RescheduleBanner locale={locale} />}

      <BookingHeader
        bookingId={booking.id}
        bookingCreatedAt={booking.createdAt}
        bookingStatus={booking.status}
        serviceType={booking.serviceType as 'BOARDING' | 'PET_TAXI'}
        species={(booking.bookingPets[0]?.pet?.species as 'DOG' | 'CAT' | undefined) ?? null}
        startDate={booking.startDate.toISOString()}
        endDate={booking.endDate ? booking.endDate.toISOString() : null}
        canCancel={canCancel}
        statusLabel={statusLabel}
        locale={locale}
        t={t}
      />

      <div className="space-y-4">
        {/* Live Pet Taxi banner (Feature #6 Wave 5) — visible during any
            active trip, links to /track/[token] for the full Leaflet map. */}
        {(() => {
          const liveTrip = booking.taxiTrips.find(t => t.trackingToken
            && ['DRIVER_EN_ROUTE', 'ON_SITE_CLIENT', 'ANIMAL_ON_BOARD', 'ON_SITE_PENSION'].includes(t.status));
          return liveTrip ? (
            <LiveTaxiBanner
              trackingToken={liveTrip.trackingToken!}
              tripStatus={liveTrip.status}
              petName={booking.bookingPets?.[0]?.pet?.name ?? null}
              locale={locale}
            />
          ) : null;
        })()}

        {/* Countdown Hero + Mood Builder (Feature #1 Wave 5) — J-7 to J-0
            CONFIRMED bookings.  Transforms the wait into anticipation. */}
        {['CONFIRMED', 'IN_PROGRESS'].includes(booking.status) && (
          <CountdownHero
            bookingId={booking.id}
            startDate={booking.startDate.toISOString()}
            petName={booking.bookingPets?.[0]?.pet?.name ?? null}
            locale={locale}
          />
        )}

        {/* Geofencing arrival check-in — only on CONFIRMED bookings whose
            startDate is within 36 h.  Server validates Casa coords + fires
            an admin SMS once per (booking, day) for the "we're expecting
            you" effect (feature #7 audit world 2026-05-19). */}
        {booking.status === 'CONFIRMED'
          && (booking.startDate.getTime() - Date.now()) < 36 * 3600 * 1000
          && (Date.now() - booking.startDate.getTime()) < 12 * 3600 * 1000 && (
          <ArrivalCheckIn
            bookingId={booking.id}
            petName={booking.bookingPets?.[0]?.pet?.name ?? null}
            locale={locale}
          />
        )}

        <BookingProgressCard status={booking.status} serviceType={booking.serviceType} standaloneTrip={standaloneTrip} locale={locale} t={t} />

        <BookingServiceCard
          bookingId={booking.id} isBoarding={isBoarding} status={booking.status}
          startDate={booking.startDate} endDate={booking.endDate} arrivalTime={booking.arrivalTime}
          notes={booking.notes} nights={nights} boardingDetail={booking.boardingDetail}
          taxiDetail={booking.taxiDetail} goTrip={goTrip} returnTrip={returnTrip}
          taxiDeparture={taxiDeparture} taxiArrival={taxiArrival}
          hasExtensionRequest={booking.hasExtensionRequest} locale={locale} t={t}
        />

        <BookingPetsCard bookingPets={booking.bookingPets.filter(bp => bp.pet)} locale={locale} t={t} />

        {/* Pre-stay briefing CTA — visible only while the booking is upcoming
            (PENDING/CONFIRMED) and the arrival hasn't happened yet. Soft-pushes
            the client to fill the form before J-2 so the team has perfect
            briefing data (feature #16 from world audit 2026-05-19). */}
        {['PENDING', 'CONFIRMED'].includes(booking.status)
          && booking.startDate.getTime() > Date.now() - 24 * 3600 * 1000
          && booking.serviceType === 'BOARDING' && (
          <a
            href={`/${locale}/client/bookings/${booking.id}/briefing`}
            className={`block rounded-2xl border-2 p-4 transition-all hover:shadow-md ${
              booking.preStayBriefing?.submittedAt
                ? 'border-emerald-200 bg-emerald-50/50'
                : 'border-[#C9A84C]/50 bg-gradient-to-br from-[#FFF9E8] to-white'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl shrink-0" aria-hidden>
                {booking.preStayBriefing?.submittedAt ? '✓' : '📝'}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-charcoal">
                  {booking.preStayBriefing?.submittedAt
                    ? (locale === 'fr' ? 'Briefing envoyé' : 'Briefing sent')
                    : (locale === 'fr' ? 'Préparer son séjour' : 'Prepare the stay')}
                </p>
                <p className="text-xs text-charcoal/60 mt-0.5">
                  {booking.preStayBriefing?.submittedAt
                    ? (locale === 'fr' ? 'Cliquez pour mettre à jour les infos.' : 'Tap to update.')
                    : (locale === 'fr' ? '2 min pour qu\'on prépare l\'accueil sur-mesure.' : '2 min so we tailor the welcome.')}
                </p>
              </div>
              <span className="text-charcoal/40 shrink-0">→</span>
            </div>
          </a>
        )}

        {['CONFIRMED', 'IN_PROGRESS'].includes(booking.status) && (
          <BookingAddonCard bookingId={booking.id} locale={locale} />
        )}

        {(booking.boardingDetail || booking.taxiDetail) && (
          <BookingPricingCard
            boardingDetail={booking.boardingDetail} taxiDetail={booking.taxiDetail} nights={nights}
            invoiceAmount={booking.invoice ? toNumber(booking.invoice.amount) : null}
            totalPrice={toNumber(booking.totalPrice)} t={t}
          />
        )}

        {isStayActive && (
          <BookingRunningTotalCard
            elapsedNights={elapsedNights} elapsedBoardingTotal={elapsedBoardingTotal}
            nonBoardingItems={nonBoardingItems.map(it => ({ id: it.id, description: it.description, total: toNumber(it.total) }))}
            provisionalTotal={provisionalTotal} locale={locale}
          />
        )}

        {booking.invoice && <BookingInvoiceCard invoice={booking.invoice} locale={locale} t={t} />}

        {supplementaryInvoice && (
          <BookingSupplementaryInvoiceCard bookingId={booking.id} supplementaryInvoice={supplementaryInvoice} locale={locale} t={t} />
        )}

        {isBoarding && ['CONFIRMED', 'IN_PROGRESS'].includes(booking.status) && (
          <UpsellSuggestions bookingId={booking.id} context="client" locale={locale} hasInvoice={!!booking.invoice} />
        )}

        {isBoarding && ['CONFIRMED', 'IN_PROGRESS'].includes(booking.status) && (
          <ClientProductOrder
            bookingId={booking.id} locale={locale}
            initialItems={(booking.invoice?.items ?? []).filter(it => it.category === 'PRODUCT').map(it => ({ id: it.id, description: it.description, quantity: it.quantity, total: toNumber(it.total) }))}
          />
        )}

        {isBoarding && <BookingStayPhotosCard stayPhotos={booking.stayPhotos} locale={locale} t={t} />}

        <BookingMessagesCard messages={bookingMessages} locale={locale} t={t} />

        {booking.status === 'COMPLETED' && (
          <BookingRebookCard
            booking={{
              id: booking.id,
              serviceType: booking.serviceType as 'BOARDING' | 'PET_TAXI',
              bookingPets: booking.bookingPets.filter(bp => bp.pet).map(bp => ({ pet: { id: bp.pet.id, name: bp.pet.name ?? '' } })),
              totalPrice: toNumber(booking.totalPrice),
            }}
            locale={locale}
          />
        )}
      </div>
    </div>
  );
}
