import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';
import { prisma } from '@/lib/prisma';
import { onlyDeleted } from '@/lib/prisma-soft';
import { logAction } from '@/lib/log';
import { withSpan } from '@/lib/observability';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withSpan('api.admin.bookings.restore', { entityId: id }, () => restoreImpl(id));
}

async function restoreImpl(id: string): Promise<Response> {
  const guard = await requireRole(['ADMIN', 'SUPERADMIN']);
  if (guard.error) return guard.error;
  const { session } = guard;

  const booking = await prisma.booking.findFirst({
    where: onlyDeleted({ id }),
    select: { id: true, status: true, clientId: true },
  });

  if (!booking) {
    return NextResponse.json({ error: 'Not found or not deleted' }, { status: 404 });
  }

  // eslint-disable-next-line dog-universe/no-inline-deletedAt-null -- OK: write op restoring a deleted booking, not a where filter
  await prisma.booking.update({ where: { id }, data: { deletedAt: null } });

  await logAction({
    userId: session.user.id,
    action: 'BOOKING_RESTORED',
    entityType: 'Booking',
    entityId: id,
    details: { status: booking.status, clientId: booking.clientId },
  });

  return NextResponse.json({ message: 'restored' });
}
