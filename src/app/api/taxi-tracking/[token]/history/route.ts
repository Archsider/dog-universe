import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyTaxiToken } from '@/lib/taxi-token';

// Public endpoint — token-auth via HMAC-signed trackingToken (legacy UUID
// fallback). Returns the trail (last 200 GPS points, asc by createdAt) for
// the polyline overlay on the public tracking page. No PII.
const MAX_POINTS = 200;
const HEADERS = {
  'Cache-Control': 'no-store, private',
  'X-Robots-Tag': 'noindex, nofollow',
} as const;

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const verified = verifyTaxiToken(token);

  const trip = verified
    ? await prisma.taxiTrip.findUnique({
        where: { id: verified.tripId },
        select: { id: true, trackingToken: true, trackingTokenExpiresAt: true },
      })
    : await prisma.taxiTrip.findUnique({
        where: { trackingToken: token },
        select: { id: true, trackingToken: true, trackingTokenExpiresAt: true },
      });

  if (!trip || (verified && trip.trackingToken !== token)) {
    if (!verified) {
      const ip = _req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
      console.error(JSON.stringify({
        level: 'warn',
        service: 'taxi-token',
        event: '404',
        ip,
        tokenPrefix: token.slice(0, 8),
        timestamp: new Date().toISOString(),
      }));
    }
    return NextResponse.json({ error: 'Not found' }, { status: 404, headers: HEADERS });
  }

  if (trip.trackingTokenExpiresAt && trip.trackingTokenExpiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: 'Gone' }, { status: 410, headers: HEADERS });
  }

  // Strategy: take the most recent 200 points (desc), then reverse to asc.
  // Avoids loading the entire history if a long trip accumulated more.
  const rows = await prisma.taxiLocation.findMany({
    where: { taxiTripId: trip.id },
    orderBy: { createdAt: 'desc' },
    take: MAX_POINTS,
    select: { latitude: true, longitude: true, createdAt: true },
  });

  const positions = rows
    .slice()
    .reverse()
    .map((r) => ({
      lat: r.latitude,
      lng: r.longitude,
      timestamp: r.createdAt.getTime(),
    }));

  return NextResponse.json({ positions }, { headers: HEADERS });
}
