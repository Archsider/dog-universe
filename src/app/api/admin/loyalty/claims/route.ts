import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth-guards';

// GET /api/admin/loyalty/claims — list all claims (admin only)
export async function GET() {
  const guard = await requireRole(['ADMIN', 'SUPERADMIN']);
  if (guard.error) return guard.error;

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
