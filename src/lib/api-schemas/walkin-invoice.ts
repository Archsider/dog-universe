// Shared schemas + types for POST /api/admin/walkin-invoice.
// Imported by both the route handler (server-side `.parse()`) and the
// typed client fetcher (browser pre-flight validation + response typing).

import { z } from 'zod';

export const WALKIN_ITEM_CATEGORIES = [
  'BOARDING',
  'PET_TAXI',
  'GROOMING',
  'PRODUCT',
  'OTHER',
  'DISCOUNT',
] as const;
export type WalkinItemCategory = (typeof WALKIN_ITEM_CATEGORIES)[number];

export const WALKIN_PAYMENT_METHODS = ['CASH', 'CARD', 'CHECK', 'TRANSFER'] as const;
export type WalkinPaymentMethod = (typeof WALKIN_PAYMENT_METHODS)[number];

export const walkinInvoiceItemSchema = z
  .object({
    category: z.enum(WALKIN_ITEM_CATEGORIES),
    description: z.string().trim().min(1).max(200),
    quantity: z.number().int().positive().max(9999),
    // DISCOUNT items have negative unitPrice ; others non-negative.
    unitPrice: z.number().finite(),
    // Required when category='PRODUCT' (mirrors the DB CHECK constraint
    // `InvoiceItem_product_category_has_productId`).
    productId: z.string().min(1).nullable().optional(),
  })
  .strict()
  .refine(
    (it) => (it.category === 'DISCOUNT' ? it.unitPrice < 0 : it.unitPrice >= 0),
    { message: 'DISCOUNT items must have negative unitPrice ; other items must be non-negative' },
  )
  .refine(
    (it) =>
      it.category !== 'PRODUCT' || (typeof it.productId === 'string' && it.productId.length > 0),
    { message: 'PRODUCT_CATEGORY_REQUIRES_PRODUCT_ID', path: ['productId'] },
  );

export type WalkinInvoiceItem = z.infer<typeof walkinInvoiceItemSchema>;

export const walkinInvoiceBodySchema = z
  .object({
    clientId: z.string().cuid().nullable().optional(),
    clientName: z.string().trim().min(1).max(120).nullable().optional(),
    /** ISO datetime ; defaults to now when omitted. */
    paymentDate: z.string().datetime().optional(),
    paymentMethod: z.enum(WALKIN_PAYMENT_METHODS),
    items: z.array(walkinInvoiceItemSchema).min(1).max(50),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();

export type WalkinInvoiceBody = z.infer<typeof walkinInvoiceBodySchema>;

// ---- Response types -------------------------------------------------------

export interface WalkinInvoiceSuccess {
  ok: true;
  bookingId: string;
  invoiceId: string;
  invoiceNumber: string;
  /** Present only when the request was replayed via Idempotency-Key. */
  replay?: boolean;
}

/**
 * Tight union of every `error` code the route can return. Adding a new
 * branch in the route handler MUST add the code here — every consumer
 * gets a compile error on its switch/match until updated.
 */
export type WalkinInvoiceErrorCode =
  | 'INVALID_BODY'
  | 'INVALID_JSON'
  | 'INVALID_PAYMENT_DATE'
  | 'TOTAL_MUST_BE_POSITIVE'
  | 'IDEMPOTENCY_KEY_REQUIRED'
  | 'IDEMPOTENCY_KEY_INVALID'
  | 'CLIENT_NOT_FOUND'
  | 'INVOICE_SEQUENCE_FAILED'
  | 'PAYMENT_FAILED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN';
