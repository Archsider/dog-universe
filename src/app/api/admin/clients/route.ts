import { NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { logAction, LOG_ACTIONS } from '@/lib/log';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search') ?? '';
  const grade = searchParams.get('grade') ?? '';
  const page = parseInt(searchParams.get('page') ?? '1');
  const limit = parseInt(searchParams.get('limit') ?? '50');

  const where: Record<string, unknown> = { role: 'CLIENT' };

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }

  if (grade) {
    where.loyaltyGrade = { grade };
  }

  const [clients, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: {
        pets: { select: { id: true, name: true } },
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
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  const clientsWithRevenue = clients.map((client) => ({
    ...client,
    totalRevenue: client.invoices.reduce((sum, inv) => sum + inv.amount, 0),
    lastStay: client.bookings[0] ?? null,
    totalStays: client._count.bookings,
    passwordHash: undefined, // never expose
  }));

  return NextResponse.json({ clients: clientsWithRevenue, total, page, limit });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { name, email, phone, password, language } = await request.json();

  if (!name || !email || !password) {
    return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'WEAK_PASSWORD' }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) {
    return NextResponse.json({ error: 'EMAIL_TAKEN' }, { status: 409 });
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
