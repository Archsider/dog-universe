// POST /api/admin/bookings/[id]/cancel — explicit cancellation flow.
//
// Distinct from PATCH /api/admin/bookings/[id] { status: 'CANCELLED' } :
//  - requires a `reason` ≥ 10 chars (the underlying PATCH also enforces
//    this, but the front-end gets a clearer dedicated endpoint + the
//    response carries the cascade summary so the UI can warn about
//    superseded time proposals)
//  - cascade : marks all PENDING TimeProposal for this booking as
//    SUPERSEDED (cleaning up open negotiations)
//  - audit : BOOKING_CANCELLED with reason
//  - notif : sends BOOKING_CANCELLED to the client
//
// Source : audit produit 2026-05-17 + UX bug "Forcer un statut Annulé ne
// marche pas" — root cause was the missing reason field on the PATCH.
// This endpoint gives the UI an explicit + ergonomic cancel path.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-guards';
import { prisma } from '@/lib/prisma';
import { notDeleted } from '@/lib/prisma-soft';
import { logAction, LOG_ACTIONS } from '@/lib/log';
import { supersedePendingForBooking } from '@/lib/time-proposals';
import { withSpan, logServerError } from '@/lib/observability';
import { handleNoShowInvoice } from '@/lib/services/booking-admin/status-transitions';
import { invalidateAvailabilityCache } from '@/lib/availability-cache';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, 'reason must be ≥ 10 chars')
    .max(2000),
  /** When true, no notification is sent to the client (silent admin cancel —
   *  ex: data cleanup). Defaults to false (the client is informed). */
  silent: z.boolean().optional(),
}).strict();

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const { id: bookingId } = await params;
  const guard = await requireRole(['ADMIN', 'SUPERADMIN']);
  if (guard.error) return guard.error;
  const { session } = guard;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'INVALID_BODY', issues: err.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }

  const booking = await prisma.booking.findFirst({
    where: notDeleted({ id: bookingId }),
    select: {
      id: true,
      clientId: true,
      status: true,
      version: true,
      startDate: true,
      endDate: true,
      client: { select: { role: true, name: true, email: true, language: true, phone: true } },
    },
  });
  if (!booking) {
    return NextResponse.json({ error: 'BOOKING_NOT_FOUND' }, { status: 404 });
  }
  if (session.user.role === 'ADMIN' && booking.client.role !== 'CLIENT') {
    return NextResponse.json({ error: 'CROSS_ROLE_FORBIDDEN' }, { status: 403 });
  }

  // Status guard : we don't cancel terminal bookings.
  if (
    booking.status === 'COMPLETED' ||
    booking.status === 'CANCELLED' ||
    booking.status === 'REJECTED' ||
    booking.status === 'NO_SHOW'
  ) {
    return NextResponse.json(
      { error: 'INVALID_STATUS_TRANSITION', from: booking.status, to: 'CANCELLED' },
      { status: 400 },
    );
  }

  return withSpan(
    'api.admin.booking.cancel',
    { bookingId, role: session.user.role, fromStatus: booking.status },
    async () => {
      // 1. Flip the booking to CANCELLED with the reason — same path as
      //    PATCH /api/admin/bookings/[id] but bundled with the cascade.
      let updated;
      try {
        updated = await prisma.booking.update({
          where: { id: bookingId, version: booking.version },
          data: {
            status: 'CANCELLED',
            cancellationReason: body.reason,
            version: { increment: 1 },
          },
          select: { id: true },
        });
      } catch (err) {
        // P2025 = row not found (race lost or already cancelled).  Any
        // other Prisma error (DB down, schema mismatch, FK violation)
        // must NOT masquerade as VERSION_CONFLICT — surface it so the
        // operator sees the real failure in the toast + Sentry.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const code = (err as any)?.code;
        if (code === 'P2025') {
          return NextResponse.json({ error: 'VERSION_CONFLICT' }, { status: 409 });
        }
        logServerError('booking-cancel', 'unexpected db error on update', err);
        return NextResponse.json({
          error: 'DB_ERROR',
          code: code ?? null,
          detail: err instanceof Error ? err.message : String(err),
        }, { status: 500 });
      }

      // 2. Cascade : SUPERSEDE all PENDING time proposals.
      const supersededCount = await supersedePendingForBooking(bookingId);

      // 3. Invoice handling : same path as NO_SHOW — cancels unpaid invoice,
      //    keeps paid ones with audit, restocks products. Required parity ;
      //    until 2026-05-19 the cancel flow left a dangling PENDING invoice
      //    + occupied stock cells silently.
      try {
        await handleNoShowInvoice({
          bookingId,
          actorId: session.user.id,
          previousStatus: booking.status,
        });
      } catch (err) {
        logServerError('booking-cancel', 'invoice handling failed', err);
      }

      // 4. Release the calendar slot — without this the availability API
      //    keeps the cancelled stay's dates blocked until the cache TTL.
      try {
        await invalidateAvailabilityCache(booking.startDate, booking.endDate);
      } catch (err) {
        logServerError('booking-cancel', 'availability cache invalidate failed', err);
      }

      // 5. Client notification (unless silent).
      if (!body.silent) {
        try {
          const { createBookingCancelledNotification } = await import('@/lib/notifications');
          await createBookingCancelledNotification({
            userId: booking.clientId,
            bookingId,
            reason: body.reason,
          });
        } catch {
          // Notification failure is non-fatal — the cancel is already
          // persisted. Logger captures structured details for follow-up.
        }
      }

      // 6. Audit log.
      await logAction({
        userId: session.user.id,
        action: LOG_ACTIONS.BOOKING_CANCELLED,
        entityType: 'Booking',
        entityId: bookingId,
        details: {
          reason: body.reason,
          fromStatus: booking.status,
          silent: body.silent === true,
          timeProposalsSuperseded: supersededCount,
        },
      });

      return NextResponse.json({
        ok: true,
        timeProposalsSuperseded: supersededCount,
      });
    },
  );
}
