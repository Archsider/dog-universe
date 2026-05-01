import { NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { allocatePayments } from '@/lib/payments';
import { logAction, LOG_ACTIONS } from '@/lib/log';
import { sendSMS, sendAdminSMS, formatMAD } from '@/lib/sms';

type Params = { params: Promise<{ id: string }> };

const VALID_PAYMENT_METHODS = ['CASH', 'CARD', 'CHECK', 'TRANSFER'];

// ---------------------------------------------------------------------------
// GET /api/invoices/[id]/payments — payment history, chronological
// ---------------------------------------------------------------------------
export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const invoice = await prisma.invoice.findUnique({ where: { id } });
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (session.user.role === 'CLIENT' && invoice.clientId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const payments = await prisma.payment.findMany({
    where: { invoiceId: id },
    orderBy: { paymentDate: 'asc' },
    take: 200,
  });

  return NextResponse.json(payments);
}

// ---------------------------------------------------------------------------
// POST /api/invoices/[id]/payments — record a new payment
// body: { amount, paymentMethod, paymentDate, notes? }
// ---------------------------------------------------------------------------
export async function POST(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      payments: true,
      client: { select: { name: true, email: true, phone: true, isWalkIn: true } },
    },
  });
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (invoice.status === 'CANCELLED') {
    return NextResponse.json({ error: 'INVOICE_CANCELLED' }, { status: 400 });
  }

  const body = await request.json();
  const { amount, paymentMethod, paymentDate, notes } = body;

  // --- Validate ---
  const parsedAmount = Number(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return NextResponse.json({ error: 'INVALID_AMOUNT' }, { status: 400 });
  }

  if (!paymentMethod || !VALID_PAYMENT_METHODS.includes(paymentMethod)) {
    return NextResponse.json({ error: 'INVALID_PAYMENT_METHOD' }, { status: 400 });
  }

  const parsedDate = paymentDate ? new Date(paymentDate) : new Date();
  if (isNaN(parsedDate.getTime())) {
    return NextResponse.json({ error: 'INVALID_PAYMENT_DATE' }, { status: 400 });
  }

  // Prevent overpayment
  const alreadyPaid = invoice.payments.reduce((s, p) => s + p.amount, 0);
  if (alreadyPaid + parsedAmount > invoice.amount + 0.001) {
    return NextResponse.json({ error: 'OVERPAYMENT_NOT_ALLOWED' }, { status: 400 });
  }

  // --- Insert Payment ---
  await prisma.payment.create({
    data: {
      invoiceId: id,
      amount: parsedAmount,
      paymentMethod,
      paymentDate: parsedDate,
      notes: typeof notes === 'string' ? notes.trim() || null : null,
    },
  });

  // --- Reallocate & derive status ---
  await allocatePayments(id);

  // --- SMS confirmation paiement ---
  const clientFullName = invoice.clientDisplayName ?? invoice.client.name ?? '';
  const firstName = clientFullName.split(' ')[0] || clientFullName;
  if (!invoice.client.isWalkIn) {
    await sendSMS(
      invoice.client.phone,
      `Bonjour ${firstName} ! Votre paiement de ${formatMAD(parsedAmount)} a bien été reçu. Merci pour votre fidélité. — Dog Universe`,
    );
  }
  await sendAdminSMS(
    `💰 Paiement : ${formatMAD(parsedAmount)} reçu de ${clientFullName} — ${invoice.invoiceNumber}.`,
  );

  // --- Log ---
  await logAction({
    userId: session.user.id,
    action: LOG_ACTIONS.INVOICE_PAID,
    entityType: 'Invoice',
    entityId: id,
    details: {
      invoiceNumber: invoice.invoiceNumber,
      amount: parsedAmount,
      paymentMethod,
    },
  });

  // --- Return updated invoice with items + payments ---
  const updated = await prisma.invoice.findUnique({
    where: { id },
    include: {
      items: { orderBy: { id: 'asc' } },
      payments: { orderBy: { paymentDate: 'asc' } },
      client: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json(updated, { status: 201 });
}
