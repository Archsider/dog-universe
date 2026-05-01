import { NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { prisma } from '@/lib/prisma';
import { logAction } from '@/lib/log';
import bcrypt from 'bcryptjs';
import { Redis } from '@upstash/redis';

// Supported operations:
// - delete_cancelled : delete all CANCELLED bookings + their invoices
// - delete_completed : delete all COMPLETED bookings + their invoices
// - delete_pending_old : delete PENDING bookings older than 30 days

const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW = 3600; // seconds

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

async function checkDangerRateLimit(userId: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return true; // fail-open: no Redis → allow
  try {
    const key = `danger:attempts:${userId}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, RATE_LIMIT_WINDOW);
    return count <= RATE_LIMIT_MAX;
  } catch {
    return true; // fail-open
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'SUPERADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const { operation, confirmPassword, confirm } = body as {
    operation?: string;
    confirmPassword?: string;
    confirm?: string;
  };

  // Step-up: confirm string must equal 'DELETE_ALL'
  if (confirm !== 'DELETE_ALL') {
    return NextResponse.json({ error: 'CONFIRMATION_REQUIRED' }, { status: 400 });
  }

  // Step-up: password verification
  if (!confirmPassword || typeof confirmPassword !== 'string') {
    return NextResponse.json({ error: 'PASSWORD_REQUIRED' }, { status: 400 });
  }

  // Rate limit: max 3 attempts/hour per userId
  const allowed = await checkDangerRateLimit(session.user.id);
  if (!allowed) {
    await logAction({
      userId: session.user.id,
      action: 'DANGER_STEPUP_FAILED',
      entityType: 'User',
      entityId: session.user.id,
      details: { reason: 'RATE_LIMITED' },
    });
    return NextResponse.json({ error: 'TOO_MANY_ATTEMPTS' }, { status: 429 });
  }

  const admin = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { passwordHash: true },
  });
  const valid = admin ? await bcrypt.compare(confirmPassword, admin.passwordHash) : false;
  if (!valid) {
    await logAction({
      userId: session.user.id,
      action: 'DANGER_STEPUP_FAILED',
      entityType: 'User',
      entityId: session.user.id,
      details: { reason: 'WRONG_PASSWORD' },
    });
    return NextResponse.json({ error: 'INVALID_PASSWORD' }, { status: 403 });
  }

  const validOps = ['delete_cancelled', 'delete_completed', 'delete_pending_old'];
  if (!operation || !validOps.includes(operation)) {
    return NextResponse.json({ error: 'Invalid operation' }, { status: 400 });
  }

  let statusFilter: string | undefined;
  let dateFilter: Date | undefined;

  if (operation === 'delete_cancelled') {
    statusFilter = 'CANCELLED';
  } else if (operation === 'delete_completed') {
    statusFilter = 'COMPLETED';
  } else if (operation === 'delete_pending_old') {
    statusFilter = 'PENDING';
    dateFilter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  }

  const where: Record<string, unknown> = { status: statusFilter };
  if (dateFilter) where.createdAt = { lt: dateFilter };

  const bookings = await prisma.booking.findMany({ where, select: { id: true } });
  const bookingIds = bookings.map((b) => b.id);

  if (bookingIds.length === 0) {
    return NextResponse.json({ deleted: 0 });
  }

  await logAction({
    userId: session.user.id,
    action: 'DANGER_DELETE_INITIATED',
    entityType: 'Booking',
    details: { operation, count: bookingIds.length },
  });

  await prisma.$transaction(async (tx) => {
    const invoices = await tx.invoice.findMany({
      where: { bookingId: { in: bookingIds } },
      select: { id: true },
    });
    const invoiceIds = invoices.map((i) => i.id);

    await tx.invoiceItem.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await tx.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
    // BookingPets, BoardingDetail, TaxiDetail cascade from Booking
    await tx.booking.deleteMany({ where: { id: { in: bookingIds } } });
  });

  await logAction({
    userId: session.user.id,
    action: 'DANGER_DELETE_COMPLETED',
    entityType: 'Booking',
    details: { operation, deletedCount: bookingIds.length },
  });

  return NextResponse.json({ deleted: bookingIds.length });
}
