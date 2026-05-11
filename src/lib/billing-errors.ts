/**
 * H10 — Translate the Postgres CHECK violation
 *   CONSTRAINT "Invoice_paid_lte_amount" CHECK (status = 'CANCELLED' OR paidAmount <= amount + 0.01)
 * into a user-friendly 409 response.
 *
 * The trigger `trg_recompute_invoice_amount` recomputes `Invoice.amount` from
 * SUM(InvoiceItem.total) inside the same statement as the InvoiceItem mutation
 * — meaning a PATCH/DELETE on an InvoiceItem whose removal/discount would push
 * `amount` below the already-collected `paidAmount` raises P2010 (raw query
 * failed) wrapping a CHECK violation.
 *
 * We surface that to the admin so they know to issue a credit note first
 * instead of seeing a generic 500.
 */
export const PAID_EXCEEDS_PAYLOAD = {
  error: 'PAID_EXCEEDS_NEW_TOTAL',
  message: 'Le montant payé dépasserait le nouveau total — créditez un avoir avant.',
} as const;

const CHECK_NAMES = [
  'Invoice_paid_lte_amount',
  'Invoice_amount_nonneg',
];

export function isPaidExceedsCheckViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as {
    code?: string;
    message?: string;
    meta?: { constraint?: string; cause?: string };
  };
  // Prisma surfaces this as P2010 (raw failed) or P2002/P2003 wrappers, plus
  // an embedded message containing the constraint name.
  const haystack = `${e.message ?? ''} ${e.meta?.constraint ?? ''} ${e.meta?.cause ?? ''}`;
  return CHECK_NAMES.some((c) => haystack.includes(c));
}
