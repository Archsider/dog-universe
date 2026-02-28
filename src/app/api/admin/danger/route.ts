import { NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { prisma } from '@/lib/prisma';
import { logAction } from '@/lib/log';

// Supported operations:
// - delete_cancelled : delete all CANCELLED bookings + their invoices
// - delete_completed : delete all COMPLETED bookings + their invoices
// - delete_pending_old : delete PENDING bookings older than 30 days

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { operation } = await request.json();

  const validOps = ['delete_cancelled', 'delete_completed', 'delete_pending_old'];
  if (!validOps.includes(operation)) {
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
    action: 'DANGER_ZONE',
    entityType: 'Booking',
    details: { operation, count: bookingIds.length },
  });

  return NextResponse.json({ deleted: bookingIds.length });
}
