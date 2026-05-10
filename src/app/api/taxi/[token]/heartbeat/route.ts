// Heartbeat endpoint — driver app pings every ~30s while a STANDALONE PET_TAXI
// trip is in progress. Auth is by Bearer token = TaxiTrip.trackingToken (the
// same token used by the public viewer URL — driver receives it out-of-band).
//
// On success, refreshes a Redis heartbeat key (TTL 310s). The cron worker
// scans for missing keys and fans out a TAXI_HEARTBEAT_LOST notification.
//
// Optionally, if the body carries { latitude, longitude }, the same ping
// also writes the position to Redis (taxi:location:{bookingId}) so the SSE
// stream at /api/taxi/[token]/stream can push it to viewers without DB hits.
//
// Edge cases:
//   - missing/malformed Authorization header → 401
//   - token doesn't match any trip OR mismatches the URL bookingId → 401
//   - trip is OUTBOUND/RETURN (boarding addon, not standalone) → 400
//   - booking.serviceType !== PET_TAXI → 400
//   - booking.status !== IN_PROGRESS → 400 BOOKING_NOT_ACTIVE
//   - invalid lat/lng → silently ignored (heartbeat still recorded)
//   - Redis down → recordHeartbeat / recordLocation fail open silently
import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { prisma } from '@/lib/prisma';
import { recordHeartbeat } from '@/lib/taxi-heartbeat';
import { recordLocation, getLocation, haversineKm } from '@/lib/taxi-location';
import { haversineDistance } from '@/lib/geo';
import { tryAcquireFlag, cacheGet, cacheSet, cacheDel } from '@/lib/cache';
import { maybeAutoTransition } from '@/lib/taxi-auto-transition';
import { verifyTaxiToken } from '@/lib/taxi-token';
import {
  createTaxiNearPickupNotification,
  createTaxiArrivedNotification,
} from '@/lib/notifications';
import { withSpan } from '@/lib/observability';

export const maxDuration = 10;

const MAX_ACCURACY_METERS = 50;
const MAX_SPEED_KMH = 200;

interface HeartbeatBody {
  latitude?: number;
  longitude?: number;
  heading?: number | null;
  speed?: number | null;
  accuracy?: number | null;
  timestamp?: number;
}

function isValidLat(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= -90 && v <= 90;
}
function isValidLng(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= -180 && v <= 180;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token: urlToken } = await params;
  return withSpan('api.taxi.heartbeat', { tokenPrefix: urlToken.slice(0, 8) }, () => heartbeatImpl(request, urlToken));
}

async function heartbeatImpl(request: NextRequest, urlToken: string) {

  const auth = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  const providedToken = match?.[1]?.trim();
  if (!providedToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // Timing-safe comparison to prevent token oracle attacks
  const aBuffer = Buffer.from(providedToken);
  const bBuffer = Buffer.from(urlToken);
  const tokensMatch = aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer);
  if (!tokensMatch) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // HMAC verify first — invalid signatures return 401 *without* hitting DB.
  // Legacy UUID tokens fall back to a DB lookup (no signature to verify).
  const verified = verifyTaxiToken(providedToken);

  const tripQuery = {
    select: {
      id: true,
      bookingId: true,
      tripType: true,
      status: true,
      trackingToken: true,
      trackingTokenExpiresAt: true,
      booking: {
        select: {
          status: true,
          serviceType: true,
          deletedAt: true,
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
  } as const;

  const trip = verified
    ? await prisma.taxiTrip.findUnique({ where: { id: verified.tripId }, ...tripQuery })
    : await prisma.taxiTrip.findUnique({ where: { trackingToken: providedToken }, ...tripQuery });

  // For HMAC-signed tokens, the token in DB must still match (not rotated).
  if (
    !trip ||
    trip.booking.deletedAt ||
    (verified && trip.trackingToken !== providedToken)
  ) {
    if (!verified) {
      console.error(JSON.stringify({
        level: 'warn',
        service: 'taxi-token',
        event: '404',
        ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
        tokenPrefix: providedToken.slice(0, 8),
        timestamp: new Date().toISOString(),
      }));
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Hard expiry — leaked SMS link cannot be replayed forever.
  if (trip.trackingTokenExpiresAt && trip.trackingTokenExpiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: 'Gone' }, { status: 410 });
  }
  const bookingId = trip.bookingId;

  if (trip.booking.serviceType !== 'PET_TAXI' || trip.tripType !== 'STANDALONE') {
    return NextResponse.json({ error: 'NOT_STANDALONE_TAXI' }, { status: 400 });
  }

  if (trip.booking.status !== 'IN_PROGRESS') {
    return NextResponse.json({ error: 'BOOKING_NOT_ACTIVE' }, { status: 400 });
  }

  let body: HeartbeatBody = {};
  try {
    body = ((await request.json()) as HeartbeatBody) ?? {};
  } catch {
    body = {};
  }

  await recordHeartbeat(bookingId);

  if (isValidLat(body.latitude) && isValidLng(body.longitude)) {
    // ── Quality gate: low-accuracy fixes (>50 m horizontal error) ──
    if (
      typeof body.accuracy === 'number' &&
      Number.isFinite(body.accuracy) &&
      body.accuracy > MAX_ACCURACY_METERS
    ) {
      console.error(JSON.stringify({
        level: 'info',
        service: 'taxi-heartbeat',
        message: 'gps point ignored (low_accuracy)',
        bookingId,
        accuracy: body.accuracy,
        timestamp: new Date().toISOString(),
      }));
      return NextResponse.json({ ok: true, ignored: 'low_accuracy' });
    }

    // ── Quality gate: implausible speed (>200 km/h) vs previous fix ──
    try {
      const prev = await getLocation(bookingId);
      if (prev && typeof prev.timestamp === 'number') {
        const dKm = haversineKm(prev.lat, prev.lng, body.latitude, body.longitude);
        const dtSec = Math.max(0.001, (Date.now() - prev.timestamp) / 1000);
        const speedKmh = (dKm / dtSec) * 3600;
        if (speedKmh > MAX_SPEED_KMH) {
          console.error(JSON.stringify({
            level: 'info',
            service: 'taxi-heartbeat',
            message: 'gps point ignored (speed_outlier)',
            bookingId,
            speedKmh: Math.round(speedKmh),
            deltaKm: dKm,
            dtSec,
            timestamp: new Date().toISOString(),
          }));
          return NextResponse.json({ ok: true, ignored: 'speed_outlier' });
        }
      }
    } catch { /* fail-open: if Redis is down we cannot diff vs prev — accept point */ }

    await recordLocation(bookingId, {
      lat: body.latitude,
      lng: body.longitude,
      timestamp: typeof body.timestamp === 'number' && Number.isFinite(body.timestamp) ? body.timestamp : Date.now(),
      heading: typeof body.heading === 'number' && Number.isFinite(body.heading) ? body.heading : null,
      speed: typeof body.speed === 'number' && Number.isFinite(body.speed) ? body.speed : null,
    });

    // ── Auto-transitions on geofence approach (pickup / dropoff) ──
    try {
      await maybeAutoTransition({
        tripId: trip.id,
        currentStatus: trip.status,
        currentLat: body.latitude,
        currentLng: body.longitude,
        pickupLat: trip.booking.taxiDetail?.pickupLat ?? null,
        pickupLng: trip.booking.taxiDetail?.pickupLng ?? null,
        dropoffLat: trip.booking.taxiDetail?.dropoffLat ?? null,
        dropoffLng: trip.booking.taxiDetail?.dropoffLng ?? null,
      });
    } catch (err) {
      console.error(JSON.stringify({
        level: 'error',
        service: 'taxi-heartbeat',
        message: 'auto-transition failed (non-blocking)',
        bookingId,
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      }));
    }

    // Geofencing with hysteresis (O6): a driver who *passes* within 95m
    // without stopping should not fire ARRIVED. We track a per-booking zone
    // state in Redis (FAR | NEAR | ARRIVED) plus a NEAR-entry timestamp,
    // and only promote NEAR → ARRIVED after a 30s dwell. If the driver
    // leaves the NEAR ring (>300m) without arriving, the zone resets to
    // FAR so a re-approach can re-fire NEAR.
    //
    // Skips silently when pickup coords are not set (legacy bookings).
    // Wrapped in try/catch so geofencing NEVER breaks the heartbeat.
    try {
      const pickupLat = trip.booking.taxiDetail?.pickupLat;
      const pickupLng = trip.booking.taxiDetail?.pickupLng;
      if (
        pickupLat != null &&
        pickupLng != null &&
        trip.status === 'EN_ROUTE_TO_CLIENT'
      ) {
        const distance = haversineDistance(body.latitude, body.longitude, pickupLat, pickupLng);
        const clientId = trip.booking.clientId;
        const zoneKey = `taxi:zone:${bookingId}`;
        type ZoneState = { zone: 'FAR' | 'NEAR' | 'ARRIVED'; nearSince?: number };
        const prev = (await cacheGet<ZoneState>(zoneKey)) ?? { zone: 'FAR' };
        const now = Date.now();

        if (distance < 100) {
          if (prev.zone === 'NEAR' && prev.nearSince && now - prev.nearSince >= 30_000) {
            // Dwell satisfied — promote to ARRIVED + notify (idempotent).
            const acquired = await tryAcquireFlag(`taxi:arrived_alert:${bookingId}`, 3600);
            if (acquired) {
              await createTaxiArrivedNotification(clientId, bookingId, 'fr');
            }
            await cacheSet<ZoneState>(zoneKey, { zone: 'ARRIVED' }, 3600);
          } else if (prev.zone !== 'ARRIVED' && prev.zone !== 'NEAR') {
            // Entering the inner ring directly — start dwell timer.
            await cacheSet<ZoneState>(zoneKey, { zone: 'NEAR', nearSince: now }, 3600);
          } else if (prev.zone === 'NEAR') {
            // Still inside but dwell not yet reached — keep waiting.
          }
        } else if (distance < 1000) {
          if (prev.zone === 'FAR') {
            // Crossing into NEAR ring — first announcement.
            const acquired = await tryAcquireFlag(`taxi:near_alert:${bookingId}`, 3600);
            if (acquired) {
              await createTaxiNearPickupNotification(clientId, bookingId, distance, 'fr');
            }
            await cacheSet<ZoneState>(zoneKey, { zone: 'NEAR', nearSince: now }, 3600);
          }
          // already NEAR or ARRIVED → no-op
        } else if (distance > 300) {
          // Driver moved away from the inner ring without arriving —
          // reset zone so a fresh approach can re-trigger NEAR. We
          // intentionally use 300m (not 1000m) as the reset threshold so
          // jitter near the boundary doesn't churn the state.
          if (prev.zone === 'NEAR') {
            await cacheDel(zoneKey);
          }
        }
      }
    } catch (err) {
      console.error(JSON.stringify({
        level: 'error',
        service: 'taxi-heartbeat',
        message: 'geofencing failed (non-blocking)',
        bookingId,
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      }));
    }
  }

  return NextResponse.json({ ok: true });
}
