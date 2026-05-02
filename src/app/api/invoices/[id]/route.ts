import { NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { prisma } from '@/lib/prisma';
import { allocatePayments } from '@/lib/payments';
import { logAction, LOG_ACTIONS } from '@/lib/log';

type Params = { params: Promise<{ id: string }> };

const FULL_INCLUDE = {
  client: { select: { id: true, name: true, email: true, phone: true } },
  booking: {
    include: {
      bookingPets: { include: { pet: { select: { name: true, species: true, breed: true } } } },
      boardingDetail: true,
      taxiDetail: true,
    },
  },
  items: { orderBy: { id: 'asc' } as const },
  payments: { orderBy: { paymentDate: 'asc' } as const },
};

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true, email: true, phone: true } },
      booking: {
        include: {
          bookingPets: { include: { pet: { select: { name: true, species: true, breed: true } } } },
          boardingDetail: true,
          taxiDetail: true,
        },
      },
      items: true,
      payments: { orderBy: { paymentDate: 'asc' } },
    },
  });

  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.user.role === 'CLIENT' && invoice.clientId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json(invoice);
}

export async function PATCH(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: { client: { select: { role: true } } },
  });
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // P0: cross-role guard — an ADMIN must not mutate invoices belonging to a SUPERADMIN
  if (session.user.role === 'ADMIN' && invoice.client.role !== 'CLIENT') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Optimistic concurrency: when caller provides `version`, refuse to apply
  // the patch if the row was modified since they read it. Backward compatible
  // — callers that don't send `version` skip the check (legacy behavior).
  const expectedVersion = typeof body.version === 'number' ? body.version : null;
  if (expectedVersion !== null && expectedVersion !== invoice.version) {
    return NextResponse.json(
      { error: 'VERSION_CONFLICT', message: 'This invoice was modified by someone else. Please refresh.', currentVersion: invoice.version },
      { status: 409 },
    );
  }

  // ── Full edit (items array provided) ──────────────────────────────────────
  if (Array.isArray(body.items)) {
    const { items, issuedAt, notes, status, clientDisplayName, clientDisplayPhone, clientDisplayEmail } = body;

    const VALID_STATUSES = ['PENDING', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'];

    // Validate items
    if (items.length === 0) {
      return NextResponse.json({ error: 'INVALID_ITEMS' }, { status: 400 });
    }
    const VALID_CATEGORIES = ['BOARDING', 'PET_TAXI', 'GROOMING', 'PRODUCT', 'OTHER'] as const;
    for (const item of items as { description: unknown; quantity: unknown; unitPrice: unknown; category?: unknown }[]) {
      if (typeof item.description !== 'string' || !item.description.trim()) {
        return NextResponse.json({ error: 'INVALID_ITEM_DESCRIPTION' }, { status: 400 });
      }
      if (typeof item.quantity !== 'number' || item.quantity <= 0 || !Number.isInteger(item.quantity)) {
        return NextResponse.json({ error: 'INVALID_ITEM_QUANTITY' }, { status: 400 });
      }
      if (typeof item.unitPrice !== 'number' || item.unitPrice < 0) {
        return NextResponse.json({ error: 'INVALID_ITEM_PRICE' }, { status: 400 });
      }
      if (item.category !== undefined && (typeof item.category !== 'string' || !VALID_CATEGORIES.includes(item.category as typeof VALID_CATEGORIES[number]))) {
        return NextResponse.json({ error: 'INVALID_ITEM_CATEGORY' }, { status: 400 });
      }
    }

    type ItemCategory = typeof VALID_CATEGORIES[number];
    interface ValidItem { description: string; quantity: number; unitPrice: number; category?: ItemCategory }
    const validItems = items as ValidItem[];
    const newAmount = validItems.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
    if (newAmount <= 0) return NextResponse.json({ error: 'INVALID_AMOUNT' }, { status: 400 });

    // Validate status
    if (status !== undefined && !VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: 'INVALID_STATUS' }, { status: 400 });
    }

    // Validate clientDisplayName if provided
    if (clientDisplayName !== undefined && (typeof clientDisplayName !== 'string' || !clientDisplayName.trim())) {
      return NextResponse.json({ error: 'INVALID_CLIENT_NAME' }, { status: 400 });
    }

    // Validate issuedAt
    let resolvedIssuedAt: Date | undefined;
    if (issuedAt) {
      const d = new Date(issuedAt);
      if (isNaN(d.getTime())) return NextResponse.json({ error: 'INVALID_ISSUED_AT' }, { status: 400 });
      resolvedIssuedAt = d;
    }

    const isCancel = status === 'CANCELLED';

    await prisma.$transaction(async (tx) => {
      // 1. Replace items
      await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
      await tx.invoiceItem.createMany({
        data: validItems.map(it => ({
          invoiceId: id,
          description: it.description.trim(),
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          total: it.quantity * it.unitPrice,
          category: (it.category ?? 'OTHER') as ItemCategory,
        })),
      });

      // 2. Update invoice metadata
      //    status: CANCELLED → set it; otherwise PENDING (allocatePayments derives real status)
      //    paidAt: null → allocatePayments will set it on first PAID transition
      //    clientDisplayName/clientDisplayPhone/clientDisplayEmail: billing snapshot independent of User
      await tx.invoice.update({
        where: { id },
        data: {
          amount: newAmount,
          version: { increment: 1 },
          ...(resolvedIssuedAt && { issuedAt: resolvedIssuedAt }),
          notes: typeof notes === 'string' ? notes.trim() || null : invoice.notes,
          status: isCancel ? 'CANCELLED' : 'PENDING',
          paidAt: null,
          ...(typeof clientDisplayName === 'string' && clientDisplayName.trim() && {
            clientDisplayName: clientDisplayName.trim().slice(0, 100),
          }),
          clientDisplayPhone: typeof clientDisplayPhone === 'string' && clientDisplayPhone.trim()
            ? clientDisplayPhone.trim().slice(0, 30)
            : null,
          clientDisplayEmail: typeof clientDisplayEmail === 'string' && clientDisplayEmail.trim()
            ? clientDisplayEmail.trim().slice(0, 254)
            : null,
        },
      });
    });

    // Recompute allocation (skipped if CANCELLED — allocatePayments ignores CANCELLED)
    if (!isCancel) {
      await allocatePayments(id);
    }

    // P0-4: audit log on full invoice edit
    await logAction({
      userId: session.user.id,
      action: LOG_ACTIONS.INVOICE_UPDATED,
      entityType: 'Invoice',
      entityId: id,
      details: { fromStatus: invoice.status, toStatus: isCancel ? 'CANCELLED' : status ?? invoice.status, amount: newAmount },
    });

    const updated = await prisma.invoice.findUnique({ where: { id }, include: FULL_INCLUDE });
    return NextResponse.json(updated);
  }

  // ── Legacy: notes-only / CANCELLED status ─────────────────────────────────
  const updateData: Record<string, unknown> = {};

  if (body.notes !== undefined) {
    updateData.notes = typeof body.notes === 'string' ? body.notes.trim() || null : null;
  }

  if (body.status === 'CANCELLED') {
    updateData.status = 'CANCELLED';
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'NOTHING_TO_UPDATE' }, { status: 400 });
  }

  updateData.version = { increment: 1 };
  const updated = await prisma.invoice.update({ where: { id }, data: updateData });

  // P0-4: audit log on legacy status/notes update
  await logAction({
    userId: session.user.id,
    action: LOG_ACTIONS.INVOICE_UPDATED,
    entityType: 'Invoice',
    entityId: id,
    details: { fromStatus: invoice.status, toStatus: (updateData.status as string | undefined) ?? invoice.status },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: { client: { select: { role: true } } },
  });
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // P0: cross-role guard — an ADMIN must not delete invoices belonging to a SUPERADMIN
  if (session.user.role === 'ADMIN' && invoice.client.role !== 'CLIENT') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // onDelete: Cascade on InvoiceItem and Payment handles related records
  await prisma.invoice.delete({ where: { id } });

  // P0-4: audit log on invoice deletion
  await logAction({
    userId: session.user.id,
    action: LOG_ACTIONS.INVOICE_DELETED,
    entityType: 'Invoice',
    entityId: id,
    details: { status: invoice.status, amount: invoice.amount, clientId: invoice.clientId },
  });

  return new NextResponse(null, { status: 204 });
}
