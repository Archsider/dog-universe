import { NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { verifyTotpForUser } from '@/lib/totp';

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPERADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const token = typeof body.token === 'string' ? body.token.trim() : '';
  if (!/^\d{6}$/.test(token)) {
    return NextResponse.json({ error: 'INVALID_TOKEN_FORMAT' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      totpSecret: true,
      lastTotpToken: true,
      lastTotpUsedAt: true,
    },
  });

  if (!user?.totpSecret) {
    return NextResponse.json({ error: 'SETUP_NOT_STARTED' }, { status: 400 });
  }

  const result = await verifyTotpForUser(user, token, { persist: true });
  if (!result.ok) {
    const status = result.reason === 'REPLAY' ? 400 : 400;
    return NextResponse.json({ error: result.reason ?? 'INVALID_TOKEN' }, { status });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { totpEnabled: true, totpVerifiedAt: new Date() },
  });

  return NextResponse.json({ success: true });
}
