// POST /api/admin/bookings/[id]/time-proposals
//
// Admin proposes a time (ARRIVAL / TAXI_GO / TAXI_RETURN) OR accepts the
// client's PENDING proposal. Body discriminator :
//
//   { action: 'propose', scope, time, note? }
//   { action: 'accept',  proposalId, note? }
//   { action: 'reject',  proposalId, note (required ≥ 10) }
//
// Side effects (post-commit) :
//  - propose : email + notif to client with public token link
//  - accept  : email + notif "Heure confirmée" to client
//  - reject  : notif to client "Votre proposition d'heure a été refusée"
//
// Source : architecture proposal classe mondiale 2026-05-17.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-guards';
import { prisma } from '@/lib/prisma';
import { notDeleted } from '@/lib/prisma-soft';
import { logAction, LOG_ACTIONS } from '@/lib/log';
import {
  createProposal,
  acceptProposal,
  rejectProposal,
} from '@/lib/time-proposals';
import { withSpan } from '@/lib/observability';

export const dynamic = 'force-dynamic';

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const bodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('propose'),
    scope: z.enum(['ARRIVAL', 'TAXI_GO', 'TAXI_RETURN']),
    time: z.string().regex(TIME_RE, 'time must be HH:MM 24h'),
    note: z.string().trim().max(500).optional().nullable(),
  }),
  z.object({
    action: z.literal('accept'),
    proposalId: z.string().min(1).max(64),
    note: z.string().trim().max(500).optional().nullable(),
  }),
  z.object({
    action: z.literal('reject'),
    proposalId: z.string().min(1).max(64),
    note: z.string().trim().min(10, 'rejection note ≥ 10 chars required').max(500),
  }),
]);

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

  // Sanity : the booking must exist + role gate (ADMIN can only touch
  // CLIENT-owned bookings ; SUPERADMIN any).
  const booking = await prisma.booking.findFirst({
    where: notDeleted({ id: bookingId }),
    select: {
      id: true,
      clientId: true,
      client: { select: { role: true, name: true, email: true, language: true, phone: true } },
    },
  });
  if (!booking) {
    return NextResponse.json({ error: 'BOOKING_NOT_FOUND' }, { status: 404 });
  }
  if (session.user.role === 'ADMIN' && booking.client.role !== 'CLIENT') {
    return NextResponse.json({ error: 'CROSS_ROLE_FORBIDDEN' }, { status: 403 });
  }

  return withSpan(
    'api.admin.booking.time-proposal',
    { action: body.action, bookingId, role: session.user.role },
    async () => {
      if (body.action === 'propose') {
        const r = await createProposal({
          bookingId,
          scope: body.scope,
          time: body.time,
          proposedBy: session.user.id,
          proposedByRole: session.user.role as 'ADMIN' | 'SUPERADMIN',
          proposalNote: body.note ?? null,
          emitPublicToken: true,
        });
        if (!r.ok) {
          const status = r.error === 'BOOKING_NOT_FOUND' ? 404 : 400;
          return NextResponse.json({ error: r.error }, { status });
        }

        // Post-commit : notify client + email with public link.
        const { createTimeProposedNotification } = await import('@/lib/notifications');
        await createTimeProposedNotification({
          userId: booking.clientId,
          bookingId,
          scope: body.scope,
          proposedTime: body.time,
          publicToken: r.publicToken ?? '',
          proposalNote: body.note ?? null,
        }).catch(() => undefined);

        await logAction({
          userId: session.user.id,
          action: LOG_ACTIONS.BOOKING_TIME_PROPOSED,
          entityType: 'Booking',
          entityId: bookingId,
          details: {
            scope: body.scope,
            time: body.time,
            proposalId: r.proposalId,
            note: body.note ?? null,
          },
        });
        return NextResponse.json({
          ok: true,
          proposalId: r.proposalId,
          publicToken: r.publicToken,
          publicTokenExpiresAt: r.publicTokenExpiresAt,
        });
      }

      if (body.action === 'accept') {
        // Verify the proposal belongs to this booking before acting on it.
        const owner = await prisma.timeProposal.findUnique({
          where: { id: body.proposalId },
          select: { bookingId: true, scope: true, time: true, status: true },
        });
        if (!owner || owner.bookingId !== bookingId) {
          return NextResponse.json({ error: 'PROPOSAL_NOT_FOUND' }, { status: 404 });
        }
        const r = await acceptProposal({
          proposalId: body.proposalId,
          respondedBy: session.user.id,
          respondedByRole: session.user.role as 'ADMIN' | 'SUPERADMIN',
          responseNote: body.note ?? null,
        });
        if (!r.ok) {
          return NextResponse.json({ error: r.error }, { status: 400 });
        }

        // Notify client that the time is now confirmed.
        const { createTimeConfirmedNotification } = await import('@/lib/notifications');
        await createTimeConfirmedNotification({
          userId: booking.clientId,
          bookingId,
          scope: owner.scope,
          confirmedTime: owner.time,
        }).catch(() => undefined);

        await logAction({
          userId: session.user.id,
          action: LOG_ACTIONS.BOOKING_TIME_CONFIRMED,
          entityType: 'Booking',
          entityId: bookingId,
          details: { scope: owner.scope, time: owner.time, proposalId: body.proposalId },
        });
        return NextResponse.json({ ok: true });
      }

      // reject
      const owner = await prisma.timeProposal.findUnique({
        where: { id: body.proposalId },
        select: { bookingId: true, scope: true },
      });
      if (!owner || owner.bookingId !== bookingId) {
        return NextResponse.json({ error: 'PROPOSAL_NOT_FOUND' }, { status: 404 });
      }
      const r = await rejectProposal({
        proposalId: body.proposalId,
        respondedBy: session.user.id,
        respondedByRole: session.user.role as 'ADMIN' | 'SUPERADMIN',
        responseNote: body.note,
      });
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });

      await logAction({
        userId: session.user.id,
        action: LOG_ACTIONS.BOOKING_TIME_REJECTED,
        entityType: 'Booking',
        entityId: bookingId,
        details: { scope: owner.scope, proposalId: body.proposalId, note: body.note },
      });
      return NextResponse.json({ ok: true });
    },
  );
}
