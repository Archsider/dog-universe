import { NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { logAction } from '@/lib/log';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPERADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  const client = await prisma.user.findUnique({
    where: { id, role: 'CLIENT' },
    include: {
      pets: {
        include: {
          vaccinations: { orderBy: { date: 'desc' }, take: 10 },
          documents: { orderBy: { uploadedAt: 'desc' }, take: 5 },
        },
      },
      loyaltyGrade: true,
      bookings: {
        include: {
          bookingPets: { include: { pet: true } },
          boardingDetail: true,
          taxiDetail: true,
          invoice: { select: { id: true, invoiceNumber: true, status: true, amount: true } },
        },
        orderBy: { startDate: 'desc' },
        take: 20,
      },
      invoices: {
        include: { items: true },
        orderBy: { issuedAt: 'desc' },
        take: 20,
      },
    },
  });

  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const totalRevenue = client.invoices
    .filter((i) => i.status === 'PAID')
    .reduce((sum, i) => sum + i.amount, 0);

  const adminNotes = await prisma.adminNote.findMany({
    where: { entityType: 'CLIENT', entityId: id },
    include: { author: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  });

  const { passwordHash: _, ...clientSafe } = client; // _ intentionally unused

  return NextResponse.json({
    ...clientSafe,
    totalRevenue,
    adminNotes,
  });
}

export async function PATCH(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPERADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();

  const updateData: Record<string, unknown> = {};
  if (body.name !== undefined) updateData.name = body.name;
  if (body.phone !== undefined) updateData.phone = body.phone;
  if (body.role !== undefined && ['CLIENT', 'ADMIN'].includes(body.role)) {
    if (body.role === 'ADMIN' && session.user.role !== 'SUPERADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    updateData.role = body.role;
  }

  await prisma.user.update({ where: { id }, data: updateData });

  return NextResponse.json({ message: 'ok' });
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user || !['ADMIN', 'SUPERADMIN'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  const client = await prisma.user.findUnique({ where: { id, role: 'CLIENT' } });
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    const bookings = await tx.booking.findMany({ where: { clientId: id }, select: { id: true } });
    const bookingIds = bookings.map((b) => b.id);

    const invoices = await tx.invoice.findMany({ where: { clientId: id }, select: { id: true } });
    const invoiceIds = invoices.map((i) => i.id);

    const pets = await tx.pet.findMany({ where: { ownerId: id }, select: { id: true } });
    const petIds = pets.map((p) => p.id);

    // Remove pet references from bookings first
    await tx.bookingPet.deleteMany({ where: { bookingId: { in: bookingIds } } });

    // Invoice items
    await tx.invoiceItem.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await tx.invoice.deleteMany({ where: { clientId: id } });

    // Booking details (also cascade, but explicit for safety)
    await tx.boardingDetail.deleteMany({ where: { bookingId: { in: bookingIds } } });
    await tx.taxiDetail.deleteMany({ where: { bookingId: { in: bookingIds } } });
    await tx.booking.deleteMany({ where: { clientId: id } });

    // Admin notes about this client and their pets
    await tx.adminNote.deleteMany({
      where: { OR: [{ entityType: 'CLIENT', entityId: id }, { entityType: 'PET', entityId: { in: petIds } }] },
    });

    // Pets (cascades vaccinations, documents)
    await tx.pet.deleteMany({ where: { ownerId: id } });

    // Action logs (no cascade)
    await tx.actionLog.deleteMany({ where: { userId: id } });

    // User (cascades loyaltyGrade, notifications, passwordResets)
    await tx.user.delete({ where: { id } });
  });

  await logAction({
    userId: session.user.id,
    action: 'CLIENT_DELETED',
    entityType: 'User',
    entityId: id,
    details: { name: client.name, email: client.email },
  });

  return NextResponse.json({ message: 'deleted' });
}
