import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPERADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || 'PENDING';

  const claims = await prisma.benefitClaim.findMany({
    where: status === 'ALL' ? {} : { status },
    include: {
      client: { select: { id: true, name: true, email: true, loyaltyGrade: { select: { grade: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(claims);
}
