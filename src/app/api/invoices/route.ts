import { NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { prisma } from '@/lib/prisma';
import { logAction, LOG_ACTIONS } from '@/lib/log';
import { createInvoiceNotification } from '@/lib/notifications';
import { sendEmail, getEmailTemplate } from '@/lib/email';
import { formatMAD } from '@/lib/utils';
import { allocatePayments } from '@/lib/payments';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const clientId = searchParams.get('clientId');

  const where: Record<string, unknown> = {};

  if (session.user.role === 'CLIENT') {
    where.clientId = session.user.id;
  } else if (clientId) {
    where.clientId = clientId;
  }

  const VALID_INVOICE_STATUSES = ['PENDING', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'];
  if (status && VALID_INVOICE_STATUSES.includes(status)) where.status = status;

  const invoices = await prisma.invoice.findMany({
    where,
    include: {
      client: { select: { id: true, name: true, email: true } },
      booking: {
        include: {
          bookingPets: { include: { pet: { select: { name: true } } } },
        },
      },
      items: true,
    },
    orderBy: { issuedAt: 'desc' },
  });

  return NextResponse.json(invoices);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { clientId, bookingId, items, notes, serviceType, issuedAt, markPaid, paymentMethod, paidAt } = body;

    if (!clientId || !items?.length) {
      return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 });
    }

    // Validate serviceType if provided
    const VALID_SERVICE_TYPES = ['BOARDING', 'PET_TAXI', 'GROOMING', 'PRODUCT_SALE'];
    if (serviceType && !VALID_SERVICE_TYPES.includes(serviceType)) {
      return NextResponse.json({ error: 'INVALID_SERVICE_TYPE' }, { status: 400 });
    }

    // Validate issuedAt if provided
    let resolvedIssuedAt: Date | undefined;
    if (issuedAt) {
      const d = new Date(issuedAt);
      if (isNaN(d.getTime())) {
        return NextResponse.json({ error: 'INVALID_ISSUED_AT' }, { status: 400 });
      }
      resolvedIssuedAt = d;
    }

    // Validate payment info if markPaid
    const VALID_PAYMENT_METHODS = ['CASH', 'CARD', 'CHECK', 'TRANSFER'];
    if (markPaid && paymentMethod && !VALID_PAYMENT_METHODS.includes(paymentMethod)) {
      return NextResponse.json({ error: 'INVALID_PAYMENT_METHOD' }, { status: 400 });
    }

    // Validate each item: amounts must be positive numbers
    const VALID_CATEGORIES = ['BOARDING', 'PET_TAXI', 'GROOMING', 'PRODUCT', 'OTHER'];
    for (const item of items as { description: string; quantity: number; unitPrice: number; total: number; category?: string }[]) {
      if (!item.description || typeof item.description !== 'string') {
        return NextResponse.json({ error: 'INVALID_ITEM_DESCRIPTION' }, { status: 400 });
      }
      if (typeof item.unitPrice !== 'number' || item.unitPrice < 0) {
        return NextResponse.json({ error: 'INVALID_ITEM_PRICE' }, { status: 400 });
      }
      if (typeof item.quantity !== 'number' || item.quantity <= 0) {
        return NextResponse.json({ error: 'INVALID_ITEM_QUANTITY' }, { status: 400 });
      }
      if (typeof item.total !== 'number' || item.total < 0) {
        return NextResponse.json({ error: 'INVALID_ITEM_TOTAL' }, { status: 400 });
      }
      if (item.category !== undefined && !VALID_CATEGORIES.includes(item.category)) {
        return NextResponse.json({ error: 'INVALID_ITEM_CATEGORY' }, { status: 400 });
      }
    }

    const client = await prisma.user.findUnique({ where: { id: clientId } });
    if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

    // Generate invoice number — retry on collision (race condition guard)
    const year = resolvedIssuedAt ? resolvedIssuedAt.getFullYear() : new Date().getFullYear();
    let invoiceNumber = '';
    for (let attempt = 0; attempt < 5; attempt++) {
      const count = await prisma.invoice.count();
      const candidate = `DU-${year}-${String(count + 1 + attempt).padStart(4, '0')}`;
      const exists = await prisma.invoice.findUnique({ where: { invoiceNumber: candidate } });
      if (!exists) { invoiceNumber = candidate; break; }
    }
    if (!invoiceNumber) {
      return NextResponse.json({ error: 'Could not generate invoice number' }, { status: 500 });
    }

    const amount = (items as { total: number }[]).reduce(
      (sum: number, item: { total: number }) => sum + item.total,
      0
    );

    if (amount <= 0) {
      return NextResponse.json({ error: 'INVALID_AMOUNT' }, { status: 400 });
    }

    const isPaid = markPaid === true;
    const resolvedPaidAt = isPaid && paidAt ? new Date(paidAt) : isPaid ? new Date() : null;

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber,
        clientId,
        bookingId: bookingId || null,
        amount,
        serviceType: serviceType || null,
        status: 'PENDING',
        paidAmount: 0,
        notes: notes?.trim() || null,
        ...(resolvedIssuedAt && { issuedAt: resolvedIssuedAt }),
        items: {
          create: items.map((item: { description: string; quantity: number; unitPrice: number; total: number; category?: string }) => ({
            description: item.description,
            quantity: item.quantity ?? 1,
            unitPrice: item.unitPrice,
            total: item.total,
            category: (item.category ?? 'OTHER') as 'BOARDING' | 'PET_TAXI' | 'GROOMING' | 'PRODUCT' | 'OTHER',
          })),
        },
      },
      include: { items: true, client: true },
    });

    // If markPaid: create a Payment row and run allocation
    if (isPaid && paymentMethod) {
      await prisma.payment.create({
        data: {
          invoiceId: invoice.id,
          amount,
          paymentMethod,
          paymentDate: resolvedPaidAt ?? new Date(),
        },
      });
      await allocatePayments(invoice.id);
    }

    // Walk-in clients: skip notification and email (no portal, no inbox)
    if (!client.isWalkIn) {
      await createInvoiceNotification(clientId, invoiceNumber, formatMAD(amount));

      const locale = client.language ?? 'fr';
      const { subject, html } = getEmailTemplate('invoice_available', {
        clientName: client.name,
        invoiceNumber,
        amount: formatMAD(amount),
      }, locale);
      await sendEmail({ to: client.email, subject, html });
    }

    await logAction({
      userId: session.user.id,
      action: LOG_ACTIONS.INVOICE_CREATED,
      entityType: 'Invoice',
      entityId: invoice.id,
      details: { invoiceNumber, amount, clientId },
    });

    return NextResponse.json(invoice, { status: 201 });
  } catch (error) {
    console.error('Create invoice error:', error);
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
