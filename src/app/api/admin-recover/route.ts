/**
 * TEMPORARY admin password recovery endpoint.
 * DELETE THIS FILE after use.
 * Protected by CRON_SECRET header.
 */
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';

const ADMIN_EMAIL = 'admin@doguniverse.ma';
const NEW_PASSWORD = 'DogAdmin2024!';

export async function POST(request: Request) {
  const secret = request.headers.get('x-recover-secret');
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const hash = await bcrypt.hash(NEW_PASSWORD, 12);

    const existing = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });

    if (existing) {
      await prisma.user.update({
        where: { email: ADMIN_EMAIL },
        data: { passwordHash: hash },
      });
      return NextResponse.json({ ok: true, action: 'password_reset', email: ADMIN_EMAIL });
    } else {
      await prisma.user.create({
        data: {
          name: 'Admin',
          email: ADMIN_EMAIL,
          passwordHash: hash,
          role: 'ADMIN',
          language: 'fr',
        },
      });
      return NextResponse.json({ ok: true, action: 'user_created', email: ADMIN_EMAIL });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
