import { NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { prisma } from '@/lib/prisma';
import { notDeleted } from '@/lib/prisma-soft';

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ count: 0 });

  // Same `deletedAt: null` guard as the list endpoint — a deleted message
  // must not inflate the unread badge count even if `read` is still false
  // at the time of deletion.
  const count = await prisma.notification.count({
    where: notDeleted({ userId: session.user.id, read: false }),
  });

  return NextResponse.json({ count });
}
