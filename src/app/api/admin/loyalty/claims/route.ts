import { NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { prisma } from '@/lib/prisma';

// GET /api/admin/loyalty/claims — list all claims (admin only)
export async function GET() {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPERADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const claims = await prisma.loyaltyBenefitClaim.findMany({
    include: {
      client: { select: { id: true, name: true, email: true } },
      reviewer: { select: { name: true } },
    },
    orderBy: { claimedAt: 'desc' },
    take: 200,
  });

  return NextResponse.json(claims);
}
