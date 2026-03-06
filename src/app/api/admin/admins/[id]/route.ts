import { NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { logAction } from '@/lib/log';

type Params = { params: Promise<{ id: string }> };

// Demote admin back to CLIENT (SUPERADMIN only)
export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'SUPERADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  if (id === session.user.id) {
    return NextResponse.json({ error: 'CANNOT_DEMOTE_SELF' }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true, email: true, role: true } });
  if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (target.role === 'SUPERADMIN') {
    return NextResponse.json({ error: 'CANNOT_DEMOTE_SUPERADMIN' }, { status: 400 });
  }

  await prisma.user.update({ where: { id }, data: { role: 'CLIENT' } });

  await logAction({
    userId: session.user.id,
    action: 'ADMIN_DEMOTED',
    entityType: 'User',
    entityId: id,
    details: { email: target.email, demotedBy: session.user.email },
  });

  return NextResponse.json({ message: 'ok' });
}
