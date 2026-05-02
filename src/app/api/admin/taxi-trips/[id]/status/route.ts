import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { sendSMS, sendAdminSMS, petVerb, petArrived, petReturned } from '@/lib/sms';

const FLOWS: Record<string, string[]> = {
  OUTBOUND:   ['PLANNED', 'EN_ROUTE_TO_CLIENT', 'ON_SITE_CLIENT', 'ANIMAL_ON_BOARD', 'ARRIVED_AT_PENSION'],
  STANDALONE: ['PLANNED', 'EN_ROUTE_TO_CLIENT', 'ON_SITE_CLIENT', 'ANIMAL_ON_BOARD', 'ARRIVED_AT_PENSION'],
  RETURN:     ['PLANNED', 'ANIMAL_ON_BOARD', 'EN_ROUTE_TO_CLIENT', 'ARRIVED_AT_CLIENT'],
};

const TERMINAL = new Set(['ARRIVED_AT_PENSION', 'ARRIVED_AT_CLIENT']);

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPERADMIN'].includes(session.user.role ?? '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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

  await prisma.$transaction([
    prisma.taxiTrip.update({ where: { id: id }, data: { status: nextStatus } }),
    prisma.taxiStatusHistory.create({
      data: { taxiTripId: id, status: nextStatus, updatedBy: session.user.id },
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

  // ── SMS contextuels — accord genre/pluriel ──────────────────────────────
  const clientName = trip.booking?.client?.name ?? '';
  const firstName = clientName.split(' ')[0] || clientName;
  const clientPhone = trip.booking?.client?.phone ?? null;
  const pets = trip.booking?.bookingPets.map(bp => bp.pet) ?? [];
  const petNames = pets.map(p => p.name).join(' et ') || 'votre animal';

  // Additive notifications — sendSMS now throws on breaker/timeout/gateway
  // failure; swallow to keep the status transition succeeding.
  const safeSend = (p: Promise<unknown>) => p.catch(() => undefined);
  if (nextStatus === 'PLANNED') {
    // Cas défensif (le flow validation rend cette transition presque
    // impossible — PLANNED est l'état initial). Conservé par cohérence.
    await safeSend(sendSMS(
      clientPhone,
      `Bonjour ${firstName} ! 🚗 Le transport de ${petNames} est bien programmé. Dog Universe sera là à l'heure. — Dog Universe`,
    ));
    await safeSend(sendAdminSMS(`🚗 Taxi planifié : ${petNames} de ${clientName}.`));
  } else if (nextStatus === 'ON_SITE_CLIENT') {
    await safeSend(sendSMS(
      clientPhone,
      `Bonjour ${firstName} ! Dog Universe est arrivé à votre adresse pour ${petNames}. — Dog Universe 🚗`,
    ));
  } else if (nextStatus === 'ANIMAL_ON_BOARD') {
    await safeSend(sendSMS(
      clientPhone,
      `Bonjour ${firstName} ! ${petNames} ${petVerb(pets, 'present')} à bord, nous sommes en route. À tout de suite ! — Dog Universe 🚗`,
    ));
    await safeSend(sendAdminSMS(`🚗 À bord : ${petNames} de ${clientName} en route.`));
  } else if (nextStatus === 'ARRIVED_AT_PENSION') {
    await safeSend(sendSMS(
      clientPhone,
      `Bonjour ${firstName} ! ${petNames} ${petVerb(pets, 'present')} bien ${petArrived(pets)} chez Dog Universe. Nous en prenons soin. — Dog Universe 🐾`,
    ));
    await safeSend(sendAdminSMS(`🏠 Arrivée pension via taxi : ${petNames} de ${clientName}.`));
  } else if (nextStatus === 'ARRIVED_AT_CLIENT') {
    await safeSend(sendSMS(
      clientPhone,
      `Bonjour ${firstName} ! ${petNames} ${petVerb(pets, 'present')} bien ${petReturned(pets)} à la maison. Merci pour votre confiance. — Dog Universe 🐾`,
    ));
    await safeSend(sendAdminSMS(`✅ Rendu : ${petNames} de ${clientName} livré à domicile.`));
  }

  return NextResponse.json({ ok: true });
}
