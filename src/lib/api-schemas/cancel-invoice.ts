// Shared schemas + types for POST /api/admin/invoices/[id]/cancel.
// Used by `CancelInvoiceModal.tsx` and the route handler.

import { z } from 'zod';

export const REFUND_PAYMENT_METHODS = ['CASH', 'CARD', 'CHECK', 'TRANSFER'] as const;
export type RefundPaymentMethod = (typeof REFUND_PAYMENT_METHODS)[number];

export const cancelInvoiceBodySchema = z
  .object({
    reason: z.string().trim().min(10, 'reason ≥ 10 chars required').max(2000),
    /** Required when the invoice has paidAmount > 0. */
    refundExisting: z.boolean().optional(),
    paymentMethodForRefund: z.enum(REFUND_PAYMENT_METHODS).optional(),
    /** Skip the client notification (silent admin cancel for data cleanup). */
    silent: z.boolean().optional(),
  })
  .strict();

export type CancelInvoiceBody = z.infer<typeof cancelInvoiceBodySchema>;

// ---- Response types -------------------------------------------------------

export interface CancelInvoiceSuccess {
  ok: true;
  invoiceId: string;
  invoiceNumber: string;
  previousStatus: 'PENDING' | 'PARTIALLY_PAID' | 'PAID';
  bookingItemsUnlinked: number;
}

export type CancelInvoiceErrorCode =
  | 'INVALID_BODY'
  | 'INVALID_JSON'
  | 'INVOICE_NOT_FOUND'
  | 'ALREADY_CANCELLED'
  | 'CROSS_ROLE_FORBIDDEN'
  | 'PAID_INVOICE_REQUIRES_REFUND'
  | 'VERSION_CONFLICT'
  | 'INVALID_REASON'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN';
