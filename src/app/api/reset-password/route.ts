import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { addHours } from 'date-fns';
import { prisma } from '@/lib/prisma';
import { sendEmail, getEmailTemplate } from '@/lib/email';
import { resetPasswordRequestSchema, resetPasswordConfirmSchema, formatZodError } from '@/lib/validation';
import { APP_URL } from '@/lib/config';

// Floor de temps de réponse — masque l'écart "user existe vs n'existe pas"
// (timing side-channel qui permettrait l'énumération malgré la réponse uniforme).
const MIN_RESPONSE_MS = 250;

async function padResponse<T>(start: number, value: T): Promise<T> {
  const elapsed = Date.now() - start;
  if (elapsed < MIN_RESPONSE_MS) {
    await new Promise((r) => setTimeout(r, MIN_RESPONSE_MS - elapsed));
  }
  return value;
}

export async function POST(request: Request) {
  const start = Date.now();
  try {
    // Anti-enumeration : on parse en safeParse mais on retourne toujours { message: 'ok' }
    // sans révéler les détails de validation.
    const parsed = resetPasswordRequestSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return await padResponse(start, NextResponse.json({ message: 'ok' }));
    }
    const { email, locale } = parsed.data;

    const user = await prisma.user.findFirst({ where: { email: email.toLowerCase(), deletedAt: null } }); // soft-delete: required — no global extension (Edge Runtime incompatible)

    if (user) {
      // Invalider les anciens tokens non utilisés avant d'en créer un nouveau
      await prisma.passwordResetToken.deleteMany({
        where: { userId: user.id, used: false },
      });

      const token = randomUUID();
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          token,
          expiresAt: addHours(new Date(), 1),
        },
      });

      const resetUrl = `${APP_URL}/${locale}/auth/reset-password/${token}`;
      const { subject, html } = getEmailTemplate('reset_password', { resetUrl }, locale);

      await sendEmail({ to: user.email, subject, html });
    }

    // Always return success to prevent email enumeration
    return await padResponse(start, NextResponse.json({ message: 'ok' }));
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', service: 'reset-password', message: 'Reset password error', error: error instanceof Error ? error.message : String(error), timestamp: new Date().toISOString() }));
    return await padResponse(start, NextResponse.json({ message: 'ok' })); // Still return ok
  }
}

export async function PUT(request: Request) {
  try {
    const parsed = resetPasswordConfirmSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(formatZodError(parsed.error), { status: 400 });
    }
    const { token, password } = parsed.data;

    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!resetToken || resetToken.used || resetToken.expiresAt < new Date()) {
      return NextResponse.json({ error: 'TOKEN_EXPIRED' }, { status: 400 });
    }

    const bcrypt = await import('bcryptjs');
    const passwordHash = await bcrypt.hash(password, 12);

    // Increment tokenVersion to invalidate all existing sessions immediately
    await prisma.$transaction([
      prisma.user.update({ where: { id: resetToken.userId }, data: { passwordHash, tokenVersion: { increment: 1 } } }),
      prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { used: true } }),
    ]);

    return NextResponse.json({ message: 'ok' });
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', service: 'reset-password', message: 'Reset password PUT error', error: error instanceof Error ? error.message : String(error), timestamp: new Date().toISOString() }));
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
