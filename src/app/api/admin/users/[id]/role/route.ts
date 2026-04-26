import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { logAction, LOG_ACTIONS } from '@/lib/log';
import { roleChangeSchema, formatZodError } from '@/lib/validation';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'SUPERADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = params;

  // Prevent self-demotion
  if (id === session.user.id) {
    return NextResponse.json({ error: 'Cannot change your own role' }, { status: 400 });
  }

  const parsed = roleChangeSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(formatZodError(parsed.error), { status: 400 });
  }
  const { role } = parsed.data;

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user || !['ADMIN', 'SUPERADMIN'].includes(user.role)) {
    return NextResponse.json({ error: 'Admin user not found' }, { status: 404 });
  }

  await prisma.user.update({ where: { id }, data: { role } });

  await logAction({
    userId: session.user.id,
    action: LOG_ACTIONS.USER_ROLE_CHANGED,
    entityType: 'User',
    entityId: id,
    details: { from: user.role, to: role, targetEmail: user.email },
  });

  return NextResponse.json({ success: true, role });
}
