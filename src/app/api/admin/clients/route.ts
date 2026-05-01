import { NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { logAction, LOG_ACTIONS } from '@/lib/log';
import { decodeCursor, encodeCursor, parseLimit } from '@/lib/pagination';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search') ?? '';
  const grade = searchParams.get('grade') ?? '';
  const limit = parseLimit(searchParams.get('limit'));
  const cursorRaw = searchParams.get('cursor');
  const decoded = cursorRaw ? decodeCursor(cursorRaw) : null;
  if (cursorRaw && !decoded) {
    return NextResponse.json({ error: 'INVALID_CURSOR' }, { status: 400 });
  }

  const where: Record<string, unknown> = { role: 'CLIENT', deletedAt: null }; // soft-delete: required — no global extension (Edge Runtime incompatible)

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }

  const VALID_GRADES = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM'];
  if (grade && VALID_GRADES.includes(grade)) {
    where.loyaltyGrade = { grade };
  }

  if (decoded) {
    where.AND = [
      {
        OR: [
          { createdAt: { lt: decoded.createdAt } },
          { createdAt: decoded.createdAt, id: { lt: decoded.id } },
        ],
      },
    ];
  }

  const items = await prisma.user.findMany({
    where,
    include: {
      pets: { where: { deletedAt: null }, select: { id: true, name: true } }, // soft-delete: required — no global extension (Edge Runtime incompatible)
      loyaltyGrade: true,
      _count: {
        select: { bookings: true },
      },
      invoices: {
        where: { status: 'PAID' },
        select: { amount: true },
      },
      bookings: {
        where: { status: 'COMPLETED' },
        orderBy: { startDate: 'desc' },
        take: 1,
        select: { startDate: true, endDate: true },
      },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  });

  const hasMore = items.length > limit;
  const page = hasMore ? items.slice(0, limit) : items;
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? encodeCursor(last.createdAt, last.id) : null;

  const data = page.map((client) => {
    // Explicitly exclude passwordHash via destructuring (safer than `undefined` override)
    const { passwordHash: _pw, ...safeClient } = client;
    return {
      ...safeClient,
      totalRevenue: client.invoices.reduce((sum, inv) => sum + inv.amount, 0),
      lastStay: client.bookings[0] ?? null,
      totalStays: client._count.bookings,
    };
  });

  return NextResponse.json({ data, nextCursor, hasMore });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const { password, language } = body;

  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 255) : '';
  const email = typeof body.email === 'string' ? body.email.toLowerCase().trim().slice(0, 255) : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim().slice(0, 20) : null;

  if (!name || !email || !password) {
    return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 });
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return NextResponse.json({ error: 'WEAK_PASSWORD' }, { status: 400 });
  }

  const existing = await prisma.user.findFirst({ where: { email, deletedAt: null } }); // soft-delete: required — no global extension (Edge Runtime incompatible)
  if (existing) {
    return NextResponse.json({ error: 'EMAIL_TAKEN' }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      name,
      email,
      phone: phone || null,
      passwordHash,
      role: 'CLIENT',
      language: language ?? 'fr',
    },
  });

  await prisma.loyaltyGrade.create({
    data: { clientId: user.id, grade: 'BRONZE', isOverride: false },
  });

  await logAction({
    userId: session.user.id,
    action: LOG_ACTIONS.USER_REGISTER,
    entityType: 'User',
    entityId: user.id,
    details: { email: user.email, createdByAdmin: true },
  });

  return NextResponse.json({ id: user.id, email: user.email, name: user.name }, { status: 201 });
}
