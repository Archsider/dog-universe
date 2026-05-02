import { NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { verifyTotpToken } from '@/lib/totp';

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPERADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const token = typeof body.token === 'string' ? body.token.trim() : '';
  if (!/^\d{6}$/.test(token)) {
    return NextResponse.json({ error: 'INVALID_TOKEN_FORMAT' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { totpSecret: true, totpEnabled: true },
  });

  if (!user?.totpEnabled || !user.totpSecret) {
    return NextResponse.json({ error: 'TOTP_NOT_ENABLED' }, { status: 400 });
  }

  const valid = await verifyTotpToken(user.totpSecret, token);
  if (!valid) {
    return NextResponse.json({ error: 'INVALID_TOKEN' }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { totpEnabled: false, totpSecret: null, totpVerifiedAt: null },
  });

  return NextResponse.json({ success: true });
}
