import { NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { prisma } from '@/lib/prisma';
import { logAction, LOG_ACTIONS } from '@/lib/log';
import { createInvoiceNotification } from '@/lib/notifications';
import { sendEmail, getEmailTemplate } from '@/lib/email';
import { formatMAD } from '@/lib/utils';

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

  if (status) where.status = status;

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
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { clientId, bookingId, items, notes } = body;

    if (!clientId || !items?.length) {
      return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 });
    }

    const client = await prisma.user.findUnique({ where: { id: clientId } });
    if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

    // Generate invoice number
    const count = await prisma.invoice.count();
    const year = new Date().getFullYear();
    const invoiceNumber = `DU-${year}-${String(count + 1).padStart(4, '0')}`;

    const amount = items.reduce(
      (sum: number, item: { total: number }) => sum + item.total,
      0
    );

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber,
        clientId,
        bookingId: bookingId || null,
        amount,
        status: 'PENDING',
        notes: notes?.trim() || null,
        items: {
          create: items.map((item: { description: string; quantity: number; unitPrice: number; total: number }) => ({
            description: item.description,
            quantity: item.quantity ?? 1,
            unitPrice: item.unitPrice,
            total: item.total,
          })),
        },
      },
      include: { items: true, client: true },
    });

    // Notify client
    await createInvoiceNotification(clientId, invoiceNumber, formatMAD(amount));

    const locale = client.language ?? 'fr';
    const { subject, html } = getEmailTemplate('invoice_available', {
      clientName: client.name,
      invoiceNumber,
      amount: formatMAD(amount),
    }, locale);
    await sendEmail({ to: client.email, subject, html });

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
