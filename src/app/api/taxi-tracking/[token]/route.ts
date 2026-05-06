import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getEta } from '@/lib/osrm';

// Public endpoint — accédé via un token UUID partagé au client par l'admin.
// Aucune session requise. Retourne uniquement les infos minimales
// (nom client + animaux + dernière position) pour préserver la PII.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const trip = await prisma.taxiTrip.findUnique({
    where: { trackingToken: token },
    select: {
      status: true,
      trackingActive: true,
      distanceKm: true,
      booking: {
        select: {
          client: { select: { name: true } },
          bookingPets: { select: { pet: { select: { name: true } } } },
          taxiDetail: {
            select: {
              pickupLat: true,
              pickupLng: true,
              dropoffLat: true,
              dropoffLng: true,
            },
          },
        },
      },
      locations: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          latitude: true,
          longitude: true,
          heading: true,
          speed: true,
          createdAt: true,
        },
      },
    },
  });

  if (!trip) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Distance is cumulative and persistent — return it even when tracking is
  // stopped so the admin dashboard can keep showing the total km traveled
  // after the trip ends.
  if (!trip.trackingActive) {
    return NextResponse.json({ active: false, distanceKm: trip.distanceKm });
  }

  const last = trip.locations[0];
  const clientName = trip.booking?.client?.name ?? '';
  const petNames = trip.booking?.bookingPets.map(bp => bp.pet.name).join(' et ') ?? '';

  // ETA — switch target depending on trip phase: before ANIMAL_ON_BOARD we
  // route to pickup; once the pet is on board, we route to dropoff. Cached
  // 30 s in OSRM helper so this is cheap on rapid GET polling.
  let eta: { durationSec: number; distanceM: number; geometryPolyline: string } | null = null;
  if (last) {
    const td = trip.booking?.taxiDetail;
    const targetLat = trip.status === 'ANIMAL_ON_BOARD' ? td?.dropoffLat : td?.pickupLat;
    const targetLng = trip.status === 'ANIMAL_ON_BOARD' ? td?.dropoffLng : td?.pickupLng;
    if (targetLat != null && targetLng != null) {
      const r = await getEta(last.latitude, last.longitude, targetLat, targetLng);
      if (r) {
        eta = { durationSec: r.durationSec, distanceM: r.distanceM, geometryPolyline: r.geometry };
      }
    }
  }

  return NextResponse.json({
    active: true,
    distanceKm: trip.distanceKm,
    lastLocation: last
      ? {
          lat: last.latitude,
          lng: last.longitude,
          heading: last.heading,
          speed: last.speed,
          createdAt: last.createdAt,
        }
      : null,
    eta,
    clientName,
    petNames,
  });
}
