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

    // Bounded retry on P2034 (Serializable conflict) — a racer can be
    // aborted by SSI even when the cap is not yet reached, so naively
    // mapping P2034 → 429 would drop valid requests.  Up to 3 attempts
    // with small backoff ; after that we surface the conflict as 503 so
    // the client can retry, NOT as 429 which would lie about the cap.
    async function runCountAndCreate() {
      return prisma.$transaction(async (tx) => {
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
    }

    let created: { id: string } | undefined;
    const MAX_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        created = await runCountAndCreate();
        break;
      } catch (err) {
        if (err instanceof Error && err.message === 'TOO_MANY_REQUESTS') {
          return NextResponse.json({ error: 'TOO_MANY_REQUESTS' }, { status: 429 });
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const code = (err as any)?.code;
        if (code === 'P2034' && attempt < MAX_ATTEMPTS) {
          // Small jittered backoff to avoid lock-step retries.
          await new Promise((r) => setTimeout(r, 30 + Math.floor(Math.random() * 50)));
          continue;
        }
        if (code === 'P2034') {
          // Bounded retry exhausted — let the client try again later.
          return NextResponse.json({ error: 'CONCURRENT_CONFLICT' }, { status: 503 });
        }
        throw err;
      }
    }
    if (!created) {
      // Defensive — the loop above returns on every non-success path,
      // so this is just to satisfy the type narrowing.
      return NextResponse.json({ error: 'UNEXPECTED' }, { status: 500 });
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
