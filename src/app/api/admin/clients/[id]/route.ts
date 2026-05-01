import { NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { logAction } from '@/lib/log';
import { calculateSuggestedGrade } from '@/lib/loyalty';
import { invalidateLoyaltyCache } from '@/lib/loyalty-server';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  const client = await prisma.user.findFirst({
    where: { id, role: 'CLIENT', deletedAt: null }, // soft-delete: required — no global extension (Edge Runtime incompatible)
    include: {
      pets: {
        where: { deletedAt: null }, // soft-delete: required — no global extension (Edge Runtime incompatible)
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
          bookingPets: { select: { pet: { select: { id: true, name: true, species: true, photoUrl: true } } } },
          boardingDetail: true,
          taxiDetail: true,
          invoice: { select: { id: true, invoiceNumber: true, status: true, amount: true } },
        },
        orderBy: { startDate: 'desc' },
        take: 100,
      },
      invoices: {
        include: { items: { select: { id: true, description: true, quantity: true, unitPrice: true, total: true, category: true } } },
        orderBy: { issuedAt: 'desc' },
        take: 200,
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
    take: 100,
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

  // Privilege escalation guard: this endpoint may only mutate CLIENT users.
  // Without this, an ADMIN could PATCH a SUPERADMIN's email/phone/name.
  const target = await prisma.user.findFirst({ where: { id, deletedAt: null }, select: { role: true } }); // soft-delete: required — no global extension (Edge Runtime incompatible)
  if (!target || target.role !== 'CLIENT') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

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
    const existing = await prisma.user.findFirst({ where: { email, NOT: { id }, deletedAt: null } }); // soft-delete: required — no global extension (Edge Runtime incompatible)
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
      const user = await prisma.user.findFirst({ where: { id, deletedAt: null }, select: { historicalStays: true, historicalSpendMAD: true } }); // soft-delete: required — no global extension (Edge Runtime incompatible)
      const [totalPaid, completedStays] = await Promise.all([
        prisma.invoice.aggregate({ where: { clientId: id, status: 'PAID' }, _sum: { amount: true } }),
        prisma.booking.count({ where: { clientId: id, status: 'COMPLETED', deletedAt: null } }), // soft-delete: required — no global extension (Edge Runtime incompatible)
      ]);
      const totalStays = completedStays + (user?.historicalStays ?? 0);
      const totalRevenue = (totalPaid._sum.amount ?? 0) + (user?.historicalSpendMAD ?? 0);
      const suggestedGrade = calculateSuggestedGrade(totalStays, totalRevenue);
      await prisma.loyaltyGrade.upsert({
        where: { clientId: id },
        update: { grade: suggestedGrade },
        create: { clientId: id, grade: suggestedGrade },
      });
      await invalidateLoyaltyCache(id);
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

  const client = await prisma.user.findFirst({ where: { id, role: 'CLIENT', deletedAt: null } }); // soft-delete: required — no global extension (Edge Runtime incompatible)
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    // Soft-delete all active pets (preserve history of past bookings)
    await tx.pet.updateMany({
      where: { ownerId: id, deletedAt: null },
      data: { deletedAt: now },
    });

    // Soft-delete all active bookings
    await tx.booking.updateMany({
      where: { clientId: id, deletedAt: null },
      data: { deletedAt: now },
    });

    // Soft-delete the User row (preserves FK integrity on Invoice/ActionLog)
    await tx.user.update({ where: { id }, data: { deletedAt: now } });
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
