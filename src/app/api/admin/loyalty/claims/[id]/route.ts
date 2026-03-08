import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../../auth';
import { prisma } from '@/lib/prisma';

// PATCH /api/admin/loyalty/claims/[id] — approve or reject a claim
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPERADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { action, rejectionReason } = await req.json();
  if (!['APPROVED', 'REJECTED'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }
  if (action === 'REJECTED' && (!rejectionReason?.trim() || rejectionReason.trim().length < 3)) {
    return NextResponse.json({ error: 'Rejection reason required (min 3 characters)' }, { status: 400 });
  }

  const claim = await prisma.loyaltyBenefitClaim.update({
    where: { id: params.id },
    data: {
      status: action,
      rejectionReason: action === 'REJECTED' ? rejectionReason.trim() : null,
      reviewedBy: session.user.id,
      reviewedAt: new Date(),
    },
    include: { client: { select: { name: true, email: true } } },
  });

  return NextResponse.json(claim);
}
