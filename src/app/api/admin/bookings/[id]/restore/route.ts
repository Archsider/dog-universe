import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { logAction } from '@/lib/log';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const booking = await prisma.booking.findFirst({
    where: { id, deletedAt: { not: null } },
    select: { id: true, status: true, clientId: true },
  });

  if (!booking) {
    return NextResponse.json({ error: 'Not found or not deleted' }, { status: 404 });
  }

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
