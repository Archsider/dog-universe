// Typed client for POST /api/admin/walkin-invoice.

import { apiPost, type ApiResult } from './fetcher';
import {
  walkinInvoiceBodySchema,
  type WalkinInvoiceBody,
  type WalkinInvoiceSuccess,
  type WalkinInvoiceErrorCode,
} from '../api-schemas/walkin-invoice';

function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '');
  }
  return `walkin_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
}

export async function createWalkinInvoice(
  body: WalkinInvoiceBody,
  options: { idempotencyKey?: string; signal?: AbortSignal } = {},
): Promise<ApiResult<WalkinInvoiceSuccess, WalkinInvoiceErrorCode>> {
  const key = options.idempotencyKey ?? newIdempotencyKey();
  return apiPost<typeof walkinInvoiceBodySchema, WalkinInvoiceSuccess, WalkinInvoiceErrorCode>(
    '/api/admin/walkin-invoice',
    walkinInvoiceBodySchema,
    body,
    {
      headers: { 'Idempotency-Key': key },
      signal: options.signal,
    },
  );
}
