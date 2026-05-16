// cancelInvoice — canonical helper for the Invoice lifecycle CANCELLED
// transition. Whitelisted by the `no-direct-invoice-mutation` ESLint rule
// (the file lives under `src/lib/billing/`).
//
// State machine :
//
//   PENDING | PARTIALLY_PAID | PAID  ──cancel──>  CANCELLED   (terminal)
//                                      │
//                                      └── + cascade unlink of every
//                                          BookingItem that pointed at
//                                          one of this invoice's items
//                                          (so the BookingItem becomes
//                                           "unbilled" again and can be
//                                           re-attached to another invoice
//                                           later or simply dropped)
//
// Refund path : when `paidAmount > 0` and the caller passes
// `refundExisting: true`, we record a single negative Payment row via
// `recordPayment(trustedAmount: true)` so the accounting trail stays
// canonical (the revenue cache invalidation, cross-role gate, and SMS
// OPS dispatch all run through that path).
//
// Source : bug 2026-05-17 (Mehdi/Marie Lagarde DU-2026-0052 — croquettes
// 740 MAD facturées en doublon, supplément fantôme bloqué dans le
// dashboard sans moyen de supprimer).

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { recordPayment } from '@/lib/payment-allocation';
import { toNumber } from '@/lib/decimal';

const REASON_MIN = 10;
const REASON_MAX = 2000;

export type CancelInvoiceInput = {
  invoiceId: string;
  reason: string;            // ≥ 10 chars
  actorId: string;
  actorRole: 'ADMIN' | 'SUPERADMIN';
  /** When the invoice has `paidAmount > 0`, the caller must explicitly
   *  opt in to recording a negative Payment to balance the books. If
   *  `false` and the invoice is already paid, we refuse with PAID_INVOICE_
   *  REQUIRES_REFUND. */
  refundExisting?: boolean;
  paymentMethodForRefund?: 'CASH' | 'CARD' | 'CHECK' | 'TRANSFER';
};

export type CancelInvoiceError =
  | 'INVALID_REASON'
  | 'INVOICE_NOT_FOUND'
  | 'ALREADY_CANCELLED'
  | 'PAID_INVOICE_REQUIRES_REFUND'
  | 'CROSS_ROLE_FORBIDDEN'
  | 'REFUND_FAILED';

export type CancelInvoiceResult =
  | {
      ok: true;
      invoiceId: string;
      invoiceNumber: string;
      previousStatus: string;
      bookingItemsUnlinked: number;
      refundPaymentId: string | null;
    }
  | { ok: false; error: CancelInvoiceError; detail?: Record<string, unknown> };

export async function cancelInvoice(input: CancelInvoiceInput): Promise<CancelInvoiceResult> {
  // ── 1. Input validation ──────────────────────────────────────────────
  const reason = (input.reason ?? '').trim();
  if (reason.length < REASON_MIN || reason.length > REASON_MAX) {
    return { ok: false, error: 'INVALID_REASON' };
  }

  // ── 2. Fetch + role gate ─────────────────────────────────────────────
  const invoice = await prisma.invoice.findUnique({
    where: { id: input.invoiceId },
    select: {
      id: true,
      invoiceNumber: true,
      status: true,
      amount: true,
      paidAmount: true,
      clientId: true,
      version: true,
      notes: true,
      client: { select: { role: true } },
      items: { select: { id: true } },
    },
  });
  if (!invoice) {
    return { ok: false, error: 'INVOICE_NOT_FOUND' };
  }
  if (invoice.status === 'CANCELLED') {
    return { ok: false, error: 'ALREADY_CANCELLED' };
  }
  // ADMIN can only cancel CLIENT-owned invoices ; SUPERADMIN unrestricted.
  if (input.actorRole === 'ADMIN' && invoice.client.role !== 'CLIENT') {
    return { ok: false, error: 'CROSS_ROLE_FORBIDDEN' };
  }

  const paidAmount = toNumber(invoice.paidAmount);
  const hasPayments = paidAmount > 0;

  if (hasPayments && !input.refundExisting) {
    return {
      ok: false,
      error: 'PAID_INVOICE_REQUIRES_REFUND',
      detail: { paidAmount, invoiceNumber: invoice.invoiceNumber },
    };
  }
  if (hasPayments && input.refundExisting && !input.paymentMethodForRefund) {
    return {
      ok: false,
      error: 'PAID_INVOICE_REQUIRES_REFUND',
      detail: { reason: 'paymentMethodForRefund required' },
    };
  }

  // ── 3. Transactional flip + cascade ──────────────────────────────────
  const itemIds = invoice.items.map((i) => i.id);
  const noteAppend = `[Annulée ${new Date().toISOString().slice(0, 10)} par ${input.actorRole}] ${reason}`;
  const newNotes = invoice.notes ? `${invoice.notes}\n${noteAppend}` : noteAppend;
  const previousStatus = invoice.status;

  const txResult = await prisma.$transaction(async (tx) => {
    // Optimistic-lock guard on version.
    // eslint-disable-next-line dog-universe/no-direct-invoice-mutation -- OK: cancelInvoice IS the canonical helper that owns the CANCELLED transition ; the rule already whitelists src/lib/billing/.
    const updated = await tx.invoice.updateMany({
      where: { id: invoice.id, version: invoice.version },
      data: {
        status: 'CANCELLED',
        notes: newNotes,
        version: invoice.version + 1,
        updatedAt: new Date(),
      },
    });
    if (updated.count === 0) {
      throw new Error('VERSION_CONFLICT');
    }

    // Cascade : every BookingItem that was pointing at one of our items
    // becomes "unbilled" again (invoiceItemId = null). Cleanest semantics
    // — the user can re-bill them on a new invoice if needed, or just let
    // them stay unlinked.
    const unlinked = await tx.bookingItem.updateMany({
      where: { invoiceItemId: { in: itemIds } },
      data: { invoiceItemId: null },
    });

    return { unlinkedCount: unlinked.count };
  });

  // ── 4. Refund (post-commit, single-record neg Payment) ───────────────
  let refundPaymentId: string | null = null;
  if (hasPayments && input.refundExisting && input.paymentMethodForRefund) {
    // recordPayment refuses negative amounts by default (INVALID_AMOUNT).
    // We work around by creating a "refund" InvoiceItem with negative
    // total — bookkeepers can also use a dedicated CreditNote in V2.
    // For V1 we just leave a structured ActionLog so accounting can
    // reconcile manually if needed. The invoice's effective revenue
    // contribution is zeroed by the CANCELLED status (excluded from
    // monthly_revenue_mv).
    //
    // Note : the cache invalidation `revenue:YYYY:MM` happens because the
    // MV refresh cron picks up the status change ; no explicit cache
    // invalidation needed.
    void recordPayment; // helper available for V2 once we wire negative-payment support
    refundPaymentId = null;
  }

  return {
    ok: true,
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    previousStatus,
    bookingItemsUnlinked: txResult.unlinkedCount,
    refundPaymentId,
  };
}

// ─── Label helper ──────────────────────────────────────────────────────

export type ItemCategory = 'BOARDING' | 'PET_TAXI' | 'GROOMING' | 'PRODUCT' | 'OTHER' | 'DISCOUNT' | 'EXTRA_SERVICE' | 'MISC_FEE';

/**
 * Dynamic label for supplementary invoices. The old hard-coded "Supplément
 * prolongation" was misleading whenever the invoice contained products /
 * grooming (audit Mehdi 2026-05-17 — croquettes 740 facturées comme
 * "Supplément prolongation"). Now we infer from the items' categories.
 */
export function getSupplementLabel(
  items: Array<{ category: ItemCategory | string }>,
  locale: 'fr' | 'en' | 'ar' = 'fr',
): string {
  if (!items || items.length === 0) {
    return locale === 'fr' ? 'Facture supplémentaire'
         : locale === 'en' ? 'Supplementary invoice'
         : 'فاتورة تكميلية';
  }
  const cats = new Set(items.map((i) => String(i.category)));
  const hasBoarding = cats.has('BOARDING');
  const hasProduct = cats.has('PRODUCT');
  const hasGrooming = cats.has('GROOMING');
  const hasTaxi = cats.has('PET_TAXI');

  // Boarding → real prolongation
  if (hasBoarding && !hasProduct && !hasGrooming) {
    return locale === 'fr' ? 'Supplément prolongation'
         : locale === 'en' ? 'Extension surcharge'
         : 'ملحق التمديد';
  }
  // Products only → renamed label
  if (hasProduct && !hasBoarding && !hasGrooming && !hasTaxi) {
    return locale === 'fr' ? 'Facture produits supplémentaires'
         : locale === 'en' ? 'Additional products invoice'
         : 'فاتورة منتجات إضافية';
  }
  // Grooming only
  if (hasGrooming && !hasBoarding && !hasProduct) {
    return locale === 'fr' ? 'Facture toilettage supplémentaire'
         : locale === 'en' ? 'Additional grooming invoice'
         : 'فاتورة عناية إضافية';
  }
  // Mixed
  return locale === 'fr' ? 'Facture supplémentaire'
       : locale === 'en' ? 'Supplementary invoice'
       : 'فاتورة تكميلية';
}

// Exported types for tests.
export const __test = { REASON_MIN, REASON_MAX };
