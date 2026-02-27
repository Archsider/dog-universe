import { NextResponse } from 'next/server';
import { auth } from '../../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { logAction, LOG_ACTIONS } from '@/lib/log';
import { createLoyaltyUpdateNotification } from '@/lib/notifications';
import { isUpgrade } from '@/lib/loyalty';

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const { grade } = await request.json();

  if (!['BRONZE', 'SILVER', 'GOLD', 'PLATINUM'].includes(grade)) {
    return NextResponse.json({ error: 'Invalid grade' }, { status: 400 });
  }

  const currentGrade = await prisma.loyaltyGrade.findUnique({ where: { clientId: id } });

  const updated = await prisma.loyaltyGrade.upsert({
    where: { clientId: id },
    update: {
      grade,
      isOverride: true,
      overrideBy: session.user.id,
      overrideAt: new Date(),
    },
    create: {
      clientId: id,
      grade,
      isOverride: true,
      overrideBy: session.user.id,
      overrideAt: new Date(),
    },
  });

  // Notify client if it's an upgrade
  if (!currentGrade || isUpgrade(currentGrade.grade as Parameters<typeof isUpgrade>[0], grade as Parameters<typeof isUpgrade>[1])) {
    await createLoyaltyUpdateNotification(id, grade);
  }

  await logAction({
    userId: session.user.id,
    action: LOG_ACTIONS.LOYALTY_GRADE_OVERRIDE,
    entityType: 'User',
    entityId: id,
    details: { previousGrade: currentGrade?.grade, newGrade: grade, override: true },
  });

  return NextResponse.json(updated);
}
