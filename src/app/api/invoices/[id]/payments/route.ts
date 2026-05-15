import { NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { logAction, LOG_ACTIONS } from '@/lib/log';
import { formatMAD } from '@/lib/sms';
import { sendSmsNow, sendSmsRespectful } from '@/lib/notify-now';
import { tryAcquireIdempotency, IdempotencyKeyInvalidError } from '@/lib/idempotency';
import { withSpan } from '@/lib/observability';
import {
  recordPayment,
  type PaymentMethod,
  type RecordPaymentError,
} from '@/lib/payment-allocation';

type Params = { params: Promise<{ id: string }> };

// Map structured recordPayment errors → HTTP status codes. Centralised so
// Site A and Site B respond identically to the same validation failure.
const ERROR_HTTP_STATUS: Record<RecordPaymentError, number> = {
  INVALID_AMOUNT: 400,
  INVALID_PAYMENT_METHOD: 400,
  INVALID_PAYMENT_DATE: 400,
  INVOICE_NOT_FOUND: 404,
  INVOICE_CANCELLED: 400,
  OVERPAYMENT: 400,
};

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

  // Fetch invoice up front : the cross-role gate + SMS bodies need
  // client info, and we pass the same row to `recordPayment` as
  // `prefetchedInvoice` so the helper doesn't re-query.
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      amount: true,
      invoiceNumber: true,
      clientDisplayName: true,
      payments: { select: { amount: true } },
      client: { select: { name: true, email: true, phone: true, isWalkIn: true, role: true } },
    },
  });
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // Authz cross-role : ADMIN ne peut enregistrer un paiement que sur une
  // facture de CLIENT. SUPERADMIN passe partout.
  if (session.user.role === 'ADMIN' && invoice.client.role !== 'CLIENT') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const body = await request.json();
  const { amount, paymentMethod, paymentDate, notes } = body;
  // `sendClientSms` is the UI toggle on PaymentModal. Defaults to `true` so
  // older clients that don't send the flag get the previous (always-send)
  // behaviour, refined further by the `sendSmsRespectful` policy below.
  const sendClientSms: boolean = body.sendClientSms !== false;
  const parsedAmount = Number(amount);
  const parsedDate = paymentDate ? new Date(paymentDate) : new Date();

  // --- Insert Payment + Reallocate (span for observability) ---
  const result = await withSpan(
    'api.payment.create',
    { entityId: id, userId: session.user.id, amount: parsedAmount, paymentMethod },
    () =>
      recordPayment(
        {
          invoiceId: id,
          amount: parsedAmount,
          paymentMethod: paymentMethod as PaymentMethod,
          paymentDate: paymentDate ? parsedDate : undefined,
          notes,
        },
        {
          prefetchedInvoice: {
            id: invoice.id,
            status: invoice.status,
            amount: invoice.amount,
            payments: invoice.payments,
          },
        },
      ),
  );

  if (!result.ok) {
    const status = ERROR_HTTP_STATUS[result.error];
    if (result.error === 'OVERPAYMENT') {
      return NextResponse.json({ error: result.error, ...result.detail }, { status });
    }
    return NextResponse.json({ error: result.error }, { status });
  }

  // --- SMS confirmation paiement ---
  // Client SMS:    COMPTA category — respects walk-in skip + quiet hours
  //                (21h-9h Casablanca defers to 9h). UI toggle from
  //                PaymentModal opts out entirely via `sendClientSms=false`.
  // Admin SMS:     OPS — always immediate; the operator wants real-time
  //                awareness of every payment recorded on their books.
  //                The 'ADMIN' sentinel bypasses quiet hours in the policy.
  const clientFullName = invoice.clientDisplayName ?? invoice.client.name ?? '';
  const firstName = clientFullName.split(' ')[0] || clientFullName;
  if (sendClientSms) {
    sendSmsRespectful(
      {
        to: invoice.client.phone,
        message: `Bonjour ${firstName} ! Votre paiement de ${formatMAD(parsedAmount)} a bien été reçu. Merci pour votre fidélité. — Dog Universe`,
      },
      {
        category: 'COMPTA',
        recipient: invoice.client.isWalkIn ? 'walkin' : 'standard',
      },
    );
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
