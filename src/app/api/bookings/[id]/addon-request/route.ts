import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { notifyAdminsAddonRequest } from '@/lib/notifications';
import { addonRequestSchema } from '@/lib/validation';
import { withSchema } from '@/lib/with-schema';
import { notDeleted } from '@/lib/prisma-soft';

const MAX_REQUESTS_PER_BOOKING = 3;
const ACTIVE_STATUSES = ['CONFIRMED', 'IN_PROGRESS'];

const paramsSchema = z.object({ id: z.string().min(1) });

/**
 * POST /api/bookings/[id]/addon-request
 *
 * Body validation through `withSchema` — the wrapper returns 400 INVALID_JSON
 * on bad payload and 400 VALIDATION_ERROR on Zod failure (with `details`
 * outside production). The handler only enforces business invariants:
 * auth, ownership (IDOR-safe — never confirm a booking exists to a third
 * party), booking state, and per-booking rate limit.
 */
export const POST = withSchema(
  { body: addonRequestSchema, params: paramsSchema },
  async (_request, { body, params }) => {
    const { id } = params;
    const { serviceType, message } = body;

    const session = await auth();
    if (!session?.user || session.user.role !== 'CLIENT') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const booking = await prisma.booking.findFirst({
      where: notDeleted({ id }),
      include: { bookingPets: { include: { pet: { select: { name: true } } } } },
    });

    // IDOR safe: a "Not found" 404 covers both "real not found" and
    // "exists but not yours" — no information leak about other clients'
    // bookings.
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
      where: notDeleted({ id: session.user.id }),
      select: { name: true, email: true },
    });
    const clientName = client?.name ?? client?.email ?? 'Client';
    const petNames = booking.bookingPets.map((bp) => bp.pet.name).join(', ') || '—';
    const bookingRef = booking.id.slice(0, 8).toUpperCase();

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
  },
);
