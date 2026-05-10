import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { notifyAdminsAddonRequest } from '@/lib/notifications';
import { addonRequestSchema, formatZodError } from '@/lib/validation';

const MAX_REQUESTS_PER_BOOKING = 3;
const ACTIVE_STATUSES = ['CONFIRMED', 'IN_PROGRESS'];

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user || session.user.role !== 'CLIENT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = addonRequestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(formatZodError(parsed.error), { status: 400 });
  }
  const { serviceType, message } = parsed.data;

  const booking = await prisma.booking.findFirst({
    where: { id, deletedAt: null }, // soft-delete: required — no global extension (Edge Runtime incompatible)
    include: { bookingPets: { include: { pet: { select: { name: true } } } } },
  });

  // IDOR : ne pas confirmer l'existence de la réservation à un client tiers
  if (!booking || booking.clientId !== session.user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!ACTIVE_STATUSES.includes(booking.status)) {
    return NextResponse.json({ error: 'BOOKING_NOT_ACTIVE' }, { status: 400 });
  }

  // Rate limit per booking — count rows directly on the dedicated table.
  const existing = await prisma.addonRequest.count({
    where: { bookingId: id, requestedBy: session.user.id },
  });
  if (existing >= MAX_REQUESTS_PER_BOOKING) {
    return NextResponse.json({ error: 'TOO_MANY_REQUESTS' }, { status: 429 });
  }

  const client = await prisma.user.findFirst({
    where: { id: session.user.id, deletedAt: null }, // soft-delete: required — no global extension (Edge Runtime incompatible)
    select: { name: true, email: true },
  });
  const clientName = client?.name ?? client?.email ?? 'Client';
  const petNames = booking.bookingPets.map(bp => bp.pet.name).join(', ') || '—';
  const bookingRef = booking.id.slice(0, 8).toUpperCase();

  // Persist the request, then notify all admins. The notification still
  // carries metadata for legacy UI paths, but the DB row is now the source
  // of truth.
  const created = await prisma.addonRequest.create({
    data: {
      bookingId: id,
      serviceType,
      description: message ?? '',
      requestedBy: session.user.id,
      status: 'PENDING',
    },
  });

  await notifyAdminsAddonRequest({
    bookingId: id,
    bookingRef,
    clientName,
    petNames,
    serviceType,
    message: message ?? '',
    requestId: created.id,
  });

  return NextResponse.json({ success: true, id: created.id }, { status: 201 });
}
