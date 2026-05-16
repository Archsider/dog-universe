// POST /api/time-proposals/[token]/accept — public client-facing endpoint.
//
// The token is HMAC-signed (`signToken` in src/lib/time-proposals.ts) and
// embeds the proposalId. No login required ; the email link is the auth.
//
// Returns 410 Gone if the proposal is no longer PENDING (admin cancelled
// it, client already accepted, etc.) — UI handles by showing a final
// "already resolved" message.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyTimeProposalToken, acceptProposal } from '@/lib/time-proposals';
import { logAction, LOG_ACTIONS } from '@/lib/log';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ token: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  const { token } = await params;
  const proposalId = verifyTimeProposalToken(token);
  if (!proposalId) {
    return NextResponse.json({ error: 'INVALID_TOKEN' }, { status: 401 });
  }

  const proposal = await prisma.timeProposal.findUnique({
    where: { id: proposalId },
    select: {
      id: true,
      bookingId: true,
      scope: true,
      time: true,
      status: true,
      publicToken: true,
      publicTokenExpiresAt: true,
    },
  });
  if (!proposal) {
    return NextResponse.json({ error: 'PROPOSAL_NOT_FOUND' }, { status: 404 });
  }
  // Token might match a row whose token was cleared (already responded).
  // Status check is the source of truth.
  if (proposal.status !== 'PENDING') {
    return NextResponse.json({ error: 'ALREADY_RESOLVED', status: proposal.status }, { status: 410 });
  }
  if (proposal.publicTokenExpiresAt && proposal.publicTokenExpiresAt < new Date()) {
    return NextResponse.json({ error: 'TOKEN_EXPIRED' }, { status: 410 });
  }

  // Fetch booking + client for the audit log + downstream notification.
  const booking = await prisma.booking.findUnique({
    where: { id: proposal.bookingId },
    select: { clientId: true },
  });
  if (!booking) {
    return NextResponse.json({ error: 'BOOKING_NOT_FOUND' }, { status: 404 });
  }

  const r = await acceptProposal({
    proposalId,
    respondedBy: booking.clientId,
    respondedByRole: 'CLIENT',
  });
  if (!r.ok) {
    return NextResponse.json({ error: r.error }, { status: 400 });
  }

  // Notify admins that the client accepted.
  try {
    const { createAdminMessageNotification } = await import('@/lib/notifications');
    void createAdminMessageNotification; // imported for parity ; admin notif via a dedicated helper
    const { notifyAdminsBookingTimeAccepted } = await import('@/lib/notifications/booking-admin-notif');
    await notifyAdminsBookingTimeAccepted({
      bookingId: proposal.bookingId,
      scope: proposal.scope,
      time: proposal.time,
    });
  } catch {
    // Fail-open : the proposal is already accepted in DB.
  }

  await logAction({
    userId: booking.clientId,
    action: LOG_ACTIONS.BOOKING_TIME_CONFIRMED,
    entityType: 'Booking',
    entityId: proposal.bookingId,
    details: {
      scope: proposal.scope,
      time: proposal.time,
      proposalId,
      via: 'public-token',
    },
  });

  return NextResponse.json({
    ok: true,
    scope: proposal.scope,
    time: proposal.time,
    bookingId: proposal.bookingId,
  });
}
