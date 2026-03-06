import { NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { prisma } from '@/lib/prisma';

// Maintenance endpoint — SUPERADMIN only via session auth.
// Use the bootstrap script / Prisma seed for initial setup.
export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== 'SUPERADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admins = await prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'SUPERADMIN'] } },
    select: { email: true, name: true, role: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  const clientCount = await prisma.user.count({ where: { role: 'CLIENT' } });
  const bookingCount = await prisma.booking.count();

  return NextResponse.json({ admins, clientCount, bookingCount });
}
