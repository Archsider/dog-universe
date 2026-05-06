import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Public endpoint — token-auth via trackingToken UUID. Returns the trail
// (last 200 GPS points, asc by createdAt) for the polyline overlay on the
// public tracking page. No PII included.
const MAX_POINTS = 200;

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const trip = await prisma.taxiTrip.findUnique({
    where: { trackingToken: token },
    select: { id: true },
  });

  if (!trip) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
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

  return NextResponse.json({ positions });
}
