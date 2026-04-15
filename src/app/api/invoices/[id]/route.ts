import { NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { prisma } from '@/lib/prisma';
import { allocatePayments } from '@/lib/payments';

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

  const invoice = await prisma.invoice.findUnique({ where: { id } });
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // ── Full edit (items array provided) ──────────────────────────────────────
  if (Array.isArray(body.items)) {
    const { items, issuedAt, notes, status, paidAmount, paymentMethod, clientName, clientPhone } = body;

    const VALID_STATUSES = ['PENDING', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'];
    const VALID_PAYMENT_METHODS = ['CASH', 'CARD', 'CHECK', 'TRANSFER'];

    // Validate items
    if (items.length === 0) {
      return NextResponse.json({ error: 'INVALID_ITEMS' }, { status: 400 });
    }
    for (const item of items as { description: unknown; quantity: unknown; unitPrice: unknown }[]) {
      if (typeof item.description !== 'string' || !item.description.trim()) {
        return NextResponse.json({ error: 'INVALID_ITEM_DESCRIPTION' }, { status: 400 });
      }
      if (typeof item.quantity !== 'number' || item.quantity <= 0 || !Number.isInteger(item.quantity)) {
        return NextResponse.json({ error: 'INVALID_ITEM_QUANTITY' }, { status: 400 });
      }
      if (typeof item.unitPrice !== 'number' || item.unitPrice < 0) {
        return NextResponse.json({ error: 'INVALID_ITEM_PRICE' }, { status: 400 });
      }
    }

    interface ValidItem { description: string; quantity: number; unitPrice: number }
    const validItems = items as ValidItem[];
    const newAmount = validItems.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
    if (newAmount <= 0) return NextResponse.json({ error: 'INVALID_AMOUNT' }, { status: 400 });

    // Validate status
    if (status !== undefined && !VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: 'INVALID_STATUS' }, { status: 400 });
    }

    // Validate clientName if provided
    if (clientName !== undefined && (typeof clientName !== 'string' || !clientName.trim())) {
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
    const parsedPaid = typeof paidAmount === 'number' ? paidAmount : parseFloat(String(paidAmount ?? '0'));
    const safePaidAmount = isNaN(parsedPaid) || parsedPaid < 0 ? 0 : parsedPaid;

    // Validate paymentMethod when paid amount > 0 and not cancelling
    if (!isCancel && safePaidAmount > 0) {
      if (!paymentMethod || !VALID_PAYMENT_METHODS.includes(paymentMethod)) {
        return NextResponse.json({ error: 'INVALID_PAYMENT_METHOD' }, { status: 400 });
      }
    }

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
        })),
      });

      // 2. Update invoice metadata
      //    status: CANCELLED → set it; otherwise PENDING (allocatePayments derives real status)
      //    paidAt: null → allocatePayments will set it on first PAID transition
      await tx.invoice.update({
        where: { id },
        data: {
          amount: newAmount,
          ...(resolvedIssuedAt && { issuedAt: resolvedIssuedAt }),
          notes: typeof notes === 'string' ? notes.trim() || null : invoice.notes,
          status: isCancel ? 'CANCELLED' : 'PENDING',
          paidAt: null,
        },
      });

      // 3. Reset payments (only when not cancelling)
      if (!isCancel) {
        await tx.payment.deleteMany({ where: { invoiceId: id } });
        if (safePaidAmount > 0 && paymentMethod && VALID_PAYMENT_METHODS.includes(paymentMethod)) {
          await tx.payment.create({
            data: {
              invoiceId: id,
              amount: safePaidAmount,
              paymentMethod,
              paymentDate: new Date(),
            },
          });
        }
      }

      // 4. Update client name/phone if provided
      if (typeof clientName === 'string' && clientName.trim()) {
        await tx.user.update({
          where: { id: invoice.clientId },
          data: {
            name: clientName.trim().slice(0, 100),
            phone: typeof clientPhone === 'string' && clientPhone.trim()
              ? clientPhone.trim().slice(0, 30)
              : null,
          },
        });
      }
    });

    // 4. Recompute allocation (skipped if CANCELLED — allocatePayments ignores CANCELLED)
    if (!isCancel) {
      await allocatePayments(id);
    }

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

  const updated = await prisma.invoice.update({ where: { id }, data: updateData });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  const invoice = await prisma.invoice.findUnique({ where: { id } });
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // onDelete: Cascade on InvoiceItem and Payment handles related records
  await prisma.invoice.delete({ where: { id } });

  return new NextResponse(null, { status: 204 });
}
