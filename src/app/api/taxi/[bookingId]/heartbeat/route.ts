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
import { prisma } from '@/lib/prisma';
import { recordHeartbeat } from '@/lib/taxi-heartbeat';
import { recordLocation } from '@/lib/taxi-location';

export const maxDuration = 10;

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
    await recordLocation(bookingId, {
      lat: body.latitude,
      lng: body.longitude,
      timestamp: typeof body.timestamp === 'number' && Number.isFinite(body.timestamp) ? body.timestamp : Date.now(),
      heading: typeof body.heading === 'number' && Number.isFinite(body.heading) ? body.heading : null,
      speed: typeof body.speed === 'number' && Number.isFinite(body.speed) ? body.speed : null,
    });
  }

  return NextResponse.json({ ok: true });
}
