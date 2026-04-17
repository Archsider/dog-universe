import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../../auth';
import { prisma } from '@/lib/prisma';

const FLOWS: Record<string, string[]> = {
  OUTBOUND:   ['PLANNED', 'EN_ROUTE_TO_CLIENT', 'ON_SITE_CLIENT', 'ANIMAL_ON_BOARD', 'ARRIVED_AT_PENSION'],
  STANDALONE: ['PLANNED', 'EN_ROUTE_TO_CLIENT', 'ON_SITE_CLIENT', 'ANIMAL_ON_BOARD', 'ARRIVED_AT_PENSION'],
  RETURN:     ['PLANNED', 'ANIMAL_ON_BOARD', 'EN_ROUTE_TO_CLIENT', 'ARRIVED_AT_CLIENT'],
};

const TERMINAL = new Set(['ARRIVED_AT_PENSION', 'ARRIVED_AT_CLIENT']);

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPERADMIN'].includes(session.user.role ?? '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json() as { nextStatus?: string };
  const { nextStatus } = body;

  const trip = await prisma.taxiTrip.findUnique({ where: { id: params.id } });
  if (!trip) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const flow = FLOWS[trip.tripType];
  if (!flow) return NextResponse.json({ error: 'Unknown trip type' }, { status: 400 });

  const currentIdx = flow.indexOf(trip.status);
  const expectedNext = currentIdx >= 0 ? flow[currentIdx + 1] : null;

  if (!nextStatus || nextStatus !== expectedNext) {
    return NextResponse.json(
      { error: `Invalid transition: ${trip.status} → ${nextStatus ?? '?'}, expected ${expectedNext}` },
      { status: 400 },
    );
  }

  await prisma.$transaction([
    prisma.taxiTrip.update({ where: { id: params.id }, data: { status: nextStatus } }),
    prisma.taxiStatusHistory.create({
      data: { taxiTripId: params.id, status: nextStatus, updatedBy: session.user.id },
    }),
  ]);

  // Sync Booking.status for STANDALONE trips
  if (trip.tripType === 'STANDALONE') {
    if (TERMINAL.has(nextStatus)) {
      await prisma.booking.update({ where: { id: trip.bookingId }, data: { status: 'COMPLETED' } });
    } else if (trip.status === 'PLANNED') {
      await prisma.booking.update({
        where: { id: trip.bookingId, status: 'CONFIRMED' },
        data: { status: 'IN_PROGRESS' },
      });
    }
  }

  return NextResponse.json({ ok: true });
}
