import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Public endpoint — accédé via un token UUID partagé au client par l'admin.
// Aucune session requise. Retourne uniquement les infos minimales
// (nom client + animaux + dernière position) pour préserver la PII.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const trip = await prisma.taxiTrip.findUnique({
    where: { trackingToken: token },
    select: {
      trackingActive: true,
      distanceKm: true,
      booking: {
        select: {
          client: { select: { name: true } },
          bookingPets: { select: { pet: { select: { name: true } } } },
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

  if (!trip.trackingActive) {
    return NextResponse.json({ active: false });
  }

  const last = trip.locations[0];
  const clientName = trip.booking?.client?.name ?? '';
  const petNames = trip.booking?.bookingPets.map(bp => bp.pet.name).join(' et ') ?? '';

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
    clientName,
    petNames,
  });
}
