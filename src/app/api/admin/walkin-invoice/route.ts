// POST /api/admin/walkin-invoice
//
// Walk-in invoice = paid-on-the-spot transaction Mehdi enters manually,
// most commonly for shop sales (croquettes, leashes) and short services
// not bookable online (quick grooming, single taxi ride).
//
// Atomic flow inside a Prisma $transaction :
//   1. Resolve clientId — provided id OR find-or-create walkin-anonymous
//      generic user (single shared row, scoped by deterministic email).
//   2. Compute the invoice total from items (DISCOUNT items have a
//      negative unitPrice — accepted, but the **net total must be > 0**).
//   3. Allocate an invoice number atomically via InvoiceSequence
//      (`INSERT … ON CONFLICT DO UPDATE`).
//   4. Create a fantôme Booking : status=COMPLETED, isWalkIn=true,
//      source='WALKIN', startDate=endDate=paymentDate. ServiceType is
//      'BOARDING' as a default — the dashboard / billing / calendar all
//      filter by `isWalkIn` already, so the serviceType is cosmetic for
//      this row.
//   5. Create the Invoice (linked to that booking) + all InvoiceItems.
//      `Invoice.amount` is set by the post-INSERT trigger
//      (`trg_recompute_invoice_amount`) — we still seed it to total to
//      keep the row valid mid-transaction.
//   6. Commit the transaction.
//   7. After commit, call `recordPayment({ trustedAmount: true })` —
//      the total is correct by construction (we just built the items),
//      so the overpayment guard would be redundant.
//
// Side effects (post-commit, fire-and-forget) :
//   - SMS OPS admin notification ("💰 Walk-in: <amount> MAD via <method>")
//   - ActionLog INVOICE_CREATED_WALKIN
//   - revenue:YYYY:MM cache invalidation (handled by recordPayment)
//
// Idempotency-Key header is **mandatory** here (not back-compat with
// missing key like other endpoints). Replays inside the 24h window
// return the previously-created invoice id (looked up via the key
// stored on `Booking.idempotencyKey`).
//
// Auth : ADMIN / SUPERADMIN only.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '../../../../../auth';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { withSpan } from '@/lib/observability';
import { logAction, LOG_ACTIONS } from '@/lib/log';
import { sendSmsNow } from '@/lib/notify-now';
import { recordPayment } from '@/lib/payment-allocation';
import { casablancaYMD } from '@/lib/dates-casablanca';
import {
  tryAcquireIdempotency,
  IdempotencyKeyInvalidError,
} from '@/lib/idempotency';
import { formatMAD } from '@/lib/utils';
import { notDeleted } from '@/lib/prisma-soft';

export const dynamic = 'force-dynamic';

const ITEM_CATEGORIES = ['BOARDING', 'PET_TAXI', 'GROOMING', 'PRODUCT', 'OTHER', 'DISCOUNT'] as const;
const PAYMENT_METHODS = ['CASH', 'CARD', 'CHECK', 'TRANSFER'] as const;

const itemSchema = z.object({
  category: z.enum(ITEM_CATEGORIES),
  description: z.string().trim().min(1).max(200),
  quantity: z.number().int().positive().max(9999),
  // Negative unitPrice is allowed for DISCOUNT items only ; the refine on
  // the outer schema enforces "DISCOUNT ⇒ unitPrice < 0" + "non-DISCOUNT
  //  ⇒ unitPrice >= 0".
  unitPrice: z.number().finite(),
  // Optional link to Product catalogue. When `category === 'PRODUCT'`, this
  // MUST be a non-empty string (enforced by the refine below). The DB has a
  // matching CHECK constraint (`InvoiceItem_product_category_has_productId`)
  // as the final floor.
  productId: z.string().min(1).nullable().optional(),
}).strict().refine(
  (it) => (it.category === 'DISCOUNT' ? it.unitPrice < 0 : it.unitPrice >= 0),
  { message: 'DISCOUNT items must have negative unitPrice ; other items must be non-negative' },
).refine(
  (it) => it.category !== 'PRODUCT' || (typeof it.productId === 'string' && it.productId.length > 0),
  { message: 'PRODUCT_CATEGORY_REQUIRES_PRODUCT_ID', path: ['productId'] },
);

const bodySchema = z.object({
  clientId: z.string().cuid().nullable().optional(),
  clientName: z.string().trim().min(1).max(120).nullable().optional(),
  paymentDate: z.string().datetime().optional(), // defaults to now
  paymentMethod: z.enum(PAYMENT_METHODS),
  items: z.array(itemSchema).min(1).max(50),
  notes: z.string().trim().max(2000).nullable().optional(),
}).strict();

const WALKIN_ANON_EMAIL = 'walkin-anonymous@dog-universe.local';
const WALKIN_ANON_NAME = 'Walk-in anonyme';

/** Atomic allocation of a fresh invoice number for `year`. */
async function allocateInvoiceNumber(tx: Prisma.TransactionClient, year: number): Promise<string | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const seqRow = await tx.$queryRaw<{ lastSeq: number }[]>`
      INSERT INTO "InvoiceSequence" (year, "lastSeq")
      VALUES (${year}, 1)
      ON CONFLICT (year)
      DO UPDATE SET "lastSeq" = "InvoiceSequence"."lastSeq" + 1
      RETURNING "lastSeq"
    `;
    const seq = seqRow[0]?.lastSeq;
    if (typeof seq !== 'number') break;
    const candidate = `DU-${year}-${String(seq).padStart(4, '0')}`;
    const exists = await tx.invoice.findUnique({ where: { invoiceNumber: candidate } });
    if (!exists) return candidate;
  }
  return null;
}

/** Resolve or lazily create the shared "walk-in anonymous" client row. */
async function resolveAnonymousClient(tx: Prisma.TransactionClient): Promise<string> {
  const existing = await tx.user.findUnique({
    where: { email: WALKIN_ANON_EMAIL },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await tx.user.create({
    data: {
      email: WALKIN_ANON_EMAIL,
      name: WALKIN_ANON_NAME,
      firstName: 'Walk-in',
      lastName: 'Anonyme',
      role: 'CLIENT',
      isWalkIn: true,
      // NextAuth requires a passwordHash column populated. We seed a
      // random non-loginable value — this user has no real account, only
      // an invoice trail.
      passwordHash: 'walkin-no-login-' + Math.random().toString(36).slice(2),
    },
    select: { id: true },
  });
  return created.id;
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPERADMIN')) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  // ── Idempotency-Key — MANDATORY here ──────────────────────────────────
  const idempotencyKey = request.headers.get('idempotency-key');
  if (!idempotencyKey) {
    return NextResponse.json({ error: 'IDEMPOTENCY_KEY_REQUIRED' }, { status: 400 });
  }
  try {
    const ack = await tryAcquireIdempotency(request, 'walkin-invoice', session.user.id);
    if (!ack.acquired) {
      // Replay : look up the booking by idempotency key, return its invoice.
      const replay = await prisma.booking.findUnique({
        where: { idempotencyKey: `walkin:${idempotencyKey}` },
        select: {
          id: true,
          invoice: { select: { id: true, invoiceNumber: true } },
        },
      });
      if (replay?.invoice) {
        return NextResponse.json({
          ok: true,
          replay: true,
          bookingId: replay.id,
          invoiceId: replay.invoice.id,
          invoiceNumber: replay.invoice.invoiceNumber,
        });
      }
      // Acquired-but-no-booking : the previous request crashed mid-tx.
      // Falling through means we let this attempt re-create — acceptable.
    }
  } catch (err) {
    if (err instanceof IdempotencyKeyInvalidError) {
      return NextResponse.json({ error: 'IDEMPOTENCY_KEY_INVALID' }, { status: 400 });
    }
    throw err;
  }

  let parsed: z.infer<typeof bodySchema>;
  try {
    const raw = await request.json();
    parsed = bodySchema.parse(raw);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'INVALID_BODY', issues: err.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }

  // ── Total computation (allow negative DISCOUNT items, but net > 0) ────
  let total = 0;
  for (const it of parsed.items) {
    total += it.quantity * it.unitPrice;
  }
  // Round to 2 decimals (centimes) — DB column is DECIMAL(10,2) anyway.
  total = Math.round(total * 100) / 100;
  if (total <= 0) {
    return NextResponse.json({ error: 'TOTAL_MUST_BE_POSITIVE', total }, { status: 400 });
  }

  const paymentDate = parsed.paymentDate ? new Date(parsed.paymentDate) : new Date();
  if (Number.isNaN(paymentDate.getTime())) {
    return NextResponse.json({ error: 'INVALID_PAYMENT_DATE' }, { status: 400 });
  }

  const result = await withSpan(
    'api.walkin-invoice.create',
    {
      'user.role': session.user.role,
      'walkin.itemCount': parsed.items.length,
      'walkin.paymentMethod': parsed.paymentMethod,
    },
    async () => {
      return prisma.$transaction(async (tx) => {
        const clientId = parsed.clientId ?? (await resolveAnonymousClient(tx));

        // Sanity-check : client must exist + be soft-active.
        const client = await tx.user.findFirst({
          where: notDeleted({ id: clientId }),
          select: { id: true, name: true, phone: true, email: true, role: true },
        });
        if (!client) {
          throw new WalkinError('CLIENT_NOT_FOUND', 404);
        }

        const year = casablancaYMD(paymentDate).year;
        const invoiceNumber = await allocateInvoiceNumber(tx, year);
        if (!invoiceNumber) {
          throw new WalkinError('INVOICE_SEQUENCE_FAILED', 500);
        }

        // Fantôme booking : carries the walk-in marker + the calendar pin.
        // ServiceType cosmetic (filtered out of dashboards via isWalkIn).
        const booking = await tx.booking.create({
          data: {
            clientId,
            serviceType: 'BOARDING',
            status: 'COMPLETED',
            startDate: paymentDate,
            endDate: paymentDate,
            isOpenEnded: false,
            isWalkIn: true,
            source: 'WALKIN',
            totalPrice: total,
            notes: parsed.notes ?? null,
            idempotencyKey: `walkin:${idempotencyKey}`,
          },
          select: { id: true },
        });

        const invoice = await tx.invoice.create({
          data: {
            bookingId: booking.id,
            clientId,
            invoiceNumber,
            amount: total,
            status: 'PENDING', // recordPayment flips to PAID via allocation
            issuedAt: paymentDate,
            periodDate: paymentDate,
            // Use displayName override for anonymous client when caller
            // provided a free-text name.
            clientDisplayName: parsed.clientId == null && parsed.clientName ? parsed.clientName : null,
            notes: parsed.notes ?? null,
          },
          select: { id: true, amount: true, status: true },
        });

        // Items with the right category mapping. The DB trigger
        // `trg_recompute_invoice_amount` will recompute Invoice.amount
        // from SUM(items.total) on commit ; our pre-computed total above
        // mirrors that exactly.
        await tx.invoiceItem.createMany({
          data: parsed.items.map((it) => ({
            invoiceId: invoice.id,
            description: it.description,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            total: Math.round(it.quantity * it.unitPrice * 100) / 100,
            category: it.category,
            // PRODUCT category requires productId (Zod refine
            // PRODUCT_CATEGORY_REQUIRES_PRODUCT_ID + DB CHECK constraint
            // InvoiceItem_product_category_has_productId).
            productId: it.productId ?? null,
          })),
        });

        return {
          bookingId: booking.id,
          invoiceId: invoice.id,
          invoiceNumber,
          total,
          clientName: parsed.clientId == null && parsed.clientName
            ? parsed.clientName
            : (client.name ?? ''),
          clientPhone: client.phone,
        };
      });
    },
  );

  // ── recordPayment outside the tx — single canonical money insertion ───
  const pay = await recordPayment(
    {
      invoiceId: result.invoiceId,
      amount: result.total,
      paymentMethod: parsed.paymentMethod,
      paymentDate,
    },
    {
      trustedAmount: true, // we just built the items, total is correct by construction
    },
  );
  if (!pay.ok) {
    // Compensating path is intentionally absent : the invoice + booking
    // are kept, the admin can record the payment from the standard
    // PaymentModal. Surface the error so the UI can show a clear toast.
    return NextResponse.json(
      {
        error: 'PAYMENT_FAILED',
        detail: pay.error,
        invoiceId: result.invoiceId,
        invoiceNumber: result.invoiceNumber,
      },
      { status: 500 },
    );
  }

  // ── Post-commit fire-and-forget : SMS OPS admin + audit log ───────────
  sendSmsNow({
    to: 'ADMIN',
    message: `💰 Walk-in: ${formatMAD(result.total)} encaissé via ${parsed.paymentMethod} (${result.invoiceNumber}${result.clientName ? ` — ${result.clientName}` : ''})`,
  });

  await logAction({
    userId: session.user.id,
    action: LOG_ACTIONS.INVOICE_CREATED_WALKIN,
    entityType: 'Invoice',
    entityId: result.invoiceId,
    details: {
      invoiceNumber: result.invoiceNumber,
      bookingId: result.bookingId,
      total: result.total,
      itemCount: parsed.items.length,
      paymentMethod: parsed.paymentMethod,
      anonymousClient: parsed.clientId == null,
    },
  });

  return NextResponse.json({
    ok: true,
    bookingId: result.bookingId,
    invoiceId: result.invoiceId,
    invoiceNumber: result.invoiceNumber,
  });
}

class WalkinError extends Error {
  constructor(public code: string, public status: number) {
    super(code);
    this.name = 'WalkinError';
  }
}
