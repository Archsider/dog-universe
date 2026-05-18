import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';
import { prisma } from '@/lib/prisma';
import { clearLocation } from '@/lib/taxi-location';
import { notifyTaxiTransition } from '@/lib/taxi-notifications';

const FLOWS: Record<string, string[]> = {
  OUTBOUND:   ['PLANNED', 'EN_ROUTE_TO_CLIENT', 'ON_SITE_CLIENT', 'ANIMAL_ON_BOARD', 'ARRIVED_AT_PENSION'],
  STANDALONE: ['PLANNED', 'EN_ROUTE_TO_CLIENT', 'ON_SITE_CLIENT', 'ANIMAL_ON_BOARD', 'ARRIVED_AT_PENSION'],
  RETURN:     ['PLANNED', 'ANIMAL_ON_BOARD', 'EN_ROUTE_TO_CLIENT', 'ARRIVED_AT_CLIENT'],
};

// Terminal trip statuses — when reached we (a) stop the SSE stream by setting
// trackingActive=false, (b) ROTATE trackingToken to null so any cached SMS
// link returns 404, and (c) clear the Redis location cache. Admins can still
// view the historical replay via /admin/reservations/[id] (cookie-auth).
const TERMINAL = new Set(['ARRIVED_AT_PENSION', 'ARRIVED_AT_CLIENT']);

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireRole(['ADMIN', 'SUPERADMIN']);
  if (guard.error) return guard.error;
  const { session } = guard;

  const body = await request.json() as { nextStatus?: string };
  const { nextStatus } = body;

  const trip = await prisma.taxiTrip.findUnique({
    where: { id: id },
    include: {
      booking: {
        select: {
          client: { select: { name: true, phone: true } },
          bookingPets: { select: { pet: { select: { name: true, species: true, gender: true } } } },
        },
      },
    },
  });
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

  const reachedTerminal = TERMINAL.has(nextStatus);

  // On terminal transition: rotate trackingToken to null + disable trackingActive.
  // Anyone still holding the old SMS link will hit 404 on /track/[token] and
  // 404 on the SSE endpoint. Admin replay path is unaffected (auth, no token).
  await prisma.$transaction([
    prisma.taxiTrip.update({
      where: { id: id },
      data: reachedTerminal
        ? { status: nextStatus, trackingActive: false, trackingToken: null }
        : { status: nextStatus },
    }),
    prisma.taxiStatusHistory.create({
      data: { taxiTripId: id, status: nextStatus, updatedBy: session.user.id },
    }),
  ]);

  // Best-effort: drop the Redis last-known location so a stale entry doesn't
  // linger for an hour after the trip ends. clearLocation never throws.
  if (reachedTerminal) {
    await clearLocation(trip.bookingId);
  }

  // Sync Booking.status for STANDALONE trips
  if (trip.tripType === 'STANDALONE') {
    if (reachedTerminal) {
      await prisma.booking.update({ where: { id: trip.bookingId }, data: { status: 'COMPLETED' } });
    } else if (trip.status === 'PLANNED') {
      await prisma.booking.update({
        where: { id: trip.bookingId, status: 'CONFIRMED' },
        data: { status: 'IN_PROGRESS' },
      });
    }
  }

  // SMS contextuels — accord genre/pluriel — délégué au helper partagé.
  await notifyTaxiTransition(nextStatus, {
    clientName: trip.booking?.client?.name ?? '',
    clientPhone: trip.booking?.client?.phone ?? null,
    pets: trip.booking?.bookingPets.map(bp => bp.pet) ?? [],
  });

  return NextResponse.json({ ok: true });
}
