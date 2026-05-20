// POST   /api/referrals — issue a shareable referral link (sponsor = current user)
// GET    /api/referrals — list own referrals + ambassador tier

import { NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { prisma } from '@/lib/prisma';
import { notDeleted } from '@/lib/prisma-soft';
import { signReferralToken } from '@/lib/referral-token';
import { getAmbassadorTier } from '@/lib/referral';

export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  if (session.user.role !== 'CLIENT') {
    return NextResponse.json({ error: 'CLIENT_ONLY' }, { status: 403 });
  }
  // Walk-in clients can't share — they don't have a portal account.
  const me = await prisma.user.findFirst({
    where: notDeleted({ id: session.user.id, isWalkIn: false }),
    select: { id: true },
  });
  if (!me) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const token = signReferralToken(me.id);
  const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXTAUTH_URL || '').replace(/\/$/, '');
  return NextResponse.json({
    token,
    url: `${baseUrl}/sponsor/${token}`,
  });
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  if (session.user.role !== 'CLIENT') {
    return NextResponse.json({ error: 'CLIENT_ONLY' }, { status: 403 });
  }

  const [list, badge] = await Promise.all([
    prisma.referral.findMany({
      where: { sponsorId: session.user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        status: true,
        signedUpAt: true,
        rewardedAt: true,
        createdAt: true,
        referee: { select: { firstName: true, lastName: true } },
        refereeEmail: true,
      },
    }),
    getAmbassadorTier(session.user.id),
  ]);

  return NextResponse.json({
    badge,
    referrals: list.map(r => ({
      id: r.id,
      status: r.status,
      signedUpAt: r.signedUpAt?.toISOString() ?? null,
      rewardedAt: r.rewardedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      // Reveal only first name — preserve referee privacy from sponsor.
      refereeFirstName: r.referee?.firstName ?? null,
      refereeEmail: r.refereeEmail,
    })),
  });
}
