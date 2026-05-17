import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';
import { prisma } from '@/lib/prisma';
import { logAction, LOG_ACTIONS } from '@/lib/log';
import { createLoyaltyUpdateNotification } from '@/lib/notifications';
import { isUpgrade } from '@/lib/loyalty';
import { invalidateLoyaltyCache } from '@/lib/loyalty-server';
import { gradeOverrideSchema, formatZodError } from '@/lib/validation';

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Params) {
  const authResult = await requireRole(['ADMIN', 'SUPERADMIN']);
  if (authResult.error) return authResult.error;
  const { session } = authResult;

  const { id } = await params;
  const parsed = gradeOverrideSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(formatZodError(parsed.error), { status: 400 });
  }
  const { grade } = parsed.data;

  // Sprint 1 sécurité — ne jamais upsert un grade fidélité sur un user
  // qui n'est pas un CLIENT actif (évite création silencieuse de grade
  // sur un ADMIN/SUPERADMIN ou un user soft-deleted).
  const target = await prisma.user.findUnique({
    where: { id },
    select: { role: true, deletedAt: true },
  });
  if (!target || target.role !== 'CLIENT' || target.deletedAt !== null) {
    return NextResponse.json({ error: 'CLIENT_NOT_FOUND' }, { status: 404 });
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

  await invalidateLoyaltyCache(id);

  return NextResponse.json(updated);
}
