import { NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { requireRole } from '@/lib/auth-guards';
import { prisma } from '@/lib/prisma';
import { logAction, LOG_ACTIONS } from '@/lib/log';
import { createInvoiceNotification } from '@/lib/notifications';
import { getEmailTemplate } from '@/lib/email';
import { sendEmailNow, sendSmsNow } from '@/lib/notify-now';
import { formatMAD } from '@/lib/utils';
import { tryAcquireIdempotency, IdempotencyKeyInvalidError } from '@/lib/idempotency';
import { withSpan, logServerError } from '@/lib/observability';
import { notDeleted } from '@/lib/prisma-soft';
import {
  recordPayment,
  type PaymentMethod,
  type RecordPaymentError,
} from '@/lib/payment-allocation';

// Map structured recordPayment errors → HTTP status codes. Centralised so
// Site A and Site B respond identically to the same validation failure.
const PAYMENT_ERROR_HTTP_STATUS: Record<RecordPaymentError, number> = {
  INVALID_AMOUNT: 400,
  INVALID_PAYMENT_METHOD: 400,
  INVALID_PAYMENT_DATE: 400,
  INVOICE_NOT_FOUND: 404,
  INVOICE_CANCELLED: 400,
  OVERPAYMENT: 400,
};

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
    take: 200,
  });

  return NextResponse.json(invoices);
}

export async function POST(request: Request) {
  const guard = await requireRole(['ADMIN', 'SUPERADMIN']);
  if (guard.error) return guard.error;
  const { session } = guard;

  try {
    const body = await request.json();
    const { clientId, bookingId, items, notes, serviceType, issuedAt, markPaid, paymentMethod, paidAt } = body;

    // Idempotency-Key gate (optional header). Particulièrement critique quand
    // markPaid === true — un replay pourrait double-créditer la caisse.
    if (markPaid === true) {
      try {
        const idem = await tryAcquireIdempotency(request, 'invoice:create', session.user.id);
        if (!idem.acquired) {
          return NextResponse.json(
            { error: 'DUPLICATE_REQUEST', message: 'Idempotency-Key replay detected.' },
            { status: 409 },
          );
        }
      } catch (err) {
        if (err instanceof IdempotencyKeyInvalidError) {
          return NextResponse.json({ error: 'IDEMPOTENCY_KEY_INVALID' }, { status: 400 });
        }
        throw err;
      }
    }

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

    // Resolve periodDate from booking.startDate (revenue bucketing by service period)
    let resolvedPeriodDate: Date | undefined;
    if (bookingId) {
      const bookingForPeriod = await prisma.booking.findUnique({
        where: { id: bookingId },
        select: { startDate: true },
      });
      if (bookingForPeriod?.startDate) {
        resolvedPeriodDate = bookingForPeriod.startDate;
      }
    }

    // Validate payment info if markPaid
    const VALID_PAYMENT_METHODS = ['CASH', 'CARD', 'CHECK', 'TRANSFER'];
    if (markPaid && paymentMethod && !VALID_PAYMENT_METHODS.includes(paymentMethod)) {
      return NextResponse.json({ error: 'INVALID_PAYMENT_METHOD' }, { status: 400 });
    }

    // Si paidAt fourni, refuser une date dans le futur (>= now + 24h) — un
    // paiement enregistré "demain" décale faussement le mois comptable.
    if (markPaid && paidAt) {
      const paidAtDate = new Date(paidAt);
      if (Number.isNaN(paidAtDate.getTime())) {
        return NextResponse.json({ error: 'INVALID_PAID_AT' }, { status: 400 });
      }
      if (paidAtDate.getTime() >= Date.now() + 24 * 3600 * 1000) {
        return NextResponse.json({ error: 'INVALID_PAID_AT' }, { status: 400 });
      }
    }

    // Validate each item: amounts must be positive numbers
    const VALID_CATEGORIES = ['BOARDING', 'PET_TAXI', 'GROOMING', 'PRODUCT', 'OTHER'];
    for (const item of items as { description: string; quantity: number; unitPrice: number; total: number; category?: string; productId?: string | null }[]) {
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
      // Defense-in-depth (Zod-equivalent) refine for the floor :
      // category='PRODUCT' MUST carry a non-empty productId. Twin of the
      // Zod refine in /api/admin/walkin-invoice and PATCH /api/invoices/[id],
      // and the DB CHECK constraint InvoiceItem_product_category_has_productId.
      if (item.category === 'PRODUCT' && (typeof item.productId !== 'string' || item.productId.length === 0)) {
        return NextResponse.json({ error: 'PRODUCT_CATEGORY_REQUIRES_PRODUCT_ID' }, { status: 400 });
      }
    }

    const client = await prisma.user.findFirst({ where: notDeleted({ id: clientId }) });
    if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    // Authz cross-role : ADMIN ne peut créer une facture (et a fortiori
    // l'encaisser) que pour un CLIENT. SUPERADMIN passe partout.
    // Parité avec POST /api/invoices/[id]/payments.
    if (session.user.role === 'ADMIN' && client.role !== 'CLIENT') {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
    }

    // Garde-fou : Invoice.bookingId est @unique — au plus UNE facture
    // principale par réservation. Si une facture existe déjà pour ce booking,
    // on renvoie un 409 clair AVANT de consommer un numéro de séquence (sinon
    // prisma.invoice.create lève P2002 → 500 + bruit Sentry "erreur"). Les
    // factures supplément passent par supplementaryForBookingId (bookingId
    // null) et ne sont donc pas concernées.
    if (bookingId) {
      const existingInvoice = await prisma.invoice.findUnique({
        where: { bookingId },
        select: { invoiceNumber: true, status: true },
      });
      if (existingInvoice) {
        return NextResponse.json(
          {
            error: 'BOOKING_ALREADY_INVOICED',
            message: `Une facture (${existingInvoice.invoiceNumber}) existe déjà pour cette réservation.`,
            invoiceNumber: existingInvoice.invoiceNumber,
            status: existingInvoice.status,
          },
          { status: 409 },
        );
      }
    }

    // Generate invoice number atomiquement via la table InvoiceSequence.
    // INSERT ... ON CONFLICT DO UPDATE RETURNING garantit qu'aucun deux
    // appels concurrents ne reçoivent le même seq (verrou de row PG).
    // Retry max 5× sur P2002 si jamais une facture legacy (hors séquence)
    // collisionne avec le seq calculé.
    const { casablancaYMD } = await import('@/lib/dates-casablanca');
    const year = resolvedIssuedAt ? casablancaYMD(resolvedIssuedAt).year : casablancaYMD().year;
    let invoiceNumber = '';
    for (let attempt = 0; attempt < 5; attempt++) {
      const seqRow = await prisma.$queryRaw<{ lastSeq: number }[]>`
        INSERT INTO "InvoiceSequence" (year, "lastSeq")
        VALUES (${year}, 1)
        ON CONFLICT (year)
        DO UPDATE SET "lastSeq" = "InvoiceSequence"."lastSeq" + 1
        RETURNING "lastSeq"
      `;
      const seq = seqRow[0]?.lastSeq;
      if (typeof seq !== 'number') break;
      const candidate = `DU-${year}-${String(seq).padStart(4, '0')}`;
      const exists = await prisma.invoice.findUnique({ where: { invoiceNumber: candidate } });
      if (!exists) { invoiceNumber = candidate; break; }
      // Collision avec une facture legacy → on consomme un seq supplémentaire.
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

    // Aggrège les quantités par productId — si le même produit apparaît sur
    // plusieurs lignes, on décrément le stock une seule fois avec la somme
    // (évite les doubles décréments + le SELECT FOR UPDATE concurrent).
    const productLines = (items as { productId?: string; quantity: number }[])
      .filter((it) => typeof it.productId === 'string' && it.productId.length > 0);
    const stockNeeds = new Map<string, number>();
    for (const it of productLines) {
      stockNeeds.set(it.productId!, (stockNeeds.get(it.productId!) ?? 0) + (it.quantity ?? 1));
    }

    let invoice;
    try {
      invoice = await withSpan(
        'api.invoice.create',
        { entityId: clientId, userId: session.user.id, amount, items: items.length, markPaid: !!markPaid },
        () => prisma.$transaction(async (tx) => {
        // 1) Verrouille chaque produit (FOR UPDATE) + check stock + décrément.
        //    Lock en parallèle SAFE car id distinct par ligne.
        if (stockNeeds.size > 0) {
          for (const [productId, needed] of stockNeeds.entries()) {
            const locked = await tx.$queryRaw<{ id: string; stock: number; available: boolean }[]>`
              SELECT id, stock, available FROM "Product" WHERE id = ${productId} FOR UPDATE
            `;
            const product = locked[0];
            if (!product) {
              throw new Error(`PRODUCT_NOT_FOUND:${productId}`);
            }
            if (product.available === false) {
              throw new Error(`PRODUCT_UNAVAILABLE:${productId}`);
            }
            if (product.stock < needed) {
              throw new Error(`OUT_OF_STOCK:${productId}`);
            }
            await tx.product.update({
              where: { id: productId },
              data: { stock: { decrement: needed } },
            });
          }
        }

        // 2) Crée l'invoice + items dans la même tx.
        return tx.invoice.create({
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
            ...(resolvedPeriodDate && { periodDate: resolvedPeriodDate }),
            items: {
              create: items.map((item: { description: string; quantity: number; unitPrice: number; total: number; category?: string; productId?: string }) => ({
                description: item.description,
                quantity: item.quantity ?? 1,
                unitPrice: item.unitPrice,
                total: item.total,
                // Règle métier : productId présent → category forcée à 'PRODUCT'.
                // L'appelant ne peut pas surcharger cette catégorie.
                ...(item.productId
                  ? { productId: item.productId, category: 'PRODUCT' as const }
                  : { category: (item.category ?? 'OTHER') as 'BOARDING' | 'PET_TAXI' | 'GROOMING' | 'PRODUCT' | 'OTHER' }),
              })),
            },
          },
          include: { items: true, client: true },
        });
      }),
      );
    } catch (err) {
      if (err instanceof Error) {
        if (err.message.startsWith('OUT_OF_STOCK')) {
          return NextResponse.json({ error: 'OUT_OF_STOCK' }, { status: 400 });
        }
        if (err.message.startsWith('PRODUCT_UNAVAILABLE')) {
          return NextResponse.json({ error: 'PRODUCT_UNAVAILABLE' }, { status: 400 });
        }
        if (err.message.startsWith('PRODUCT_NOT_FOUND')) {
          return NextResponse.json({ error: 'PRODUCT_NOT_FOUND' }, { status: 400 });
        }
      }
      // Course / double-submit : deux requêtes concurrentes pour le même
      // booking passent le pré-check, la 2nde frappe le @unique bookingId
      // (P2002). On renvoie le même 409 propre — jamais un 500 bruyant.
      const code = (err as { code?: string }).code;
      if (code === 'P2002') {
        const target = (err as { meta?: { target?: string[] | string } }).meta?.target;
        const onBooking = Array.isArray(target)
          ? target.includes('bookingId')
          : String(target ?? '').includes('bookingId');
        if (onBooking) {
          return NextResponse.json(
            {
              error: 'BOOKING_ALREADY_INVOICED',
              message: 'Une facture existe déjà pour cette réservation.',
            },
            { status: 409 },
          );
        }
      }
      throw err;
    }

    // If markPaid: route the Payment creation through the canonical helper.
    // `trustedAmount: true` is durable here — Site B builds payment.amount
    // = invoice.amount by construction, so overpayment is structurally
    // impossible. The helper also handles paymentMethod whitelist + cache
    // invalidation for `revenue:YYYY:MM` (both were missing pre-Module 4-A).
    if (isPaid && paymentMethod) {
      const payResult = await recordPayment(
        {
          invoiceId: invoice.id,
          amount,
          paymentMethod: paymentMethod as PaymentMethod,
          paymentDate: resolvedPaidAt ?? new Date(),
        },
        {
          trustedAmount: true,
          // Invoice was just created in the tx above — no point re-fetching.
          prefetchedInvoice: {
            id: invoice.id,
            status: 'PENDING',
            amount,
            payments: [],
          },
        },
      );
      if (!payResult.ok) {
        const status = PAYMENT_ERROR_HTTP_STATUS[payResult.error];
        return NextResponse.json({ error: payResult.error }, { status });
      }
      // Admin SMS OPS — parity with Site A. Operator wants real-time
      // awareness of every payment recorded on their books. Walk-in clients
      // do NOT receive a COMPTA SMS here (Module 4-A Q1) — the invoice_available
      // email below is enough, and a paid-confirmation SMS would double-notify.
      const clientFullName = client.name ?? '';
      sendSmsNow({
        to: 'ADMIN',
        message: `💰 Paiement : ${formatMAD(amount)} reçu de ${clientFullName} — ${invoiceNumber}.`,
      });
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
      sendEmailNow({ to: client.email, subject, html });
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
    logServerError('invoice', 'Create invoice error', error);
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
