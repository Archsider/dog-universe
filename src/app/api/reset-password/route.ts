import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { addHours } from 'date-fns';
import { prisma } from '@/lib/prisma';
import { sendEmail, getEmailTemplate } from '@/lib/email';
import { resetPasswordRequestSchema, resetPasswordConfirmSchema, formatZodError } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    // Anti-enumeration : on parse en safeParse mais on retourne toujours { message: 'ok' }
    // sans révéler les détails de validation.
    const parsed = resetPasswordRequestSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ message: 'ok' });
    }
    const { email, locale } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

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

      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.doguniverse.ma';
      const resetUrl = `${appUrl}/${locale}/auth/reset-password/${token}`;
      const { subject, html } = getEmailTemplate('reset_password', { resetUrl }, locale);

      await sendEmail({ to: user.email, subject, html });
    }

    // Always return success to prevent email enumeration
    return NextResponse.json({ message: 'ok' });
  } catch (error) {
    console.error('Reset password error:', error);
    return NextResponse.json({ message: 'ok' }); // Still return ok
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
    console.error('Reset password PUT error:', error);
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
