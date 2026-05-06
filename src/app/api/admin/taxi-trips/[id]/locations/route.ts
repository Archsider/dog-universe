import { NextResponse } from 'next/server';
import { auth } from '../../../../../../../auth';
import { prisma } from '@/lib/prisma';

// Admin endpoint — full GPS trail (max 500 points, asc by createdAt) for the
// REPLAY mode displayed on completed/terminal taxi trips.
const MAX_POINTS = 500;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPERADMIN'].includes(session.user.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const trip = await prisma.taxiTrip.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!trip) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const rows = await prisma.taxiLocation.findMany({
    where: { taxiTripId: trip.id },
    orderBy: { createdAt: 'desc' },
    take: MAX_POINTS,
    select: {
      latitude: true,
      longitude: true,
      heading: true,
      speed: true,
      createdAt: true,
    },
  });

  const positions = rows
    .slice()
    .reverse()
    .map((r) => ({
      lat: r.latitude,
      lng: r.longitude,
      heading: r.heading,
      speed: r.speed,
      timestamp: r.createdAt.getTime(),
    }));

  return NextResponse.json({ positions });
}
