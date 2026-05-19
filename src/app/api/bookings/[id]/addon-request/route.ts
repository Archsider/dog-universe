import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-guards';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
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

    const guard = await requireRole(['CLIENT']);
    if (guard.error) return guard.error;
    const { session } = guard;

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

    // Atomic count + create — two double-clicks (or a retry) used to both
    // pass the cap check (both saw N < MAX) and both insert.  Serializable
    // forces a re-check on commit ; the racer gets a P2034 retry-error
    // which we surface as 429 (same as the cap hit).
    const client = await prisma.user.findFirst({
      where: notDeleted({ id: session.user.id }),
      select: { name: true, email: true },
    });
    const clientName = client?.name ?? client?.email ?? 'Client';
    const petNames = booking.bookingPets.map((bp) => bp.pet.name).join(', ') || '—';
    const bookingRef = booking.id.slice(0, 8).toUpperCase();

    let created;
    try {
      created = await prisma.$transaction(async (tx) => {
        const existing = await tx.addonRequest.count({
          where: { bookingId: id, requestedBy: session.user.id },
        });
        if (existing >= MAX_REQUESTS_PER_BOOKING) {
          throw new Error('TOO_MANY_REQUESTS');
        }
        return tx.addonRequest.create({
          data: {
            bookingId: id,
            serviceType,
            description: message ?? '',
            requestedBy: session.user.id,
            status: 'PENDING',
          },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (err) {
      if (err instanceof Error && err.message === 'TOO_MANY_REQUESTS') {
        return NextResponse.json({ error: 'TOO_MANY_REQUESTS' }, { status: 429 });
      }
      // P2034 = Serializable retry needed (concurrent commit conflict) ;
      // surface as the same 429 — the racer effectively hit the cap.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((err as any)?.code === 'P2034') {
        return NextResponse.json({ error: 'TOO_MANY_REQUESTS', concurrent: true }, { status: 429 });
      }
      throw err;
    }

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
