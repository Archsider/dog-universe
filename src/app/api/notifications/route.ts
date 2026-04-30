import { NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { prisma } from '@/lib/prisma';
import { createAdminMessageNotification } from '@/lib/notifications';
import { logAction, LOG_ACTIONS } from '@/lib/log';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const unreadOnly = searchParams.get('unreadOnly') === 'true';
  const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit') ?? '50')), 100);

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
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { userId, messageFr, messageEn } = await request.json();

    if (!userId || !messageFr) {
      return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 });
    }

    if (typeof messageFr !== 'string' || messageFr.length > 5000) {
      return NextResponse.json({ error: 'MESSAGE_TOO_LONG' }, { status: 400 });
    }
    if (messageEn !== undefined && (typeof messageEn !== 'string' || messageEn.length > 5000)) {
      return NextResponse.json({ error: 'MESSAGE_TOO_LONG' }, { status: 400 });
    }

    const notification = await createAdminMessageNotification(
      userId,
      messageFr,
      messageEn ?? messageFr
    );

    await logAction({
      userId: session.user.id,
      action: LOG_ACTIONS.NOTIFICATION_SENT,
      entityType: 'User',
      entityId: userId,
      details: { messageFr: messageFr.slice(0, 200) },
    });

    return NextResponse.json(notification, { status: 201 });
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', service: 'notification', message: 'Send notification error', error: error instanceof Error ? error.message : String(error), timestamp: new Date().toISOString() }));
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
