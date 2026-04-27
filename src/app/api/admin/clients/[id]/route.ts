import { NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { logAction } from '@/lib/log';
import { calculateSuggestedGrade } from '@/lib/loyalty';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  const client = await prisma.user.findUnique({
    where: { id, role: 'CLIENT' },
    include: {
      pets: {
        select: {
          id: true, ownerId: true, name: true, species: true, breed: true,
          dateOfBirth: true, gender: true, photoUrl: true, weight: true,
          createdAt: true, updatedAt: true,
          vaccinations: { select: { id: true, vaccineType: true, date: true }, orderBy: { date: 'desc' } },
          documents: { select: { id: true, name: true, fileUrl: true, fileType: true, uploadedAt: true }, orderBy: { uploadedAt: 'desc' } },
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
      },
      invoices: {
        include: { items: true },
        orderBy: { issuedAt: 'desc' },
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

  const { passwordHash: _pw, ...safeClient } = client;
  return NextResponse.json({
    ...safeClient,
    totalRevenue,
    adminNotes,
  });
}

export async function PATCH(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();

  const updateData: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim().slice(0, 255);
    if (!name) return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
    updateData.name = name;
  }
  if (body.phone !== undefined) {
    updateData.phone = body.phone ? String(body.phone).trim().slice(0, 20) : null;
  }
  if (body.email !== undefined) {
    const email = String(body.email).trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
    }
    const existing = await prisma.user.findFirst({ where: { email, NOT: { id } } });
    if (existing) return NextResponse.json({ error: 'EMAIL_TAKEN' }, { status: 409 });
    updateData.email = email;
  }

  // --- Historical baseline fields (admin only) ---
  let recalculateLoyalty = false;
  if (body.historicalStays !== undefined) {
    const val = Math.max(0, Math.round(Number(body.historicalStays)));
    if (!isNaN(val)) { updateData.historicalStays = val; recalculateLoyalty = true; }
  }
  if (body.historicalSpendMAD !== undefined) {
    const val = Math.max(0, Number(body.historicalSpendMAD));
    if (!isNaN(val)) { updateData.historicalSpendMAD = val; recalculateLoyalty = true; }
  }
  if (body.historicalNote !== undefined) {
    updateData.historicalNote = body.historicalNote ? String(body.historicalNote).trim().slice(0, 500) : null;
  }

  await prisma.user.update({ where: { id }, data: updateData });

  // Recalculate loyalty grade when historical data changes (unless manually overridden)
  if (recalculateLoyalty) {
    const currentGrade = await prisma.loyaltyGrade.findUnique({ where: { clientId: id } });
    if (!currentGrade?.isOverride) {
      const user = await prisma.user.findUnique({ where: { id }, select: { historicalStays: true, historicalSpendMAD: true } });
      const [totalPaid, completedStays] = await Promise.all([
        prisma.invoice.aggregate({ where: { clientId: id, status: 'PAID' }, _sum: { amount: true } }),
        prisma.booking.count({ where: { clientId: id, status: 'COMPLETED', deletedAt: null } }),
      ]);
      const totalStays = completedStays + (user?.historicalStays ?? 0);
      const totalRevenue = (totalPaid._sum.amount ?? 0) + (user?.historicalSpendMAD ?? 0);
      const suggestedGrade = calculateSuggestedGrade(totalStays, totalRevenue);
      await prisma.loyaltyGrade.upsert({
        where: { clientId: id },
        update: { grade: suggestedGrade },
        create: { clientId: id, grade: suggestedGrade },
      });
    }
  }

  return NextResponse.json({ message: 'ok' });
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  // Destructive: SUPERADMIN only
  if (!session?.user || session.user.role !== 'SUPERADMIN') {
    return NextResponse.json({ error: 'Forbidden — SUPERADMIN only' }, { status: 403 });
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
