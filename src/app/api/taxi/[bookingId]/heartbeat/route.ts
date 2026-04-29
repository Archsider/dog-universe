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
// GPS points are validated before storage — invalid points return 200 with
// { ok: true, filtered: true } so the driver app keeps running.
//
// Edge cases:
//   - missing/malformed Authorization header → 401
//   - token doesn't match any trip OR mismatches the URL bookingId → 401
//   - trip is OUTBOUND/RETURN (boarding addon, not standalone) → 400
//   - booking.serviceType !== PET_TAXI → 400
//   - booking.status !== IN_PROGRESS → 400 BOOKING_NOT_ACTIVE
//   - invalid/implausible GPS point → 200 { ok: true, filtered: true }
//   - Redis down → recordHeartbeat / recordLocation fail open silently
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { recordHeartbeat } from '@/lib/taxi-heartbeat';
import { recordLocation, getLocation, validateGPSPoint } from '@/lib/taxi-location';
import { getBullMQConnection, isBullMQConfigured } from '@/lib/redis-bullmq';

interface HeartbeatBody {
  latitude?: number;
  longitude?: number;
  heading?: number | null;
  speed?: number | null;
  timestamp?: number;
}

function isValidLat(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= -90 && v <= 90;
}
function isValidLng(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= -180 && v <= 180;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;

  const auth = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  const providedToken = match?.[1]?.trim();
  if (!providedToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const trip = await prisma.taxiTrip.findUnique({
    where: { trackingToken: providedToken },
    select: {
      bookingId: true,
      tripType: true,
      booking: { select: { status: true, serviceType: true, deletedAt: true } },
    },
  });

  // Token mismatch OR token belongs to a different booking → opaque 401
  if (!trip || trip.bookingId !== bookingId || trip.booking.deletedAt) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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
    const snap = {
      lat: body.latitude,
      lng: body.longitude,
      timestamp: typeof body.timestamp === 'number' && Number.isFinite(body.timestamp) ? body.timestamp : Date.now(),
      heading: typeof body.heading === 'number' && Number.isFinite(body.heading) ? body.heading : null,
      speed: typeof body.speed === 'number' && Number.isFinite(body.speed) ? body.speed : null,
    };

    // Fetch previous point for plausibility checks (fail-open on Redis miss)
    const previous = await getLocation(bookingId);
    const validation = validateGPSPoint(snap, previous);

    if (!validation.valid) {
      console.warn('[taxi:gps] point filtered', { bookingId, reason: validation.reason, snap });
      return NextResponse.json({ ok: true, filtered: true });
    }

    await recordLocation(bookingId, snap);

    // Publish to Pub/Sub channel so SSE subscribers receive the update instantly
    if (isBullMQConfigured()) {
      getBullMQConnection()
        .publish(`taxi:position:${bookingId}`, JSON.stringify(snap))
        .catch(() => { /* non-critical — SSE falls back to polling */ });
    }
  }

  return NextResponse.json({ ok: true });
}
