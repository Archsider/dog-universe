import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { prisma } from '@/lib/prisma';
import { GRADE_BENEFITS, Grade } from '@/lib/loyalty';

// POST /api/loyalty/claims — client submits a benefit claim
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { benefitKey } = await req.json();
  if (!benefitKey) return NextResponse.json({ error: 'benefitKey required' }, { status: 400 });

  const loyaltyGrade = await prisma.loyaltyGrade.findUnique({
    where: { clientId: session.user.id },
  });
  const grade = (loyaltyGrade?.grade ?? 'BRONZE') as Grade;
  const benefits = GRADE_BENEFITS[grade];
  const benefit = benefits.find((b) => b.key === benefitKey);

  if (!benefit) {
    return NextResponse.json({ error: 'Benefit not available for your grade' }, { status: 403 });
  }

  // Check no active (PENDING or APPROVED) claim for this benefit already exists
  const existing = await prisma.loyaltyBenefitClaim.findFirst({
    where: {
      clientId: session.user.id,
      benefitKey,
      status: { in: ['PENDING', 'APPROVED'] },
    },
  });
  if (existing) {
    return NextResponse.json({ error: 'Already claimed' }, { status: 409 });
  }

  const claim = await prisma.loyaltyBenefitClaim.create({
    data: {
      clientId: session.user.id,
      grade,
      benefitKey,
      benefitLabelFr: benefit.labelFr,
      benefitLabelEn: benefit.labelEn,
    },
  });

  return NextResponse.json(claim, { status: 201 });
}

// GET /api/loyalty/claims — client fetches their own claims
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const claims = await prisma.loyaltyBenefitClaim.findMany({
    where: { clientId: session.user.id },
    orderBy: { claimedAt: 'desc' },
  });

  return NextResponse.json(claims);
}
