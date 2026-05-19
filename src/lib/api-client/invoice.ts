// Typed clients for POST /api/invoices and PATCH /api/invoices/[id].

import { apiPost, apiPatch, type ApiResult } from './fetcher';
import {
  createInvoiceBodySchema,
  patchInvoiceBodySchema,
  type CreateInvoiceBody,
  type CreateInvoiceSuccess,
  type CreateInvoiceErrorCode,
  type PatchInvoiceBody,
  type PatchInvoiceSuccess,
  type PatchInvoiceErrorCode,
} from '../api-schemas/invoice';

function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `inv-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function createInvoice(
  body: CreateInvoiceBody,
  options: { idempotencyKey?: string; signal?: AbortSignal } = {},
): Promise<ApiResult<CreateInvoiceSuccess, CreateInvoiceErrorCode>> {
  // Idempotency-Key is only enforced server-side when markPaid=true, but
  // we send it on every call — saves the operator from a duplicate POST
  // if the previous response was lost in transit.
  const key = options.idempotencyKey ?? newIdempotencyKey();
  return apiPost<typeof createInvoiceBodySchema, CreateInvoiceSuccess, CreateInvoiceErrorCode>(
    '/api/invoices',
    createInvoiceBodySchema,
    body,
    {
      headers: { 'Idempotency-Key': key },
      signal: options.signal,
    },
  );
}

export async function patchInvoice(
  invoiceId: string,
  body: PatchInvoiceBody,
  options: { signal?: AbortSignal } = {},
): Promise<ApiResult<PatchInvoiceSuccess, PatchInvoiceErrorCode>> {
  return apiPatch<typeof patchInvoiceBodySchema, PatchInvoiceSuccess, PatchInvoiceErrorCode>(
    `/api/invoices/${encodeURIComponent(invoiceId)}`,
    patchInvoiceBodySchema,
    body,
    { signal: options.signal },
  );
}
