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
import { auth } from '../../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { logAction, LOG_ACTIONS } from '@/lib/log';
import { supersedePendingForBooking } from '@/lib/time-proposals';
import { withSpan } from '@/lib/observability';

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
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

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
    where: { id: bookingId, deletedAt: null },
    select: {
      id: true,
      clientId: true,
      status: true,
      version: true,
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
      const updated = await prisma.booking.update({
        where: { id: bookingId, version: booking.version },
        data: {
          status: 'CANCELLED',
          cancellationReason: body.reason,
          version: { increment: 1 },
        },
        select: { id: true },
      }).catch(() => null);
      if (!updated) {
        return NextResponse.json({ error: 'VERSION_CONFLICT' }, { status: 409 });
      }

      // 2. Cascade : SUPERSEDE all PENDING time proposals.
      const supersededCount = await supersedePendingForBooking(bookingId);

      // 3. Client notification (unless silent).
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

      // 4. Audit log.
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
