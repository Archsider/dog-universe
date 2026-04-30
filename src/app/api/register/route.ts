import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { logAction, LOG_ACTIONS } from '@/lib/log';
import { sendEmail, getEmailTemplate } from '@/lib/email';
import { notifyAdminsNewClient } from '@/lib/notifications';
import { registerSchema, formatZodError } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    const parsed = registerSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(formatZodError(parsed.error), { status: 400 });
    }
    const { name, email, phone, password, language } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: 'EMAIL_TAKEN', message: 'Email already in use' }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          name,            // déjà trimmé par Zod
          email,           // déjà lowercased + trimmé
          phone,           // déjà trimmé / converti en null si vide
          passwordHash,
          role: 'CLIENT',
          language: language ?? 'fr',
        },
      });

      // Create default loyalty grade atomically with user creation
      await tx.loyaltyGrade.create({
        data: {
          clientId: newUser.id,
          grade: 'BRONZE',
          isOverride: false,
        },
      });

      return newUser;
    });

    await logAction({
      userId: user.id,
      action: LOG_ACTIONS.USER_REGISTER,
      entityType: 'User',
      entityId: user.id,
      details: { email: user.email },
    });

    // Admin notification + email — non-blocking
    notifyAdminsNewClient(user.name, user.email, user.phone ?? null, user.id).catch(() => {});

    // Welcome email — non-blocking
    const locale = user.language ?? 'fr';
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.doguniverse.ma';
    const loginUrl = `${appUrl}/${locale}/auth/login`;
    const { subject, html } = getEmailTemplate(
      'welcome',
      { clientName: user.name ?? user.email, loginUrl },
      locale
    );
    sendEmail({ to: user.email, subject, html }).catch(() => {});

    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    }, { status: 201 });
  } catch (error) {
    // Handle Prisma unique constraint violation P2002 (race condition on email)
    if (
      error !== null &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code: string }).code === 'P2002'
    ) {
      return NextResponse.json({ error: 'EMAIL_TAKEN', message: 'Email already in use' }, { status: 409 });
    }
    console.error(JSON.stringify({ level: 'error', service: 'register', message: 'Register error', error: error instanceof Error ? error.message : String(error), timestamp: new Date().toISOString() }));
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: 'An error occurred' }, { status: 500 });
  }
}
