// DELETE /api/admin/bookings/[id]/messages/[messageId] — ADMIN / SUPERADMIN only.
//
// Soft-deletes an admin-initiated message (Notification type ADMIN_MESSAGE or
// END_STAY_REPORT) sent to a client. The client view filters
// `deletedAt: null` so the message disappears from the client app within
// 30 s (next notif refresh). The admin reservation page keeps showing it
// struck-through with "Supprimé par X le Y" for audit traceability.
//
// SAFETY :
//   - The endpoint is scoped to the SINGLE message id passed in the URL.
//     The booking id segment is only used to authorise + cross-check the
//     message's metadata bookingId (so an admin can't accidentally delete
//     a message attached to a different booking by guessing IDs).
//   - We only allow soft-delete on `ADMIN_MESSAGE` and `END_STAY_REPORT`
//     types. System notifications (BOOKING_CONFIRMATION, STAY_REMINDER,
//     etc.) are NOT deletable here — they represent real events.
//   - Idempotent: DELETE on an already-deleted message returns 200 with
//     `{ alreadyDeleted: true }`. No 404.
//   - ActionLog entry captures payloadBefore (the full message body) so
//     even after Notification rows age out we have the proof of what was
//     sent and by whom.

import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';
import { prisma } from '@/lib/prisma';
import { logAction } from '@/lib/log';
import { invalidateNotifCount } from '@/lib/notifications/core';

const DELETABLE_TYPES = new Set(['ADMIN_MESSAGE', 'END_STAY_REPORT']);

interface Params {
  params: Promise<{ id: string; messageId: string }>;
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id: bookingId, messageId } = await params;

  const guard = await requireRole(['ADMIN', 'SUPERADMIN']);
  if (guard.error) return guard.error;
  const { session } = guard;

  const message = await prisma.notification.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      userId: true,
      type: true,
      messageFr: true,
      messageEn: true,
      metadata: true,
      createdAt: true,
      deletedAt: true,
      deletedBy: true,
    },
  });

  if (!message) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!DELETABLE_TYPES.has(message.type)) {
    return NextResponse.json(
      { error: 'NOT_DELETABLE', detail: `Type ${message.type} is system-generated and cannot be deleted.` },
      { status: 400 },
    );
  }

  // Idempotent — repeat DELETE doesn't error, just confirms the prior soft-delete.
  if (message.deletedAt) {
    return NextResponse.json({ deleted: true, alreadyDeleted: true });
  }

  // Cross-check that the URL booking id matches the message's metadata.bookingId
  // (when present). Defends against an admin opening the message DELETE URL
  // for /booking-A while pasting a messageId attached to /booking-B.
  if (message.metadata) {
    try {
      const meta = JSON.parse(message.metadata) as Record<string, unknown>;
      if (typeof meta.bookingId === 'string' && meta.bookingId !== bookingId) {
        return NextResponse.json(
          { error: 'MISMATCH', detail: 'Message booking id does not match URL.' },
          { status: 400 },
        );
      }
    } catch {
      // Malformed metadata — proceed (the booking-mismatch guard is defensive,
      // not an integrity check on metadata format).
    }
  }

  await prisma.notification.update({
    where: { id: messageId },
    data: {
      deletedAt: new Date(),
      deletedBy: session.user.id,
    },
  });

  // Client-side unread-count cache for this user could now show a stale value
  // if the deleted message was unread. Invalidate so the bell badge updates
  // immediately (the next /api/notifications/count call goes to DB).
  await invalidateNotifCount(message.userId);

  await logAction({
    userId: session.user.id,
    action: 'NOTIFICATION_DELETED',
    entityType: 'notification',
    entityId: messageId,
    details: {
      type: message.type,
      bookingId,
      recipientUserId: message.userId,
      // Snapshot the body BEFORE soft-delete in case the row eventually
      // ages out — this is the long-term audit trail.
      payloadBefore: {
        messageFr: message.messageFr,
        messageEn: message.messageEn,
        createdAt: message.createdAt.toISOString(),
      },
    },
  });

  return NextResponse.json({ deleted: true });
}
