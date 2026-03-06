import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { logAction, LOG_ACTIONS } from '@/lib/log';
import { sendEmail, getEmailTemplate } from '@/lib/email';
import { createWelcomeNotification, createAdminNewClientNotification } from '@/lib/notifications';
import { checkRateLimit, getIp } from '@/lib/ratelimit';

export async function POST(request: Request) {
  // Rate limit: max 5 registrations per IP per 10 minutes
  const ip = getIp(request);
  const rl = checkRateLimit(`register:${ip}`, 5, 10 * 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'RATE_LIMIT', message: 'Too many requests. Please try again later.' },
      { status: 429 }
    );
  }

  try {
    const { name, email, phone, password, language } = await request.json();

    if (!name || !email || !password) {
      return NextResponse.json({ error: 'MISSING_FIELDS', message: 'Required fields missing' }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'WEAK_PASSWORD', message: 'Password must be at least 8 characters' }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) {
      return NextResponse.json({ error: 'EMAIL_TAKEN', message: 'Email already in use' }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        phone: phone?.trim() || null,
        passwordHash,
        role: 'CLIENT',
        language: language ?? 'fr',
      },
    });

    // Create default loyalty grade (non-blocking)
    await prisma.loyaltyGrade.create({
      data: {
        clientId: user.id,
        grade: 'MEMBER',
        isOverride: false,
      },
    }).catch((e: unknown) => console.error('[REGISTER] loyaltyGrade create failed:', e));

    await logAction({
      userId: user.id,
      action: LOG_ACTIONS.USER_REGISTER,
      entityType: 'User',
      entityId: user.id,
      details: { email: user.email },
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://doguniverse.ma';
    const locale = language ?? 'fr';
    const loginUrl = `${appUrl}/${locale}/auth/login`;

    const { subject: verifySubject, html: verifyHtml } = getEmailTemplate(
      'welcome',
      { clientName: user.name, loginUrl },
      locale
    );

    const admins = await prisma.user.findMany({ where: { role: { in: ['ADMIN', 'SUPERADMIN'] } }, select: { id: true, email: true } });
    const adminUrl = `${appUrl}/fr/admin/clients`;
    const adminEmailData = { clientName: user.name, clientEmail: user.email, clientPhone: user.phone ?? '', adminUrl };

    const results = await Promise.allSettled([
      sendEmail({ to: user.email, subject: verifySubject, html: verifyHtml }),
      createWelcomeNotification(user.id, user.name),
      ...admins.flatMap(admin => {
        const { subject: s, html: h } = getEmailTemplate('admin_new_client', adminEmailData, 'fr');
        return [
          sendEmail({ to: admin.email, subject: s, html: h }),
          createAdminNewClientNotification(admin.id, user.id, user.name, user.email),
        ];
      }),
    ]);

    results.forEach((r, i) => {
      if (r.status === 'rejected') console.error(`[REGISTER] post-register task ${i} failed:`, r.reason);
    });

    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    }, { status: 201 });
  } catch (error) {
    console.error('Register error:', error);
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: 'An error occurred' }, { status: 500 });
  }
}
