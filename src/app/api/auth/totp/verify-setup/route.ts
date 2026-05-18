import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';
import { prisma } from '@/lib/prisma';
import { verifyTotpForUser } from '@/lib/totp';

export async function POST(request: Request) {
  const guard = await requireRole(['ADMIN', 'SUPERADMIN']);
  if (guard.error) return guard.error;
  const { session } = guard;

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
