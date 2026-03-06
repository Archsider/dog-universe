import { NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { logAction, LOG_ACTIONS } from '@/lib/log';

const ALLOWED_STATUSES = ['PAID', 'PENDING', 'CANCELLED'];

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPERADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { ids, status } = await request.json();

  if (!Array.isArray(ids) || ids.length === 0 || !ALLOWED_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const updateData = status === 'PAID'
    ? { status, paidAt: new Date() }
    : { status };

  await prisma.invoice.updateMany({ where: { id: { in: ids } }, data: updateData });

  await logAction({
    userId: session.user.id,
    action: status === 'PAID' ? LOG_ACTIONS.INVOICE_PAID : LOG_ACTIONS.INVOICE_CREATED,
    entityType: 'Invoice',
    entityId: 'bulk',
    details: { ids, status },
  });

  return NextResponse.json({ updated: ids.length });
}
