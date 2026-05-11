import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { sendSMS } from '@/lib/sms';
import { recordLocation, clearLocation, haversineKm } from '@/lib/taxi-location';
import { maybeAutoTransition } from '@/lib/taxi-auto-transition';
import { signTaxiToken } from '@/lib/taxi-token';
import { withSpan } from '@/lib/observability';
import { logger } from '@/lib/logger';

const MAX_ACCURACY_METERS = 50;
const MAX_SPEED_KMH = 200;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.doguniverse.ma';
const MAX_LOCATIONS_PER_TRIP = 50;

type Body =
  | { action: 'start' }
  | { action: 'stop' }
  | {
      action: 'location';
      latitude: number;
      longitude: number;
      heading?: number | null;
      speed?: number | null;
      accuracy?: number | null;
    };

function isValidLat(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= -90 && v <= 90;
}
function isValidLng(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= -180 && v <= 180;
}
function isValidNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPERADMIN'].includes(session.user.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const trip = await prisma.taxiTrip.findUnique({
    where: { id: id },
    select: {
      id: true,
      bookingId: true,
      trackingActive: true,
      trackingToken: true,
      distanceKm: true,
      status: true,
      booking: {
        select: {
          clientId: true,
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
    },
  });
  if (!trip) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }

  // ── start ──────────────────────────────────────────────────────────────
  if (body.action === 'start') {
    return withSpan(
      'api.taxi.tracking.start',
      { entityId: id, userId: session.user.id, bookingId: trip.bookingId, status: trip.status },
      async () => {
    // P0 race: only mint a fresh token when the trip currently has none.
    // The conditional `where: { trackingToken: null }` makes the assignment
    // atomic — two concurrent admin clicks can't both win and overwrite the
    // already-distributed SMS link with a different token.
    let trackingToken: string;
    if (trip.trackingToken) {
      // Already started — return existing token, just refresh expiry below.
      trackingToken = trip.trackingToken;
    } else {
      trackingToken = signTaxiToken(trip.id);
    }
    // Hard expiry: 24h after start; manual rotation will reset.
    const trackingTokenExpiresAt = new Date(Date.now() + 24 * 3600 * 1000);
    if (!trip.trackingToken) {
      // Conditional updateMany — atomic CAS on (id, trackingToken IS NULL).
      // count=0 means another concurrent caller already minted a token; we
      // re-read and reuse theirs instead of overwriting and breaking the
      // already-distributed SMS link.
      const result = await prisma.taxiTrip.updateMany({
        where: { id, trackingToken: null },
        data: { trackingActive: true, trackingToken, trackingTokenExpiresAt },
      });
      if (result.count === 0) {
        const fresh = await prisma.taxiTrip.findUnique({
          where: { id },
          select: { trackingToken: true },
        });
        if (fresh?.trackingToken) {
          trackingToken = fresh.trackingToken;
          await prisma.taxiTrip.update({
            where: { id },
            data: { trackingActive: true, trackingTokenExpiresAt },
          });
        }
      }
    } else {
      await prisma.taxiTrip.update({
        where: { id },
        data: { trackingActive: true, trackingTokenExpiresAt },
      });
    }

    // Récupère les infos client pour envoyer le SMS de suivi (1 query, action rare)
    const tripWithClient = await prisma.taxiTrip.findUnique({
      where: { id: id },
      select: {
        booking: {
          select: {
            client: { select: { name: true, phone: true, language: true } },
          },
        },
      },
    });
    const client = tripWithClient?.booking?.client;
    const clientLocale = client?.language === 'en' ? 'en' : 'fr';
    const trackingUrl = `${APP_URL}/${clientLocale}/track/${trackingToken}`;

    // SMS automatique au client (additif, échec n'empêche pas l'admin de démarrer le tracking)
    if (client?.phone) {
      const firstName = (client.name ?? '').split(' ')[0] || (client.name ?? '');
      const msg = clientLocale === 'en'
        ? `Hello ${firstName}! 🚗 Dog Universe is on the way. Track your pet live: ${trackingUrl} — Dog Universe`
        : `Bonjour ${firstName} ! 🚗 Dog Universe est en route. Suivez votre animal en direct : ${trackingUrl} — Dog Universe`;
      sendSMS(client.phone, msg).catch(() => { /* SMS additif */ });
    }

    return NextResponse.json({
      ok: true,
      trackingToken,
      trackingUrl,
    });
      },
    );
  }

  // ── stop ───────────────────────────────────────────────────────────────
  if (body.action === 'stop') {
    const stopped = await prisma.taxiTrip.update({
      where: { id: id },
      data: { trackingActive: false },
      select: { distanceKm: true },
    });
    await clearLocation(trip.bookingId);
    return NextResponse.json({ ok: true, distanceKm: stopped.distanceKm });
  }

  // ── location ───────────────────────────────────────────────────────────
  if (body.action === 'location') {
    if (!trip.trackingActive) {
      return NextResponse.json({ error: 'TRACKING_NOT_ACTIVE' }, { status: 400 });
    }
    const { latitude, longitude, heading, speed, accuracy } = body;
    if (!isValidLat(latitude) || !isValidLng(longitude)) {
      return NextResponse.json({ error: 'INVALID_COORDINATES' }, { status: 400 });
    }

    // ── Quality gate: reject low-accuracy fixes (>50 m horizontal error) ──
    if (isValidNumber(accuracy) && accuracy > MAX_ACCURACY_METERS) {
      logger.error('taxi-tracking', 'gps point ignored (low_accuracy)', { tripId: id, accuracy });
      return NextResponse.json({ ok: true, ignored: 'low_accuracy' });
    }

    // Compute distance delta from the previous GPS point (noise-filtered at 10 m).
    const prev = await prisma.taxiLocation.findFirst({
      where: { taxiTripId: id },
      orderBy: { createdAt: 'desc' },
      select: { latitude: true, longitude: true, createdAt: true },
    });

    let deltaKm = 0;
    if (prev) {
      const d = haversineKm(prev.latitude, prev.longitude, latitude, longitude);
      // ── Quality gate: reject implausible speeds (>200 km/h teleport / GPS bug) ──
      const dtSec = Math.max(0.001, (Date.now() - prev.createdAt.getTime()) / 1000);
      const speedKmh = (d / dtSec) * 3600;
      if (speedKmh > MAX_SPEED_KMH) {
        logger.error('taxi-tracking', 'gps point ignored (speed_outlier)', { tripId: id, speedKmh: Math.round(speedKmh), deltaKm: d, dtSec });
        return NextResponse.json({ ok: true, ignored: 'speed_outlier' });
      }
      if (d >= 0.01) deltaKm = d; // ignore < 10 m (GPS drift)
    }

    await prisma.taxiLocation.create({
      data: {
        taxiTripId: id,
        latitude,
        longitude,
        heading: isValidNumber(heading) ? heading : null,
        speed: isValidNumber(speed) ? speed : null,
        accuracy: isValidNumber(accuracy) ? accuracy : null,
      },
    });

    // Increment cumulative distance atomically.
    let updatedDistanceKm = trip.distanceKm;
    if (deltaKm > 0) {
      const updated = await prisma.taxiTrip.update({
        where: { id: id },
        data: { distanceKm: { increment: deltaKm } },
        select: { distanceKm: true },
      });
      updatedDistanceKm = updated.distanceKm;
    }

    // Critical: SSE stream at /api/taxi/[token]/stream reads positions from
    // Redis (not Postgres) — without this, viewers never see updates. The
    // recordLocation helper also publishes on the channel for any future
    // pub/sub subscriber. Fail-open: SSE still has a 2s Redis poll fallback.
    await recordLocation(trip.bookingId, {
      lat: latitude,
      lng: longitude,
      timestamp: Date.now(),
      heading: isValidNumber(heading) ? heading : null,
      speed: isValidNumber(speed) ? speed : null,
      distanceKm: updatedDistanceKm,
    });

    // Cleanup : ne garder que les MAX_LOCATIONS_PER_TRIP plus récentes (batch 500 max pour éviter DoS)
    const stale = await prisma.taxiLocation.findMany({
      where: { taxiTripId: id },
      orderBy: { createdAt: 'desc' },
      skip: MAX_LOCATIONS_PER_TRIP,
      take: 500,
      select: { id: true },
    });
    if (stale.length > 0) {
      await prisma.taxiLocation.deleteMany({
        where: { id: { in: stale.map(r => r.id) } },
      });
    }

    // ── Auto-transitions on geofence approach ──
    // Wrapped: failure here must never break the position write above.
    try {
      await maybeAutoTransition({
        tripId: id,
        currentStatus: trip.status,
        currentLat: latitude,
        currentLng: longitude,
        pickupLat: trip.booking?.taxiDetail?.pickupLat ?? null,
        pickupLng: trip.booking?.taxiDetail?.pickupLng ?? null,
        dropoffLat: trip.booking?.taxiDetail?.dropoffLat ?? null,
        dropoffLng: trip.booking?.taxiDetail?.dropoffLng ?? null,
      });
    } catch (err) {
      logger.error('taxi-tracking', 'auto-transition failed (non-blocking)', { tripId: id, error: err instanceof Error ? err.message : String(err) });
    }

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'INVALID_ACTION' }, { status: 400 });
}
