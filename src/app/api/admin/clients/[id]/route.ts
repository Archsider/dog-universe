import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAction } from '@/lib/log';
import { calculateSuggestedGrade } from '@/lib/loyalty';
import { invalidateLoyaltyCache, computeClientCashCollected } from '@/lib/loyalty-server';
import { notDeleted } from '@/lib/prisma-soft';
import { withSpan } from '@/lib/observability';
import { requireRole } from '@/lib/auth-guards';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const guard = await requireRole(['ADMIN', 'SUPERADMIN']);
  if (guard.error) return guard.error;

  const { id } = await params;

  const client = await prisma.user.findFirst({
    where: notDeleted({ id, role: 'CLIENT' }),
    include: {
      pets: {
        where: notDeleted(),
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
    .reduce((sum, i) => sum + Number(i.amount), 0);

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
  const guard = await requireRole(['ADMIN', 'SUPERADMIN']);
  if (guard.error) return guard.error;
  const { session } = guard;

  const { id } = await params;
  const body = await request.json();

  // Privilege escalation guard: this endpoint may only mutate CLIENT users.
  // Without this, an ADMIN could PATCH a SUPERADMIN's email/phone/name.
  const target = await prisma.user.findFirst({ where: notDeleted({ id }), select: { role: true } });
  if (!target || target.role !== 'CLIENT') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const updateData: Record<string, unknown> = {};

  // firstName / lastName — sync `name` whenever either changes.
  let nextFirstName: string | undefined;
  let nextLastName: string | undefined;
  if (body.firstName !== undefined) {
    const fn = String(body.firstName).trim().slice(0, 120);
    if (fn.length < 2) return NextResponse.json({ error: 'INVALID_VALUE', field: 'firstName' }, { status: 400 });
    updateData.firstName = fn;
    nextFirstName = fn;
  }
  if (body.lastName !== undefined) {
    const ln = String(body.lastName).trim().slice(0, 120);
    if (ln.length < 2) return NextResponse.json({ error: 'INVALID_VALUE', field: 'lastName' }, { status: 400 });
    updateData.lastName = ln;
    nextLastName = ln;
  }
  if (nextFirstName !== undefined || nextLastName !== undefined) {
    const current = await prisma.user.findUnique({
      where: { id },
      select: { firstName: true, lastName: true },
    });
    const fn = nextFirstName ?? current?.firstName ?? '';
    const ln = nextLastName  ?? current?.lastName  ?? '';
    updateData.name = `${fn} ${ln}`.trim();
  }
  if (body.phone !== undefined) {
    updateData.phone = body.phone ? String(body.phone).trim().slice(0, 20) : null;
  }
  if (body.email !== undefined) {
    const email = String(body.email).trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
    }
    const existing = await prisma.user.findFirst({ where: notDeleted({ email, NOT: { id } }) });
    if (existing) return NextResponse.json({ error: 'EMAIL_TAKEN' }, { status: 409 });
    updateData.email = email;
  }

  // --- Historical baseline fields (admin only) ---
  let recalculateLoyalty = false;
  if (body.historicalStays !== undefined) {
    const raw = Number(body.historicalStays);
    if (!Number.isFinite(raw) || raw < 0 || raw > 100_000) {
      return NextResponse.json({ error: 'INVALID_VALUE', field: 'historicalStays' }, { status: 400 });
    }
    updateData.historicalStays = Math.round(raw);
    recalculateLoyalty = true;
  }
  if (body.historicalSpendMAD !== undefined) {
    const raw = Number(body.historicalSpendMAD);
    if (!Number.isFinite(raw) || raw < 0 || raw > 100_000_000) {
      return NextResponse.json({ error: 'INVALID_VALUE', field: 'historicalSpendMAD' }, { status: 400 });
    }
    updateData.historicalSpendMAD = raw;
    recalculateLoyalty = true;
  }
  if (body.historicalNote !== undefined) {
    updateData.historicalNote = body.historicalNote ? String(body.historicalNote).trim().slice(0, 500) : null;
  }

  await withSpan(
    'api.admin.clients.update',
    { clientId: id, actorId: session.user.id, fields: Object.keys(updateData).join(',') },
    () => prisma.user.update({ where: { id }, data: updateData }),
  );

  // Recalculate loyalty grade when historical data changes (unless manually overridden)
  if (recalculateLoyalty) {
    const currentGrade = await prisma.loyaltyGrade.findUnique({ where: { clientId: id } });
    if (!currentGrade?.isOverride) {
      const user = await prisma.user.findFirst({ where: notDeleted({ id }), select: { historicalStays: true, historicalSpendMAD: true } });
      const [totalRevenue, completedStays] = await Promise.all([
        // Cash basis (Sémantique B) — collected payments, not billed PAID totals.
        computeClientCashCollected(prisma, id, user?.historicalSpendMAD),
        prisma.booking.count({ where: notDeleted({ clientId: id, status: 'COMPLETED' }) }),
      ]);
      const totalStays = completedStays + (user?.historicalStays ?? 0);
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
  // Destructive: SUPERADMIN only
  const guard = await requireRole(['SUPERADMIN']);
  if (guard.error) return guard.error;
  const { session } = guard;

  const { id } = await params;

  const client = await prisma.user.findFirst({ where: notDeleted({ id, role: 'CLIENT' }) });
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const now = new Date();

  await withSpan(
    'api.admin.clients.softDelete',
    { clientId: id, actorId: session.user.id },
    () =>
      prisma.$transaction(async (tx) => {
        // Soft-delete all active pets (preserve history of past bookings)
        await tx.pet.updateMany({
          where: notDeleted({ ownerId: id }),
          data: { deletedAt: now },
        });

        // Soft-delete all active bookings
        await tx.booking.updateMany({
          where: notDeleted({ clientId: id }),
          data: { deletedAt: now },
        });

        // Soft-delete the User row (preserves FK integrity on Invoice/ActionLog)
        await tx.user.update({ where: { id }, data: { deletedAt: now } });
      }),
  );

  await logAction({
    userId: session.user.id,
    action: 'CLIENT_DELETED',
    entityType: 'User',
    entityId: id,
    details: { name: client.name, email: client.email },
  });

  return NextResponse.json({ message: 'deleted' });
}
