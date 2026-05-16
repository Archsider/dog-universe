// POST /api/time-proposals/[token]/reject — public client-facing endpoint.
//
// Same auth model as accept (HMAC token = email link). Body :
//   { note: string ≥ 10 chars }

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { verifyTimeProposalToken, rejectProposal } from '@/lib/time-proposals';
import { logAction, LOG_ACTIONS } from '@/lib/log';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  note: z.string().trim().min(10, 'note ≥ 10 chars required').max(500),
}).strict();

type Params = { params: Promise<{ token: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const { token } = await params;
  const proposalId = verifyTimeProposalToken(token);
  if (!proposalId) {
    return NextResponse.json({ error: 'INVALID_TOKEN' }, { status: 401 });
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

  const proposal = await prisma.timeProposal.findUnique({
    where: { id: proposalId },
    select: { id: true, bookingId: true, scope: true, status: true, publicTokenExpiresAt: true },
  });
  if (!proposal) {
    return NextResponse.json({ error: 'PROPOSAL_NOT_FOUND' }, { status: 404 });
  }
  if (proposal.status !== 'PENDING') {
    return NextResponse.json({ error: 'ALREADY_RESOLVED', status: proposal.status }, { status: 410 });
  }
  if (proposal.publicTokenExpiresAt && proposal.publicTokenExpiresAt < new Date()) {
    return NextResponse.json({ error: 'TOKEN_EXPIRED' }, { status: 410 });
  }

  const booking = await prisma.booking.findUnique({
    where: { id: proposal.bookingId },
    select: { clientId: true },
  });
  if (!booking) {
    return NextResponse.json({ error: 'BOOKING_NOT_FOUND' }, { status: 404 });
  }

  const r = await rejectProposal({
    proposalId,
    respondedBy: booking.clientId,
    respondedByRole: 'CLIENT',
    responseNote: body.note,
  });
  if (!r.ok) {
    return NextResponse.json({ error: r.error }, { status: 400 });
  }

  // Admin notification — they need to propose a new time.
  try {
    const { notifyAdminsBookingTimeRejected } = await import('@/lib/notifications/booking-admin-notif');
    await notifyAdminsBookingTimeRejected({
      bookingId: proposal.bookingId,
      scope: proposal.scope,
      note: body.note,
    });
  } catch {
    // Fail-open.
  }

  await logAction({
    userId: booking.clientId,
    action: LOG_ACTIONS.BOOKING_TIME_REJECTED,
    entityType: 'Booking',
    entityId: proposal.bookingId,
    details: {
      scope: proposal.scope,
      proposalId,
      note: body.note,
      via: 'public-token',
    },
  });

  return NextResponse.json({ ok: true });
}
