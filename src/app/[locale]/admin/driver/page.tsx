import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Car, Clock, MapPin, Route } from 'lucide-react';
import { auth } from '../../../../../auth';
import { prisma } from '@/lib/prisma';
import { formatMAD } from '@/lib/utils';

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
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  const [activeBooking, todayBookings, upcoming] = await Promise.all([
    prisma.booking.findFirst({
      where: {
        serviceType: 'PET_TAXI',
        status: 'IN_PROGRESS',
        deletedAt: null,
      },
      select: {
        id: true,
        startDate: true,
        arrivalTime: true,
        client: { select: { name: true, phone: true } },
        bookingPets: { select: { pet: { select: { name: true } } } },
        taxiDetail: { select: { pickupAddress: true, dropoffAddress: true } },
        taxiTrips: {
          where: { tripType: 'STANDALONE' },
          select: { distanceKm: true, status: true, trackingActive: true },
        },
      },
    }),
    prisma.booking.findMany({
      where: {
        serviceType: 'PET_TAXI',
        startDate: { gte: todayStart, lt: todayEnd },
        status: { in: ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'] },
        deletedAt: null,
      },
      select: {
        id: true,
        status: true,
        totalPrice: true,
        taxiTrips: {
          where: { tripType: 'STANDALONE' },
          select: { distanceKm: true },
        },
      },
    }),
    prisma.booking.findMany({
      where: {
        serviceType: 'PET_TAXI',
        startDate: { gte: now, lt: new Date(todayEnd.getTime() + 24 * 60 * 60 * 1000) },
        status: 'CONFIRMED',
        deletedAt: null,
      },
      take: 10,
      orderBy: [{ startDate: 'asc' }, { arrivalTime: 'asc' }],
      select: {
        id: true,
        startDate: true,
        arrivalTime: true,
        client: { select: { name: true } },
        taxiDetail: { select: { pickupAddress: true } },
      },
    }),
  ]);

  const totalKmToday = todayBookings.reduce(
    (sum, b) => sum + (b.taxiTrips[0]?.distanceKm ?? 0),
    0,
  );
  const completedCount = todayBookings.filter(b => b.status === 'COMPLETED').length;
  const inProgressCount = todayBookings.filter(b => b.status === 'IN_PROGRESS').length;
  const revenueToday = todayBookings
    .filter(b => b.status === 'COMPLETED')
    .reduce((sum, b) => sum + Number(b.totalPrice ?? 0), 0);

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      <header className="flex items-center gap-3">
        <Car className="h-7 w-7 text-[#C4974A]" />
        <h1 className="font-serif text-2xl text-charcoal">
          {isFr ? 'Mode chauffeur' : 'Driver mode'}
        </h1>
      </header>

      {/* Active trip */}
      {activeBooking ? (
        <Link
          href={`/${locale}/admin/reservations/${activeBooking.id}`}
          className="block bg-white rounded-xl border-2 border-[#C4974A] p-5 shadow-card hover:shadow-lg transition-shadow"
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-semibold uppercase tracking-wider text-green-600">
              {isFr ? 'Course en cours' : 'Active trip'}
            </span>
            {activeBooking.taxiTrips[0]?.trackingActive && (
              <span className="ml-auto text-xs text-[#C4974A] font-medium">
                📍 {isFr ? 'Suivi actif' : 'Tracking on'}
              </span>
            )}
          </div>
          <p className="font-medium text-charcoal">{activeBooking.client.name}</p>
          <p className="text-sm text-charcoal/70 mt-1">
            🐾 {activeBooking.bookingPets.map(bp => bp.pet.name).join(', ')}
          </p>
          {activeBooking.taxiDetail?.pickupAddress && (
            <p className="text-xs text-charcoal/60 mt-2 flex items-start gap-1">
              <MapPin className="h-3 w-3 mt-0.5 flex-shrink-0" />
              <span>{activeBooking.taxiDetail.pickupAddress}</span>
            </p>
          )}
          {activeBooking.taxiTrips[0] && activeBooking.taxiTrips[0].distanceKm > 0 && (
            <p className="text-xs text-[#C4974A] font-semibold mt-2">
              <Route className="inline h-3 w-3 mr-1" />
              {activeBooking.taxiTrips[0].distanceKm.toFixed(1)} km
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
          <p className="text-2xl font-semibold text-charcoal">{todayBookings.length}</p>
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
          <p className="text-2xl font-semibold text-charcoal">{upcoming.length}</p>
        </div>
      </section>

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <section>
          <h2 className="font-serif text-lg text-charcoal mb-3">
            {isFr ? 'Prochaines courses' : 'Upcoming trips'}
          </h2>
          <div className="space-y-2">
            {upcoming.map(b => (
              <Link
                key={b.id}
                href={`/${locale}/admin/reservations/${b.id}`}
                className="block bg-white rounded-lg border border-[rgba(196,151,74,0.2)] p-3 hover:border-[#C4974A] transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-charcoal text-sm truncate">{b.client.name}</p>
                    {b.taxiDetail?.pickupAddress && (
                      <p className="text-xs text-charcoal/60 truncate mt-0.5">
                        <MapPin className="inline h-3 w-3 mr-1" />
                        {b.taxiDetail.pickupAddress}
                      </p>
                    )}
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className="text-sm font-medium text-charcoal flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {b.arrivalTime ?? '—'}
                    </p>
                    <p className="text-xs text-charcoal/50">
                      {b.startDate.toLocaleDateString(isFr ? 'fr-FR' : 'en-GB', { day: '2-digit', month: 'short' })}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
