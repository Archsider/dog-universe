import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { logAction, LOG_ACTIONS } from '@/lib/log';
import {
  createBenefitClaimApprovedNotification,
  createBenefitClaimRejectedNotification,
} from '@/lib/notifications';

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { status, adminNote } = body as { status?: string; adminNote?: string };

  if (!status || !['APPROVED', 'REJECTED'].includes(status)) {
    return NextResponse.json({ error: 'INVALID_STATUS' }, { status: 400 });
  }

  const claim = await prisma.benefitClaim.findUnique({ where: { id: params.id } });
  if (!claim) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (claim.status !== 'PENDING') {
    return NextResponse.json({ error: 'ALREADY_PROCESSED' }, { status: 409 });
  }

  const updated = await prisma.benefitClaim.update({
    where: { id: params.id },
    data: {
      status,
      adminNote: adminNote?.trim() || undefined,
      approvedBy: session.user.id,
      approvedAt: new Date(),
    },
  });

  if (status === 'APPROVED') {
    await createBenefitClaimApprovedNotification(claim.clientId, claim.benefitKey);
    await logAction({
      userId: session.user.id,
      action: LOG_ACTIONS.BENEFIT_CLAIM_APPROVED,
      entityType: 'BenefitClaim',
      entityId: claim.id,
      details: { benefitKey: claim.benefitKey, clientId: claim.clientId },
    });
  } else {
    await createBenefitClaimRejectedNotification(claim.clientId, claim.benefitKey, adminNote);
    await logAction({
      userId: session.user.id,
      action: LOG_ACTIONS.BENEFIT_CLAIM_REJECTED,
      entityType: 'BenefitClaim',
      entityId: claim.id,
      details: { benefitKey: claim.benefitKey, clientId: claim.clientId, adminNote },
    });
  }

  return NextResponse.json(updated);
}
