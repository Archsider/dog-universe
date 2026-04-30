import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
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
    where: { id, deletedAt: null },
    include: { bookingPets: { include: { pet: { select: { name: true } } } } },
  });

  // IDOR : ne pas confirmer l'existence de la réservation à un client tiers
  if (!booking || booking.clientId !== session.user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!ACTIVE_STATUSES.includes(booking.status)) {
    return NextResponse.json({ error: 'BOOKING_NOT_ACTIVE' }, { status: 400 });
  }

  // Rate limit : 3 demandes max par réservation. Chaque demande crée N notifications
  // (une par admin) avec une metadata identique (incluant requestId unique).
  // distinct: ['metadata'] regroupe en 1 ligne par demande distincte.
  const allAddonNotifs = await prisma.notification.findMany({
    where: {
      type: 'ADDON_REQUEST',
      metadata: { contains: `"bookingId":"${id}"` },
    },
    orderBy: { createdAt: 'desc' },
    select: { metadata: true },
    take: 30,
  });
  const distinctRequestIds = new Set(
    allAddonNotifs
      .map((n) => {
        try {
          const parsed: unknown = JSON.parse(n.metadata ?? '{}');
          // Runtime guard before treating as Record — DB-side `contains` filter
          // is a substring match on a JSON blob; never trust its shape.
          if (typeof parsed !== 'object' || parsed === null) return null;
          const m = parsed as Record<string, unknown>;
          if (m.bookingId !== id) return null; // belt-and-suspenders vs. substring-match collision
          return typeof m.requestId === 'string' ? m.requestId : null;
        } catch { return null; }
      })
      .filter((x): x is string => x !== null)
  );
  const distinctRequests = [...distinctRequestIds];
  if (distinctRequests.length >= MAX_REQUESTS_PER_BOOKING) {
    return NextResponse.json({ error: 'TOO_MANY_REQUESTS' }, { status: 429 });
  }

  const client = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, email: true },
  });
  const clientName = client?.name ?? client?.email ?? 'Client';
  const petNames = booking.bookingPets.map(bp => bp.pet.name).join(', ') || '—';
  const bookingRef = booking.id.slice(0, 8).toUpperCase();
  const requestId = randomUUID();

  await notifyAdminsAddonRequest({
    bookingId: id,
    bookingRef,
    clientName,
    petNames,
    serviceType,
    message: message ?? '',
    requestId,
  });

  return NextResponse.json({ success: true }, { status: 201 });
}
