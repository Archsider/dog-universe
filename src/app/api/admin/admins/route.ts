import { NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { logAction } from '@/lib/log';

// Only SUPERADMIN can manage admins
function isSuperAdmin(role?: string) {
  return role === 'SUPERADMIN';
}

export async function GET() {
  const session = await auth();
  if (!session?.user || !isSuperAdmin(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admins = await prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'SUPERADMIN'] } },
    select: { id: true, name: true, email: true, role: true, createdAt: true, language: true },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json({ admins });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !isSuperAdmin(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { name, email, password, language } = await request.json();

  if (!name || !email || !password) {
    return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'WEAK_PASSWORD' }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (existing) {
    // If already exists and is CLIENT, promote to ADMIN
    if (existing.role === 'CLIENT') {
      const promoted = await prisma.user.update({
        where: { id: existing.id },
        data: { role: 'ADMIN' },
        select: { id: true, name: true, email: true, role: true },
      });
      await logAction({
        userId: session.user.id,
        action: 'ADMIN_PROMOTED',
        entityType: 'User',
        entityId: existing.id,
        details: { email: existing.email, promotedBy: session.user.email },
      });
      return NextResponse.json(promoted, { status: 200 });
    }
    return NextResponse.json({ error: 'EMAIL_TAKEN' }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: {
      name: name.trim(),
      email: email.toLowerCase().trim(),
      passwordHash,
      role: 'ADMIN',
      language: language ?? 'fr',
    },
    select: { id: true, name: true, email: true, role: true },
  });

  await logAction({
    userId: session.user.id,
    action: 'ADMIN_CREATED',
    entityType: 'User',
    entityId: user.id,
    details: { email: user.email, createdBy: session.user.email },
  });

  return NextResponse.json(user, { status: 201 });
}
