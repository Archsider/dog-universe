// Shared schemas + types for POST /api/invoices/[id]/payments.
// Used by `submit-payment.ts` (admin) and `use-invoice-detail.ts` (admin),
// and by the route handler for `.parse()`.

import { z } from 'zod';

export const PAYMENT_METHODS = ['CASH', 'CARD', 'CHECK', 'TRANSFER'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const recordPaymentBodySchema = z
  .object({
    amount: z.number().finite().positive().max(99_999_999.99),
    paymentMethod: z.enum(PAYMENT_METHODS),
    /**
     * Accepts both ISO datetime (`2026-05-18T10:00:00Z`) and the simpler
     * `YYYY-MM-DD` form used by `<input type="date">`. Server normalizes
     * via `new Date()`.
     */
    paymentDate: z.string().min(1).optional(),
    notes: z.string().max(2000).nullable().optional(),
    /**
     * UI toggle from PaymentModal (ADR-0008 respectful SMS policy).
     * Default `true` — older clients without the flag keep prior behaviour.
     */
    sendClientSms: z.boolean().optional(),
  })
  .strict();

export type RecordPaymentBody = z.infer<typeof recordPaymentBodySchema>;

// ---- Response types -------------------------------------------------------

/**
 * The route returns the updated Invoice with items + payments + client.
 * Modeled here as a lightweight shape — the caller typically only
 * cares about `id`, `status`, `amount`, `paidAmount`, and the latest
 * payment row. If a consumer needs more, prefer reading directly from
 * the response and extending this interface.
 */
export interface RecordPaymentSuccess {
  id: string;
  invoiceNumber: string | null;
  status: 'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED';
  amount: number | string;
  paidAmount: number | string;
  paidAt: string | null;
  items?: Array<unknown>;
  payments?: Array<unknown>;
  client?: { id: string; name: string | null; email: string | null };
}

export type RecordPaymentErrorCode =
  | 'INVALID_AMOUNT'
  | 'INVALID_PAYMENT_METHOD'
  | 'INVALID_PAYMENT_DATE'
  | 'INVOICE_NOT_FOUND'
  | 'INVOICE_CANCELLED'
  | 'OVERPAYMENT'
  | 'DUPLICATE_REQUEST'
  | 'IDEMPOTENCY_KEY_INVALID'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  /** Legacy "Not found" body still emitted by the route. */
  | 'Not found';
