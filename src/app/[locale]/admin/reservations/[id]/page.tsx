// Slim orchestrator — see _lib/ and _components/ for the extracted helpers.
//
// File went from 681 LOC to ~250 by extracting:
//   - _lib/labels.ts         (FR/EN dictionaries — 100L removed)
//   - _lib/load-booking.ts   (Promise.all + adjacency + filtering — 150L)
//   - _lib/live-pricing.ts   (open-ended live total — 35L)
//   - _components/BookingDetailHeader.tsx  (back link + 3 banners — 110L)
//
// What stays here: the page-level routing (auth gate + locale resolution),
// the labels lookup, the taxiTrips serialization, and the JSX that wires
// the 15+ already-extracted sub-components into the two-column grid.

import { auth } from '../../../../../../auth';
import { redirect, notFound } from 'next/navigation';
import { toNumber } from '@/lib/decimal';
import { prisma } from '@/lib/prisma';
import ReservationActions from './ReservationActions';
import { TimeProposalBanner, type ProposalSummary } from '@/components/admin/TimeProposalBanner';
import type { TaxiTripData } from '@/components/shared/TaxiTimeline';
import StayPhotosSection from './StayPhotosSection';
import AdminMessageSection from './AdminMessageSection';
import EndStayReportCta from './EndStayReportCta';
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
import ProductsExtrasSection from './ProductsExtrasSection';
import UpsellSuggestions from '@/components/shared/UpsellSuggestions';
import CheckoutBookingButton from './CheckoutBookingButton';
import BookingTaxiSection from './BookingTaxiSection';
import { loadAdminBookingDetail } from './_lib/load-booking';
import { computeLiveOpenEndedTotal } from './_lib/live-pricing';
import { getLabels, getStatusLabels } from './_lib/labels';
import { BookingDetailHeader } from './_components/BookingDetailHeader';

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

const TERMINAL_STATUSES = new Set(['CANCELLED', 'REJECTED', 'COMPLETED']);

export default async function AdminReservationDetailPage({ params }: PageProps) {
  const { locale, id } = await params;
  const session = await auth();
  if (
    !session?.user ||
    (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')
  ) {
    redirect(`/${locale}/auth/login`);
  }

  const data = await loadAdminBookingDetail(id);
  if (!data) notFound();

  // Time proposal state per scope — fetched in parallel for the banner.
  // Source : architecture proposal 2026-05-17.
  const timeProposalsRaw = await prisma.timeProposal.findMany({
    where: { bookingId: id, status: { in: ['PENDING', 'ACCEPTED'] } },
    select: {
      id: true, scope: true, time: true, status: true,
      proposedByRole: true, proposalNote: true, responseNote: true,
      respondedAt: true,
    },
    orderBy: [{ status: 'asc' }, { proposedAt: 'desc' }],
  });
  const proposalByScope: Record<'ARRIVAL' | 'TAXI_GO' | 'TAXI_RETURN', { current: ProposalSummary | null; confirmed: ProposalSummary | null }> = {
    ARRIVAL: { current: null, confirmed: null },
    TAXI_GO: { current: null, confirmed: null },
    TAXI_RETURN: { current: null, confirmed: null },
  };
  for (const p of timeProposalsRaw) {
    const summary: ProposalSummary = {
      id: p.id,
      scope: p.scope,
      time: p.time,
      status: p.status,
      proposedByRole: p.proposedByRole as 'CLIENT' | 'ADMIN' | 'SUPERADMIN',
      proposalNote: p.proposalNote,
      responseNote: p.responseNote,
    };
    if (p.status === 'PENDING' && !proposalByScope[p.scope].current) {
      proposalByScope[p.scope].current = summary;
    } else if (p.status === 'ACCEPTED' && !proposalByScope[p.scope].confirmed) {
      proposalByScope[p.scope].confirmed = summary;
    }
  }

  const {
    booking,
    supplementaryInvoice,
    pendingExtensionBooking,
    originalBooking,
    bookingMessages,
    addonRequests,
    adjacentBookings,
  } = data;

  const labels = getLabels(locale);
  const statusLabels = getStatusLabels(locale);
  const isBoarding = booking.serviceType === 'BOARDING';
  const isPendingExtension = booking.status === 'PENDING_EXTENSION';

  // Serialize TaxiTrip (Date → ISO string) so client components don't choke
  // on the non-serializable boundary.
  const serializedTrips: TaxiTripData[] = booking.taxiTrips.map((t) => ({
    id: t.id,
    tripType: t.tripType,
    status: t.status,
    date: t.date,
    time: t.time,
    address: t.address,
    history: t.history.map((h) => ({
      id: h.id,
      status: h.status,
      timestamp: h.timestamp.toISOString(),
      updatedBy: h.updatedBy,
    })),
  }));
  const goTrip = serializedTrips.find((t) => t.tripType === 'OUTBOUND') ?? null;
  const returnTrip = serializedTrips.find((t) => t.tripType === 'RETURN') ?? null;
  const standaloneTrip = serializedTrips.find((t) => t.tripType === 'STANDALONE') ?? null;

  const nights = booking.endDate
    ? Math.max(
        0,
        Math.floor(
          (booking.endDate.getTime() - booking.startDate.getTime()) / (1000 * 60 * 60 * 24),
        ),
      )
    : (() => {
        // BUG5: endDate not saved yet — use quantity from BOARDING invoice item as ground truth.
        const boardingItem = booking.invoice?.items.find((i) => i.category === 'BOARDING');
        if (boardingItem) return boardingItem.quantity;
        // Fallback: days elapsed since start (in-progress open-ended stays).
        return Math.max(
          0,
          Math.floor((Date.now() - booking.startDate.getTime()) / (1000 * 60 * 60 * 24)),
        );
      })();

  const liveOpenEnded = await computeLiveOpenEndedTotal(booking, booking.bookingPets);

  const isActiveBoarding = isBoarding && !TERMINAL_STATUSES.has(booking.status);
  const showCheckoutCTA =
    isBoarding &&
    (booking.isOpenEnded || booking.endDate == null) &&
    !TERMINAL_STATUSES.has(booking.status);

  return (
    <div className="max-w-3xl mx-auto">
      <BookingDetailHeader
        bookingId={booking.id}
        bookingShortRef={booking.id.slice(0, 8).toUpperCase()}
        bookingStatus={booking.status}
        bookingSource={booking.source}
        bookingCreatedAt={booking.createdAt}
        isPendingExtension={isPendingExtension}
        originalBooking={originalBooking}
        pendingExtensionBooking={pendingExtensionBooking}
        liveOpenEnded={liveOpenEnded}
        locale={locale}
        labels={labels}
        statusLbl={statusLabels[booking.status] ?? booking.status}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left column */}
        <div className="space-y-4">
          <BookingClientSection
            client={booking.client}
            locale={locale}
            label={labels.client}
            isBoarding={isBoarding}
            bookingId={booking.id}
            bookingStatus={booking.status}
            standaloneTrip={standaloneTrip}
            taxiTrips={booking.taxiTrips.map((t) => ({
              tripType: t.tripType,
              trackingActive: t.trackingActive,
              trackingToken: t.trackingToken,
            }))}
          />

          <BookingPetsSection
            bookingPets={booking.bookingPets}
            locale={locale}
            label={labels.animals}
          />

          <BookingInvoiceSection
            invoice={booking.invoice ?? null}
            supplementaryInvoice={supplementaryInvoice}
            bookingId={booking.id}
            clientId={booking.client.id}
            locale={locale}
            label={labels.invoice}
            noInvoiceLabel={labels.noInvoice}
            isOpenEnded={booking.isOpenEnded && !TERMINAL_STATUSES.has(booking.status)}
            liveTotal={liveOpenEnded?.total}
            isWalkInClient={booking.client.isWalkIn}
          />
        </div>

        {/* Right column */}
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
            bookingItems={booking.bookingItems.map((i) => ({
              id: i.id,
              description: i.description,
              quantity: i.quantity,
              unitPrice: Number(i.unitPrice),
              total: Number(i.total),
            }))}
            labels={{
              type: labels.type,
              boarding: labels.boarding,
              taxi: labels.taxi,
              dates: labels.dates,
              grooming: labels.grooming,
              no: labels.no,
              taxiType: labels.taxiType,
              notes: labels.notes,
              cancelReason: labels.cancelReason,
            }}
          />

          {/* Time confirmation negotiation — one banner per applicable
              scope (arrival + taxi addons when enabled). Source : audit
              produit 2026-05-17 + architecture TimeProposal entity. */}
          {(() => {
            const isOpen = !['COMPLETED','CANCELLED','REJECTED','NO_SHOW'].includes(booking.status);
            const showArrival = booking.serviceType === 'BOARDING';
            const bd = booking.boardingDetail;
            const showTaxiGo = bd?.taxiGoEnabled === true;
            const showTaxiReturn = bd?.taxiReturnEnabled === true;
            return (
              <div className="space-y-2">
                {showArrival && (
                  <TimeProposalBanner
                    bookingId={booking.id}
                    scope="ARRIVAL"
                    current={proposalByScope.ARRIVAL.current}
                    confirmed={proposalByScope.ARRIVAL.confirmed}
                    open={isOpen}
                    locale={locale}
                  />
                )}
                {showTaxiGo && (
                  <TimeProposalBanner
                    bookingId={booking.id}
                    scope="TAXI_GO"
                    current={proposalByScope.TAXI_GO.current}
                    confirmed={proposalByScope.TAXI_GO.confirmed}
                    open={isOpen}
                    locale={locale}
                  />
                )}
                {showTaxiReturn && (
                  <TimeProposalBanner
                    bookingId={booking.id}
                    scope="TAXI_RETURN"
                    current={proposalByScope.TAXI_RETURN.current}
                    confirmed={proposalByScope.TAXI_RETURN.confirmed}
                    open={isOpen}
                    locale={locale}
                  />
                )}
              </div>
            );
          })()}

          <ReservationActions
            booking={{
              id: booking.id,
              version: booking.version,
              status: booking.status,
              serviceType: booking.serviceType,
            }}
            locale={locale}
          />

          {!isBoarding && booking.taxiDetail && (
            <BookingTaxiSection
              bookingId={booking.id}
              bookingStatus={booking.status}
              taxiDetail={booking.taxiDetail}
              standaloneTrip={standaloneTrip}
              rawStandaloneTrip={
                booking.taxiTrips.find((t) => t.tripType === 'STANDALONE') ?? null
              }
              locale={locale}
            />
          )}

          {isBoarding && (
            <EditDatesSection
              booking={{
                id: booking.id,
                version: booking.version,
                startDate: booking.startDate,
                endDate: booking.endDate ?? null,
                serviceType: booking.serviceType,
              }}
              locale={locale}
            />
          )}

          {isBoarding && (
            <EditTaxiAddonSection
              bookingId={booking.id}
              bookingVersion={booking.version}
              boardingDetail={
                booking.boardingDetail
                  ? {
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
                    }
                  : null
              }
              goTrip={goTrip}
              returnTrip={returnTrip}
              goTracking={(() => {
                const raw = booking.taxiTrips.find((t) => t.tripType === 'OUTBOUND');
                return raw
                  ? { trackingActive: raw.trackingActive, trackingToken: raw.trackingToken }
                  : null;
              })()}
              returnTracking={(() => {
                const raw = booking.taxiTrips.find((t) => t.tripType === 'RETURN');
                return raw
                  ? { trackingActive: raw.trackingActive, trackingToken: raw.trackingToken }
                  : null;
              })()}
              bookingStatus={booking.status}
              locale={locale}
            />
          )}

          {isBoarding && (
            <EditGroomingSection
              bookingId={booking.id}
              bookingVersion={booking.version}
              boardingDetail={
                booking.boardingDetail
                  ? {
                      includeGrooming: booking.boardingDetail.includeGrooming,
                      groomingSize: booking.boardingDetail.groomingSize,
                      groomingStatus: booking.boardingDetail.groomingStatus,
                    }
                  : null
              }
              locale={locale}
            />
          )}

          {showCheckoutCTA && <CheckoutBookingButton bookingId={booking.id} locale={locale} />}

          {!isPendingExtension && (
            <ProductsExtrasSection
              bookingId={booking.id}
              hasInvoice={!!booking.invoice}
              locale={locale}
              initialItems={booking.bookingItems.map((i) => ({
                id: i.id,
                productId: i.productId ?? null,
                invoiceItemId: i.invoiceItemId ?? null,
                description: i.description,
                quantity: i.quantity,
                unitPrice: Number(i.unitPrice),
                total: Number(i.total),
                category: i.category as never,
                version: i.version,
              }))}
            />
          )}

          {isBoarding && !isPendingExtension && (
            <UpsellSuggestions
              bookingId={booking.id}
              context="admin"
              locale={locale}
              hasInvoice={!!booking.invoice}
            />
          )}

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

          {isActiveBoarding && !isPendingExtension && (
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
            <EndStayReportCta
              bookingId={booking.id}
              locale={locale}
              status={booking.status}
              endDate={booking.endDate ? booking.endDate.toISOString() : null}
            />
          )}

          {!isPendingExtension && (
            <AdminMessageSection
              bookingId={booking.id}
              locale={locale}
              initialMessages={bookingMessages}
            />
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

      {isBoarding && !isPendingExtension && (
        <div className="mt-4">
          <StayPhotosSection
            bookingId={booking.id}
            locale={locale}
            initialPhotos={booking.stayPhotos.map((p) => ({
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
