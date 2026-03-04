import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { prisma } from '@/lib/prisma';
import { CLAIMABLE_BENEFIT_META, getGradeOrder, normalizeGrade } from '@/lib/loyalty';
import type { ClaimableBenefitKey } from '@/lib/loyalty';
import { logAction, LOG_ACTIONS } from '@/lib/log';
import { createBenefitClaimSubmittedNotification } from '@/lib/notifications';

const VALID_KEYS = Object.keys(CLAIMABLE_BENEFIT_META) as ClaimableBenefitKey[];

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const claims = await prisma.benefitClaim.findMany({
    where: { clientId: session.user.id },
    orderBy: { createdAt: 'desc' },
    select: { id: true, benefitKey: true, status: true, note: true, adminNote: true, createdAt: true, approvedAt: true },
  });

  return NextResponse.json(claims);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { benefitKey, note } = body as { benefitKey?: string; note?: string };

  if (!benefitKey || !VALID_KEYS.includes(benefitKey as ClaimableBenefitKey)) {
    return NextResponse.json({ error: 'INVALID_BENEFIT_KEY' }, { status: 400 });
  }

  const key = benefitKey as ClaimableBenefitKey;
  const meta = CLAIMABLE_BENEFIT_META[key];

  // Check client grade
  const loyaltyGrade = await prisma.loyaltyGrade.findUnique({
    where: { clientId: session.user.id },
  });
  const grade = normalizeGrade(loyaltyGrade?.grade ?? 'MEMBER');
  if (getGradeOrder(grade) < getGradeOrder(meta.minGrade)) {
    return NextResponse.json({ error: 'GRADE_TOO_LOW', required: meta.minGrade }, { status: 403 });
  }

  const quota = meta.quotaByGrade[grade] ?? 0;

  // Check for existing PENDING claim of same key
  const pending = await prisma.benefitClaim.findFirst({
    where: { clientId: session.user.id, benefitKey: key, status: 'PENDING' },
  });
  if (pending) {
    return NextResponse.json({ error: 'ALREADY_PENDING' }, { status: 409 });
  }

  // Check quota usage this calendar year
  const startOfYear = new Date(new Date().getFullYear(), 0, 1);
  const approvedCount = await prisma.benefitClaim.count({
    where: {
      clientId: session.user.id,
      benefitKey: key,
      status: 'APPROVED',
      createdAt: { gte: startOfYear },
    },
  });
  if (approvedCount >= quota) {
    return NextResponse.json({ error: 'QUOTA_EXCEEDED', quota }, { status: 409 });
  }

  const claim = await prisma.benefitClaim.create({
    data: {
      clientId: session.user.id,
      benefitKey: key,
      note: note?.trim() || undefined,
    },
  });

  // Notify all admins
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } });
  await Promise.all(
    admins.map((admin) =>
      createBenefitClaimSubmittedNotification(admin.id, session.user.name ?? 'Client', key, claim.id)
    )
  );

  await logAction({
    userId: session.user.id,
    action: LOG_ACTIONS.BENEFIT_CLAIM_SUBMITTED,
    entityType: 'BenefitClaim',
    entityId: claim.id,
    details: { benefitKey: key },
  });

  return NextResponse.json(claim, { status: 201 });
}
