import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Car, Clock, MapPin, Route } from 'lucide-react';
import { auth } from '../../../../../auth';
import { prisma } from '@/lib/prisma';
import { formatMAD } from '@/lib/utils';

// Trip statuses where the driver is actively driving (the green-pulse banner).
// Mirrors the FLOWS table in the status transition route — keep in sync.
const ACTIVE_TRIP_STATUSES = ['EN_ROUTE_TO_CLIENT', 'ON_SITE_CLIENT', 'ANIMAL_ON_BOARD'] as const;
const TERMINAL_TRIP_STATUSES = ['ARRIVED_AT_PENSION', 'ARRIVED_AT_CLIENT', 'COMPLETED'] as const;

// "YYYY-MM-DD" in the local timezone (Casablanca). TaxiTrip.date is stored
// as a String in that format (it comes straight from <input type="date">),
// so comparing string-to-string is exact and timezone-free.
function todayDateStr(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default async function DriverDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPERADMIN'].includes(session.user.role ?? '')) {
    redirect(`/${locale}/auth/login`);
  }

  const isFr = locale !== 'en';
  const now = new Date();
  const todayStr = todayDateStr(now);

  // We pivot on TaxiTrip (not Booking) so the dashboard surfaces every leg
  // the driver actually drives: STANDALONE Pet Taxi services AND OUTBOUND /
  // RETURN addon trips attached to BOARDING bookings. The previous version
  // filtered Booking.serviceType=PET_TAXI and TaxiTrip.tripType=STANDALONE,
  // which silently hid all boarding-addon driving from the driver dashboard.
  const [activeTrip, todayTrips, upcomingTrips] = await Promise.all([
    prisma.taxiTrip.findFirst({
      where: {
        OR: [
          { status: { in: [...ACTIVE_TRIP_STATUSES] } },
          { trackingActive: true },
        ],
        booking: { deletedAt: null },
      },
      // Most recently updated wins — handles the "tracking left on by mistake"
      // case where two trips technically match.
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        bookingId: true,
        tripType: true,
        status: true,
        address: true,
        distanceKm: true,
        trackingActive: true,
        booking: {
          select: {
            id: true,
            startDate: true,
            arrivalTime: true,
            client: { select: { name: true, phone: true } },
            bookingPets: { select: { pet: { select: { name: true } } } },
            taxiDetail: { select: { pickupAddress: true, dropoffAddress: true } },
            boardingDetail: { select: { taxiGoAddress: true, taxiReturnAddress: true } },
          },
        },
      },
    }),
    prisma.taxiTrip.findMany({
      where: {
        date: todayStr,
        booking: { deletedAt: null },
      },
      select: {
        id: true,
        tripType: true,
        status: true,
        distanceKm: true,
        booking: {
          select: {
            serviceType: true,
            totalPrice: true,
            boardingDetail: { select: { taxiAddonPrice: true } },
          },
        },
      },
    }),
    prisma.taxiTrip.findMany({
      where: {
        date: { gt: todayStr },
        status: 'PLANNED',
        booking: { deletedAt: null },
      },
      take: 10,
      orderBy: [{ date: 'asc' }, { time: 'asc' }],
      select: {
        id: true,
        bookingId: true,
        tripType: true,
        date: true,
        time: true,
        address: true,
        booking: {
          select: {
            client: { select: { name: true } },
            taxiDetail: { select: { pickupAddress: true } },
            boardingDetail: { select: { taxiGoAddress: true, taxiReturnAddress: true } },
          },
        },
      },
    }),
  ]);

  const totalKmToday = todayTrips.reduce((sum, t) => sum + (t.distanceKm ?? 0), 0);
  const completedCount = todayTrips.filter((t) =>
    (TERMINAL_TRIP_STATUSES as readonly string[]).includes(t.status),
  ).length;
  const inProgressCount = todayTrips.filter((t) =>
    (ACTIVE_TRIP_STATUSES as readonly string[]).includes(t.status),
  ).length;
  // Revenue today: for STANDALONE trips, the whole booking is the taxi ride;
  // for addon trips, only the taxiAddonPrice slice represents the driver's
  // revenue (the rest is boarding/grooming, not driving).
  const revenueToday = todayTrips
    .filter((t) => (TERMINAL_TRIP_STATUSES as readonly string[]).includes(t.status))
    .reduce((sum, t) => {
      if (t.booking.serviceType === 'PET_TAXI') {
        return sum + Number(t.booking.totalPrice ?? 0);
      }
      return sum + Number(t.booking.boardingDetail?.taxiAddonPrice ?? 0);
    }, 0);

  // Pickup address for the active trip: OUTBOUND/STANDALONE use the client's
  // pickup; RETURN uses the pension as the pickup (the dog leaves the
  // pension and goes back home), so taxiReturnAddress is the start.
  const activePickupAddress =
    activeTrip?.tripType === 'RETURN'
      ? activeTrip.booking.boardingDetail?.taxiReturnAddress ?? null
      : activeTrip?.booking.taxiDetail?.pickupAddress ??
        activeTrip?.booking.boardingDetail?.taxiGoAddress ??
        activeTrip?.address ??
        null;

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      <header className="flex items-center gap-3">
        <Car className="h-7 w-7 text-[#C4974A]" />
        <h1 className="font-serif text-2xl text-charcoal">
          {isFr ? 'Mode chauffeur' : 'Driver mode'}
        </h1>
      </header>

      {/* Active trip */}
      {activeTrip ? (
        <Link
          href={`/${locale}/admin/reservations/${activeTrip.bookingId}`}
          className="block bg-white rounded-xl border-2 border-[#C4974A] p-5 shadow-card hover:shadow-lg transition-shadow"
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-semibold uppercase tracking-wider text-green-600">
              {isFr ? 'Course en cours' : 'Active trip'}
            </span>
            <span className="text-[10px] text-charcoal/50 uppercase tracking-wider">
              · {activeTrip.tripType}
            </span>
            {activeTrip.trackingActive && (
              <span className="ml-auto text-xs text-[#C4974A] font-medium">
                📍 {isFr ? 'Suivi actif' : 'Tracking on'}
              </span>
            )}
          </div>
          <p className="font-medium text-charcoal">{activeTrip.booking.client.name}</p>
          <p className="text-sm text-charcoal/70 mt-1">
            🐾 {activeTrip.booking.bookingPets.map((bp) => bp.pet.name).join(', ')}
          </p>
          {activePickupAddress && (
            <p className="text-xs text-charcoal/60 mt-2 flex items-start gap-1">
              <MapPin className="h-3 w-3 mt-0.5 flex-shrink-0" />
              <span>{activePickupAddress}</span>
            </p>
          )}
          {activeTrip.distanceKm > 0 && (
            <p className="text-xs text-[#C4974A] font-semibold mt-2">
              <Route className="inline h-3 w-3 mr-1" />
              {activeTrip.distanceKm.toFixed(1)} km
            </p>
          )}
        </Link>
      ) : (
        <div className="bg-ivory-50 rounded-xl border border-[rgba(196,151,74,0.2)] p-5 text-center text-sm text-charcoal/60">
          {isFr ? 'Aucune course en cours.' : 'No active trip.'}
        </div>
      )}

      {/* Today stats */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-[rgba(196,151,74,0.2)] p-4">
          <p className="text-xs text-charcoal/60 mb-1">{isFr ? 'Courses aujourd\'hui' : 'Trips today'}</p>
          <p className="text-2xl font-semibold text-charcoal">{todayTrips.length}</p>
          <p className="text-[10px] text-charcoal/50">
            {completedCount} {isFr ? 'terminées' : 'completed'} · {inProgressCount} {isFr ? 'en cours' : 'in progress'}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-[rgba(196,151,74,0.2)] p-4">
          <p className="text-xs text-charcoal/60 mb-1">{isFr ? 'Distance totale' : 'Total distance'}</p>
          <p className="text-2xl font-semibold text-[#C4974A]">{totalKmToday.toFixed(1)}<span className="text-sm font-normal ml-1">km</span></p>
        </div>
        <div className="bg-white rounded-xl border border-[rgba(196,151,74,0.2)] p-4">
          <p className="text-xs text-charcoal/60 mb-1">{isFr ? 'CA encaissé' : 'Revenue'}</p>
          <p className="text-2xl font-semibold text-charcoal">{formatMAD(revenueToday)}</p>
        </div>
        <div className="bg-white rounded-xl border border-[rgba(196,151,74,0.2)] p-4">
          <p className="text-xs text-charcoal/60 mb-1">{isFr ? 'À venir' : 'Upcoming'}</p>
          <p className="text-2xl font-semibold text-charcoal">{upcomingTrips.length}</p>
        </div>
      </section>

      {/* Upcoming */}
      {upcomingTrips.length > 0 && (
        <section>
          <h2 className="font-serif text-lg text-charcoal mb-3">
            {isFr ? 'Prochaines courses' : 'Upcoming trips'}
          </h2>
          <div className="space-y-2">
            {upcomingTrips.map((trip) => {
              const upcomingAddress =
                trip.tripType === 'RETURN'
                  ? trip.booking.boardingDetail?.taxiReturnAddress ?? null
                  : trip.booking.taxiDetail?.pickupAddress ??
                    trip.booking.boardingDetail?.taxiGoAddress ??
                    trip.address ??
                    null;
              return (
                <Link
                  key={trip.id}
                  href={`/${locale}/admin/reservations/${trip.bookingId}`}
                  className="block bg-white rounded-lg border border-[rgba(196,151,74,0.2)] p-3 hover:border-[#C4974A] transition-colors"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-charcoal text-sm truncate">
                        {trip.booking.client.name}
                        <span className="ml-1 text-[10px] uppercase tracking-wider text-charcoal/50">
                          · {trip.tripType}
                        </span>
                      </p>
                      {upcomingAddress && (
                        <p className="text-xs text-charcoal/60 truncate mt-0.5">
                          <MapPin className="inline h-3 w-3 mr-1" />
                          {upcomingAddress}
                        </p>
                      )}
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <p className="text-sm font-medium text-charcoal flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {trip.time ?? '—'}
                      </p>
                      <p className="text-xs text-charcoal/50">
                        {trip.date
                          ? new Date(`${trip.date}T00:00:00`).toLocaleDateString(
                              isFr ? 'fr-FR' : 'en-GB',
                              { day: '2-digit', month: 'short' },
                            )
                          : '—'}
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
