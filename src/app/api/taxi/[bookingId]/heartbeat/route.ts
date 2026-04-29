// Heartbeat endpoint — driver app pings every ~30s while a STANDALONE PET_TAXI
// trip is in progress. Auth is by Bearer token = TaxiTrip.trackingToken (the
// same token used by the public viewer URL — driver receives it out-of-band).
//
// On success, refreshes a Redis key with TTL 310s. The cron worker scans for
// missing keys and fans out a TAXI_HEARTBEAT_LOST notification to admins.
//
// Edge cases:
//   - missing/malformed Authorization header → 401
//   - token doesn't match any trip OR mismatches the URL bookingId → 401
//   - trip is OUTBOUND/RETURN (boarding addon, not standalone) → 400
//   - booking.serviceType !== PET_TAXI → 400
//   - booking.status !== IN_PROGRESS → 400 BOOKING_NOT_ACTIVE
//   - Redis down → recordHeartbeat fails open silently, endpoint still 200s
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { recordHeartbeat } from '@/lib/taxi-heartbeat';

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

  await recordHeartbeat(bookingId);
  return NextResponse.json({ ok: true });
}
