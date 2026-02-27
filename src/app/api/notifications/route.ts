import { NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { prisma } from '@/lib/prisma';
import { createAdminMessageNotification } from '@/lib/notifications';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const unreadOnly = searchParams.get('unreadOnly') === 'true';
  const limit = parseInt(searchParams.get('limit') ?? '50');

  const where: Record<string, unknown> = { userId: session.user.id };
  if (unreadOnly) where.read = false;

  const notifications = await prisma.notification.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return NextResponse.json(notifications);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { userId, messageFr, messageEn } = await request.json();

    if (!userId || !messageFr) {
      return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 });
    }

    const notification = await createAdminMessageNotification(
      userId,
      messageFr,
      messageEn ?? messageFr
    );

    return NextResponse.json(notification, { status: 201 });
  } catch (error) {
    console.error('Send notification error:', error);
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
