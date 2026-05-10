import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getEta } from '@/lib/osrm';
import { verifyTaxiToken } from '@/lib/taxi-token';

// Public endpoint — accédé via un token signé HMAC partagé au client par
// l'admin. Aucune session requise. PII réduite : prénom uniquement, jamais
// les noms d'animaux. Les invalides retournent 404 sans hit DB.
const TRACKING_HEADERS = {
  'Cache-Control': 'no-store, private',
  'X-Robots-Tag': 'noindex, nofollow',
} as const;

function maskedJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: TRACKING_HEADERS });
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const verified = verifyTaxiToken(token);
  const tripSelect = {
    select: {
      id: true,
      status: true,
      trackingActive: true,
      trackingToken: true,
      trackingTokenExpiresAt: true,
      distanceKm: true,
      booking: {
        select: {
          client: { select: { name: true } },
          bookingPets: { select: { pet: { select: { species: true } } } },
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
        orderBy: { createdAt: 'desc' as const },
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
  };

  const trip = verified
    ? await prisma.taxiTrip.findUnique({ where: { id: verified.tripId }, ...tripSelect })
    : await prisma.taxiTrip.findUnique({ where: { trackingToken: token }, ...tripSelect });

  if (!trip || (verified && trip.trackingToken !== token)) {
    if (!verified) {
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
      console.error(JSON.stringify({
        level: 'warn',
        service: 'taxi-token',
        event: '404',
        ip,
        tokenPrefix: token.slice(0, 8),
        timestamp: new Date().toISOString(),
      }));
    }
    return maskedJson({ error: 'Not found' }, 404);
  }

  // Hard expiry — leaked SMS link cannot be replayed forever.
  if (trip.trackingTokenExpiresAt && trip.trackingTokenExpiresAt.getTime() < Date.now()) {
    return maskedJson({ error: 'Gone' }, 410);
  }

  // Coherence with SSE stream: if tracking is no longer active, the live
  // viewer should be considered closed (410) rather than served stale data.
  if (!trip.trackingActive) {
    return maskedJson({ error: 'Tracking not active', distanceKm: trip.distanceKm }, 410);
  }

  const last = trip.locations[0];

  // PII reduction: never leak the client's full name nor pet names. Display
  // the first name only, plus a per-species pet count so the viewer (often
  // shared by SMS to a wider household) sees something meaningful without
  // exposing identifiers.
  const fullName = trip.booking?.client?.name ?? '';
  const firstName = fullName.split(/\s+/)[0] ?? '';
  const speciesCounts = (trip.booking?.bookingPets ?? []).reduce<Record<string, number>>((acc, bp) => {
    const sp = bp.pet.species ?? 'OTHER';
    acc[sp] = (acc[sp] ?? 0) + 1;
    return acc;
  }, {});
  const petSummary = Object.entries(speciesCounts)
    .map(([sp, n]) => {
      const emoji = sp === 'CAT' ? '🐈' : sp === 'DOG' ? '🐕' : '🐾';
      return n > 1 ? `${emoji} (×${n})` : emoji;
    })
    .join(' ');

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

  return maskedJson({
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
    firstName,
    petSummary,
  });
}
