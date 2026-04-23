import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { sendSMS, sendAdminSMS } from '@/lib/sms';

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

  const trip = await prisma.taxiTrip.findUnique({
    where: { id: params.id },
    include: {
      booking: {
        select: {
          client: { select: { name: true, phone: true } },
          bookingPets: { select: { pet: { select: { name: true, species: true } } } },
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

  // ── SMS contextuels ─────────────────────────────────────────────────────
  const clientName = trip.booking?.client?.name ?? '';
  const clientPhone = trip.booking?.client?.phone ?? null;
  const petName = trip.booking?.bookingPets.map(bp => bp.pet.name).join(', ') || 'votre animal';

  if (nextStatus === 'PLANNED') {
    // Cas défensif (le flow validation rend cette transition presque
    // impossible — PLANNED est l'état initial). Conservé par cohérence
    // si un trip est replanifié depuis un état non-flow.
    await sendSMS(
      clientPhone,
      `Bonjour ${clientName} ! 🚗 Le transport de ${petName} est bien programmé. Dog Universe sera là à l'heure. — Dog Universe`,
    );
    await sendAdminSMS(`🚗 Taxi planifié : ${petName} de ${clientName}.`);
  } else if (nextStatus === 'ON_SITE_CLIENT') {
    await sendSMS(
      clientPhone,
      `Bonjour ${clientName} ! 🚗 Dog Universe est arrivé à l'adresse prévue pour ${petName}. — Dog Universe`,
    );
  } else if (nextStatus === 'ARRIVED_AT_CLIENT') {
    await sendSMS(
      clientPhone,
      `Bonjour ${clientName} ! 🏡 ${petName} est bien arrivé(e) à destination. Merci de votre confiance. — Dog Universe 🐾`,
    );
    await sendAdminSMS(`✅ Taxi terminé : ${petName} de ${clientName} livré(e).`);
  }

  return NextResponse.json({ ok: true });
}
