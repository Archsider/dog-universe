// Single source of truth for inserting a Payment row + running allocation.
//
// Before this module, the same sequence lived inline in 2 backend routes:
//   - POST /api/invoices/[id]/payments  (record a payment on existing invoice)
//   - POST /api/invoices  (create invoice + optional payment in one shot)
//
// They diverged on a critical bug : Site B (invoice creation) was missing
// the revenue-cache invalidation, the paymentMethod whitelist, the admin
// SMS, and the cross-role gate that Site A enforced. The drift produced
// silent CA under-reporting on the walk-in workflow. Module 4-A (PR #93)
// consolidates the path through `recordPayment` to eliminate the drift
// by construction.
//
// Scope (what's IN this helper) :
//   - Input validation (amount > 0, method whitelist, date parseable)
//   - Overpayment guard (unless trustedAmount=true)
//   - Invoice existence + CANCELLED guard
//   - Payment row insertion
//   - allocatePayments(invoiceId) — recompute paidAmount/status/paidAt + loyalty + portal notifs
//   - Revenue cache invalidation for paymentDate month
//
// Out of scope (caller responsibility — needs context the helper can't see) :
//   - HTTP auth gate (route layer has `session`)
//   - Cross-role gate ADMIN→CLIENT (route layer)
//   - Idempotency-Key acquisition (route layer has request headers)
//   - SMS / email dispatch (caller picks COMPTA respectful vs OPS direct)
//   - ActionLog action name (caller knows the context: INVOICE_PAID vs
//     INVOICE_CREATED_WITH_PAYMENT)
//   - withSpan naming (route layer)
//
// The `trustedAmount` escape hatch is DURABLE, not transitional. Site B
// (invoice creation) builds the payment.amount = invoice.amount by
// construction, so overpayment is structurally impossible. Re-validating
// would be redundant.

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { allocatePayments } from '@/lib/payments';
import { cacheDel } from '@/lib/cache';
import { toNumber } from '@/lib/decimal';
import { casablancaYMD } from '@/lib/dates-casablanca';

type PrismaLike = typeof prisma | Prisma.TransactionClient;

export type PaymentMethod = 'CASH' | 'CARD' | 'CHECK' | 'TRANSFER';
const VALID_PAYMENT_METHODS: readonly PaymentMethod[] = [
  'CASH',
  'CARD',
  'CHECK',
  'TRANSFER',
];

export interface RecordPaymentInput {
  invoiceId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  /** Defaults to `new Date()` when omitted. */
  paymentDate?: Date;
  notes?: string | null;
}

/** Minimal invoice shape the helper needs to validate + run overpayment
 *  check. Callers that already fetched the invoice for unrelated reasons
 *  (e.g. cross-role authz, SMS context) should pass it via
 *  `prefetchedInvoice` to skip the helper's own SELECT. */
export interface PrefetchedInvoice {
  id: string;
  status: string;
  amount: Prisma.Decimal | number;
  payments: { amount: Prisma.Decimal | number }[];
}

export interface RecordPaymentOptions {
  /** Skip the overpayment guard. Use ONLY when the caller proves
   *  `amount = invoice.amount` by construction (Site B walk-in invoice
   *  creation). Default false. */
  trustedAmount?: boolean;
  /** Prisma client / transaction. Default `prisma`. */
  client?: PrismaLike;
  /** Invoice already fetched by the caller. When provided the helper skips
   *  its own `findUnique` — useful for Site A (cross-role gate fetch) and
   *  Site B (post-creation, invoice is already in hand). */
  prefetchedInvoice?: PrefetchedInvoice;
}

export type RecordPaymentError =
  | 'INVALID_AMOUNT'
  | 'INVALID_PAYMENT_METHOD'
  | 'INVALID_PAYMENT_DATE'
  | 'INVOICE_NOT_FOUND'
  | 'INVOICE_CANCELLED'
  | 'OVERPAYMENT';

export type RecordPaymentResult =
  | { ok: true; paymentId: string }
  | {
      ok: false;
      error: RecordPaymentError;
      detail?: Record<string, unknown>;
    };

/**
 * Inserts a Payment row + runs allocation. Validates, invalidates the
 * monthly revenue cache, returns the new paymentId. Auth + SMS + log are
 * the caller's responsibility (see header for the rationale).
 */
export async function recordPayment(
  input: RecordPaymentInput,
  options: RecordPaymentOptions = {},
): Promise<RecordPaymentResult> {
  const client: PrismaLike = options.client ?? prisma;
  const trustedAmount = options.trustedAmount === true;

  // ── Input validation ───────────────────────────────────────────────────
  const parsedAmount = Number(input.amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    return { ok: false, error: 'INVALID_AMOUNT' };
  }
  if (!VALID_PAYMENT_METHODS.includes(input.paymentMethod)) {
    return { ok: false, error: 'INVALID_PAYMENT_METHOD' };
  }
  const paymentDate = input.paymentDate ?? new Date();
  if (!(paymentDate instanceof Date) || Number.isNaN(paymentDate.getTime())) {
    return { ok: false, error: 'INVALID_PAYMENT_DATE' };
  }

  // ── Invoice existence + status guard ────────────────────────────────────
  // Use the caller's prefetched invoice when supplied (Site A already
  // fetched for cross-role + SMS ; Site B just created it in a tx). Avoids
  // a redundant SELECT on the payment hot path.
  const invoice: PrefetchedInvoice | null = options.prefetchedInvoice
    ?? (await client.invoice.findUnique({
      where: { id: input.invoiceId },
      select: {
        id: true,
        status: true,
        amount: true,
        payments: { select: { amount: true } },
      },
    }));
  if (!invoice) {
    return { ok: false, error: 'INVOICE_NOT_FOUND' };
  }
  if (invoice.status === 'CANCELLED') {
    return { ok: false, error: 'INVOICE_CANCELLED' };
  }

  // ── Overpayment guard (unless trustedAmount) ────────────────────────────
  if (!trustedAmount) {
    const alreadyPaid = invoice.payments.reduce((s, p) => s + toNumber(p.amount), 0);
    const invoiceTotal = toNumber(invoice.amount);
    if (alreadyPaid + parsedAmount > invoiceTotal + 0.01) {
      return {
        ok: false,
        error: 'OVERPAYMENT',
        detail: { invoiceTotal, alreadyPaid, attempted: parsedAmount },
      };
    }
  }

  // ── Insert Payment + allocate ─────────────────────────────────────────
  const payment = await client.payment.create({
    data: {
      invoiceId: input.invoiceId,
      amount: parsedAmount,
      paymentMethod: input.paymentMethod,
      paymentDate,
      notes: typeof input.notes === 'string' ? input.notes.trim() || null : null,
    },
    select: { id: true },
  });
  // allocatePayments opens its OWN Prisma transaction (Serializable). It
  // intentionally uses the global `prisma` client so its tx is independent
  // from `client`/`options.client` — calling it inside a parent tx would
  // deadlock against the Invoice row our parent already holds.
  await allocatePayments(input.invoiceId);

  // ── Revenue cache invalidation (fail-open) ─────────────────────────────
  // Casa-anchored cache key — the consumer (`revenueByCategoryProrata`
  // and the MV) writes keys for the Casa calendar month. Using
  // `paymentDate.getMonth()` on a UTC runtime would invalidate the
  // PREVIOUS Casa month for payments timestamped between 23:00–00:00
  // UTC on the last day, leaving the real Casa-month cache stale.
  // See docs/BUSINESS_RULES.md §6.
  const { year: yyyy, month: mm } = casablancaYMD(paymentDate);
  await cacheDel(`revenue:${yyyy}:${mm}`);

  return { ok: true, paymentId: payment.id };
}
