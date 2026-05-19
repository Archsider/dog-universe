// Shared schemas + types for POST /api/invoices and PATCH /api/invoices/[id].
//
// Both routes did manual validation pre-PR — extracted to Zod here so the
// client can pre-validate AND the route handler can use the same schema for
// .parse() (defense in depth on top of the existing route-level business
// checks like idempotency, cross-role gates, stock locking).

import { z } from 'zod';

export const INVOICE_ITEM_CATEGORIES = [
  'BOARDING',
  'PET_TAXI',
  'GROOMING',
  'PRODUCT',
  'OTHER',
  'DISCOUNT',
] as const;
export type InvoiceItemCategory = (typeof INVOICE_ITEM_CATEGORIES)[number];

export const INVOICE_PAYMENT_METHODS = ['CASH', 'CARD', 'CHECK', 'TRANSFER'] as const;
export type InvoicePaymentMethod = (typeof INVOICE_PAYMENT_METHODS)[number];

export const INVOICE_SERVICE_TYPES = ['BOARDING', 'PET_TAXI', 'GROOMING', 'PRODUCT_SALE'] as const;
export type InvoiceServiceType = (typeof INVOICE_SERVICE_TYPES)[number];

export const INVOICE_STATUSES = ['PENDING', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

// ---- Item schema (shared between POST and PATCH) --------------------------

export const invoiceItemSchema = z
  .object({
    description: z.string().trim().min(1).max(500),
    quantity: z.number().int().positive().max(9999),
    unitPrice: z.number().finite(),
    /** POST requires `total` (precomputed by client). PATCH derives it. */
    total: z.number().finite().optional(),
    category: z.enum(INVOICE_ITEM_CATEGORIES).optional(),
    productId: z.string().min(1).nullable().optional(),
  })
  .strict()
  .refine(
    (it) => (it.category === 'DISCOUNT' ? it.unitPrice < 0 : it.unitPrice >= 0),
    { message: 'DISCOUNT items must have negative unitPrice ; others must be non-negative' },
  )
  .refine(
    (it) =>
      it.category !== 'PRODUCT' || (typeof it.productId === 'string' && it.productId.length > 0),
    { message: 'PRODUCT_CATEGORY_REQUIRES_PRODUCT_ID', path: ['productId'] },
  );

export type InvoiceItem = z.infer<typeof invoiceItemSchema>;

// ---- POST /api/invoices ---------------------------------------------------

export const createInvoiceBodySchema = z
  .object({
    clientId: z.string().min(1),
    bookingId: z.string().min(1).optional().nullable(),
    items: z.array(invoiceItemSchema).min(1).max(50),
    notes: z.string().max(2000).optional().nullable(),
    serviceType: z.enum(INVOICE_SERVICE_TYPES).optional(),
    /** ISO datetime — defaults to now on the server. */
    issuedAt: z.string().min(1).optional(),
    /** When true, also creates a Payment row + flips status to PAID. */
    markPaid: z.boolean().optional(),
    paymentMethod: z.enum(INVOICE_PAYMENT_METHODS).optional(),
    paidAt: z.string().min(1).optional().nullable(),
  })
  .strict()
  .refine(
    (b) => !(b.markPaid === true && !b.paymentMethod),
    { message: 'paymentMethod required when markPaid=true', path: ['paymentMethod'] },
  );

export type CreateInvoiceBody = z.infer<typeof createInvoiceBodySchema>;

export interface CreateInvoiceSuccess {
  id: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  amount: number | string;
  paidAmount?: number | string;
  /** Items + payments embedded — caller can introspect if needed. */
  items?: unknown[];
  payments?: unknown[];
}

export type CreateInvoiceErrorCode =
  | 'INVALID_BODY'
  | 'INVALID_JSON'
  | 'MISSING_FIELDS'
  | 'INVALID_SERVICE_TYPE'
  | 'INVALID_ISSUED_AT'
  | 'INVALID_PAYMENT_METHOD'
  | 'INVALID_PAID_AT'
  | 'INVALID_ITEM_DESCRIPTION'
  | 'INVALID_ITEM_PRICE'
  | 'INVALID_ITEM_QUANTITY'
  | 'INVALID_ITEM_TOTAL'
  | 'INVALID_ITEM_CATEGORY'
  | 'INVALID_AMOUNT'
  | 'PRODUCT_CATEGORY_REQUIRES_PRODUCT_ID'
  | 'DUPLICATE_REQUEST'
  | 'IDEMPOTENCY_KEY_INVALID'
  | 'CLIENT_NOT_FOUND'
  | 'PRODUCT_NOT_FOUND'
  | 'PRODUCT_UNAVAILABLE'
  | 'OUT_OF_STOCK'
  | 'FORBIDDEN'
  | 'UNAUTHORIZED';

// ---- PATCH /api/invoices/[id] ---------------------------------------------

/**
 * The PATCH route supports two flavors of body :
 *  - Full edit : `items: [...]` provided + optional issuedAt/notes/status/
 *    clientDisplayName/...
 *  - Status-only flip : only `status` field present
 *
 * Both validated with a single permissive schema — the route's own branch
 * logic handles which fields apply.
 */
export const patchInvoiceBodySchema = z
  .object({
    /** Optimistic concurrency check. */
    version: z.number().int().optional(),
    items: z.array(invoiceItemSchema).min(1).max(50).optional(),
    issuedAt: z.string().min(1).optional(),
    notes: z.string().max(2000).optional().nullable(),
    status: z.enum(INVOICE_STATUSES).optional(),
    clientDisplayName: z.string().trim().max(150).optional().nullable(),
    clientDisplayPhone: z.string().trim().max(40).optional().nullable(),
    clientDisplayEmail: z.string().trim().max(200).optional().nullable(),
  })
  .strict();

export type PatchInvoiceBody = z.infer<typeof patchInvoiceBodySchema>;

export interface PatchInvoiceSuccess {
  id: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  version: number;
  /** May contain updated items/payments depending on the patch path. */
  [extra: string]: unknown;
}

export type PatchInvoiceErrorCode =
  | 'INVALID_BODY'
  | 'INVALID_JSON'
  | 'NOT_FOUND'
  | 'VERSION_CONFLICT'
  | 'INVALID_ITEMS'
  | 'INVALID_ITEM_DESCRIPTION'
  | 'INVALID_ITEM_QUANTITY'
  | 'INVALID_ITEM_PRICE'
  | 'INVALID_ITEM_CATEGORY'
  | 'DISCOUNT_REQUIRES_NEGATIVE_PRICE'
  | 'PRODUCT_CATEGORY_REQUIRES_PRODUCT_ID'
  | 'INVALID_STATUS'
  | 'FORBIDDEN'
  | 'UNAUTHORIZED';
