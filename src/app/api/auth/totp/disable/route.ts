import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { auth } from '../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { verifyTotpForUser } from '@/lib/totp';

/**
 * Disable TOTP. Requires BOTH:
 *  - the current account password (re-auth)
 *  - a valid current TOTP token
 *
 * Both factors are required so that a hijacked session alone (without the
 * password) AND a stolen password alone (without the TOTP device) cannot
 * downgrade the account to single-factor.
 */
export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPERADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { password?: unknown; token?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }
  const password = typeof body.password === 'string' ? body.password : '';
  const token = typeof body.token === 'string' ? body.token.trim() : '';

  if (!password) {
    return NextResponse.json({ error: 'PASSWORD_REQUIRED' }, { status: 400 });
  }
  if (!/^\d{6}$/.test(token)) {
    return NextResponse.json({ error: 'INVALID_TOKEN_FORMAT' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      passwordHash: true,
      totpSecret: true,
      totpEnabled: true,
      lastTotpToken: true,
      lastTotpUsedAt: true,
    },
  });

  if (!user?.totpEnabled || !user.totpSecret) {
    return NextResponse.json({ error: 'TOTP_NOT_ENABLED' }, { status: 400 });
  }

  const passwordOk = await bcrypt.compare(password, user.passwordHash);
  if (!passwordOk) {
    return NextResponse.json({ error: 'INVALID_PASSWORD' }, { status: 401 });
  }

  const result = await verifyTotpForUser(user, token, { persist: true });
  if (!result.ok) {
    return NextResponse.json({ error: result.reason ?? 'INVALID_TOKEN' }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      totpEnabled: false,
      totpSecret: null,
      totpVerifiedAt: null,
      lastTotpToken: null,
      lastTotpUsedAt: null,
    },
  });

  return NextResponse.json({ success: true });
}
