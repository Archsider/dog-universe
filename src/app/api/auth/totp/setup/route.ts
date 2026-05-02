import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { auth } from '../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { generateTotpSecret, getTotpQRCodeDataURL, verifyTotpForUser } from '@/lib/totp';
import { encryptSecret } from '@/lib/crypto';

/**
 * Begin (or rotate) TOTP enrolment.
 *
 * Security:
 *  - Requires the current account password (re-auth) — prevents a hijacked
 *    session from silently rotating the second factor and locking the
 *    legitimate owner out.
 *  - If TOTP is already enabled, the caller MUST provide a current valid
 *    `token` from the existing authenticator (rotation = re-enrol flow).
 */
export async function POST(request: Request) {
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

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      passwordHash: true,
      totpEnabled: true,
      totpSecret: true,
      lastTotpToken: true,
      lastTotpUsedAt: true,
    },
  });
  if (!user) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const passwordOk = await bcrypt.compare(password, user.passwordHash);
  if (!passwordOk) {
    return NextResponse.json({ error: 'INVALID_PASSWORD' }, { status: 401 });
  }

  // Rotation: if TOTP is already enabled, require a current valid token from
  // the EXISTING secret before issuing a new one. Otherwise an attacker with
  // session+password (e.g. via session theft + phishing) could swap the
  // second factor.
  if (user.totpEnabled && user.totpSecret) {
    if (!/^\d{6}$/.test(token)) {
      return NextResponse.json({ error: 'CURRENT_TOKEN_REQUIRED' }, { status: 400 });
    }
    const verify = await verifyTotpForUser(
      {
        id: user.id,
        totpSecret: user.totpSecret,
        lastTotpToken: user.lastTotpToken,
        lastTotpUsedAt: user.lastTotpUsedAt,
      },
      token,
      { persist: true },
    );
    if (!verify.ok) {
      const status = verify.reason === 'REPLAY' ? 400 : 401;
      return NextResponse.json({ error: verify.reason ?? 'INVALID_TOKEN' }, { status });
    }
  }

  const secret = generateTotpSecret();
  const encrypted = encryptSecret(secret);

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      totpSecret: encrypted,
      // Re-enrol always disables until verify-setup completes.
      totpEnabled: false,
      totpVerifiedAt: null,
      lastTotpToken: null,
      lastTotpUsedAt: null,
    },
  });

  const qrCodeDataURL = await getTotpQRCodeDataURL(secret, session.user.email ?? '');
  return NextResponse.json({ qrCodeDataURL });
}
