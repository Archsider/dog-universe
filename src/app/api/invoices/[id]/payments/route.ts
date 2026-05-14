import { NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { allocatePayments } from '@/lib/payments';
import { logAction, LOG_ACTIONS } from '@/lib/log';
import { formatMAD } from '@/lib/sms';
import { sendSmsNow } from '@/lib/notify-now';
import { tryAcquireIdempotency, IdempotencyKeyInvalidError } from '@/lib/idempotency';
import { toNumber } from '@/lib/decimal';
import { cacheDel } from '@/lib/cache';
import { withSpan } from '@/lib/observability';

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

  // Idempotency-Key support — replays within 24h are rejected with 409.
  // Scope per-invoice so two distinct invoices can reuse the same client key.
  try {
    const idem = await tryAcquireIdempotency(request, `payment:${id}`, session.user.id);
    if (!idem.acquired) {
      return NextResponse.json({ error: 'DUPLICATE_REQUEST' }, { status: 409 });
    }
  } catch (err) {
    if (err instanceof IdempotencyKeyInvalidError) {
      return NextResponse.json({ error: 'IDEMPOTENCY_KEY_INVALID' }, { status: 400 });
    }
    throw err;
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      payments: true,
      client: { select: { name: true, email: true, phone: true, isWalkIn: true, role: true } },
    },
  });
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // Authz cross-role : ADMIN ne peut enregistrer un paiement que sur une
  // facture de CLIENT. SUPERADMIN passe partout.
  if (session.user.role === 'ADMIN' && invoice.client.role !== 'CLIENT') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
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

  // Reject overpayment outright (Sprint 1 sécurité critique). Tolerance 0.01
  // MAD (1 centime) to absorb Decimal rounding without allowing actual excess.
  // If the admin needs to add a new line item before recording the payment,
  // they must update the invoice first — the previous "briefly accepted"
  // behaviour masked legitimate accounting errors.
  const alreadyPaid = invoice.payments.reduce((s, p) => s + toNumber(p.amount), 0);
  const invoiceTotal = toNumber(invoice.amount);
  if (alreadyPaid + parsedAmount > invoiceTotal + 0.01) {
    return NextResponse.json(
      {
        error: 'OVERPAYMENT',
        invoiceTotal,
        alreadyPaid,
        attempted: parsedAmount,
      },
      { status: 400 },
    );
  }

  // --- Insert Payment + Reallocate (span for observability) ---
  await withSpan(
    'api.payment.create',
    { entityId: id, userId: session.user.id, amount: parsedAmount, paymentMethod },
    async () => {
      await prisma.payment.create({
        data: {
          invoiceId: id,
          amount: parsedAmount,
          paymentMethod,
          paymentDate: parsedDate,
          notes: typeof notes === 'string' ? notes.trim() || null : null,
        },
      });
      await allocatePayments(id);
    },
  );

  // O5 — invalide le cache revenue du mois du paiement (KPIs dashboard /
  // analytics). Fail-open via cacheDel.
  const yyyy = parsedDate.getFullYear();
  const mm = parsedDate.getMonth() + 1;
  await cacheDel(`revenue:${yyyy}:${mm}`);

  // --- SMS confirmation paiement ---
  // Route via sendSmsNow so the SmsLog atomic reservation guards against
  // double-clicks, network retries, or duplicate idempotency-key replays
  // each sending a separate SMS. Fire-and-forget: the HTTP response is
  // returned to the operator without waiting on the SMS gateway.
  const clientFullName = invoice.clientDisplayName ?? invoice.client.name ?? '';
  const firstName = clientFullName.split(' ')[0] || clientFullName;
  if (!invoice.client.isWalkIn) {
    sendSmsNow({
      to: invoice.client.phone,
      message: `Bonjour ${firstName} ! Votre paiement de ${formatMAD(parsedAmount)} a bien été reçu. Merci pour votre fidélité. — Dog Universe`,
    });
  }
  sendSmsNow({
    to: 'ADMIN',
    message: `💰 Paiement : ${formatMAD(parsedAmount)} reçu de ${clientFullName} — ${invoice.invoiceNumber}.`,
  });

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
