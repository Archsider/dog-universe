import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { prisma } from '@/lib/prisma';
import { GRADE_BENEFITS, Grade } from '@/lib/loyalty';
import { notifyAdminsNewLoyaltyClaim } from '@/lib/notifications';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { revalidateTag } from 'next/cache';

let ratelimit: Ratelimit | null = null;
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  ratelimit = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(5, '1 h'),
    prefix: 'loyalty_claims',
  });
}

// POST /api/loyalty/claims — client submits a benefit claim
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (ratelimit) {
    const { success } = await ratelimit.limit(session.user.id);
    if (!success) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }
  }

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

  let claim;
  try {
    claim = await prisma.loyaltyBenefitClaim.create({
      data: {
        clientId: session.user.id,
        grade,
        benefitKey,
        benefitLabelFr: benefit.labelFr,
        benefitLabelEn: benefit.labelEn,
      },
    });
  } catch (err) {
    // P2002 = unique constraint violation — concurrent submission race condition
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'P2002') {
      return NextResponse.json({ error: 'Already claimed' }, { status: 409 });
    }
    throw err;
  }

  // Notify admins (non-blocking)
  prisma.user.findFirst({ where: { id: session.user.id, deletedAt: null }, select: { name: true, email: true } }) // soft-delete: required — no global extension (Edge Runtime incompatible)
    .then((client) => notifyAdminsNewLoyaltyClaim(
      client?.name ?? client?.email ?? 'Client',
      benefit.labelFr,
      benefit.labelEn,
      claim.id
    ))
    .catch(() => {});

  // New PENDING claim → admin claims badge changes.
  revalidateTag('admin-counts');

  return NextResponse.json(claim, { status: 201 });
}

// GET /api/loyalty/claims — client fetches their own claims
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const claims = await prisma.loyaltyBenefitClaim.findMany({
    where: { clientId: session.user.id },
    orderBy: { claimedAt: 'desc' },
    take: 100,
  });

  return NextResponse.json(claims);
}
