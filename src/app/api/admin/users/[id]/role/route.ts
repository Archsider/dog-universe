import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { prisma } from '@/lib/prisma';

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

  let role: string;
  try {
    const body = await req.json();
    role = body.role;
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  if (!['ADMIN', 'SUPERADMIN'].includes(role)) {
    return NextResponse.json({ error: 'Invalid role. Must be ADMIN or SUPERADMIN' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user || !['ADMIN', 'SUPERADMIN'].includes(user.role)) {
    return NextResponse.json({ error: 'Admin user not found' }, { status: 404 });
  }

  await prisma.user.update({ where: { id }, data: { role } });

  return NextResponse.json({ success: true, role });
}
