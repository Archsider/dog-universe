// Typed client for POST /api/invoices/[id]/payments.

import { apiPost, type ApiResult } from './fetcher';
import {
  recordPaymentBodySchema,
  type RecordPaymentBody,
  type RecordPaymentSuccess,
  type RecordPaymentErrorCode,
} from '../api-schemas/record-payment';

function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `pay-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function recordInvoicePayment(
  invoiceId: string,
  body: RecordPaymentBody,
  options: { idempotencyKey?: string; signal?: AbortSignal } = {},
): Promise<ApiResult<RecordPaymentSuccess, RecordPaymentErrorCode>> {
  const key = options.idempotencyKey ?? newIdempotencyKey();
  return apiPost<typeof recordPaymentBodySchema, RecordPaymentSuccess, RecordPaymentErrorCode>(
    `/api/invoices/${encodeURIComponent(invoiceId)}/payments`,
    recordPaymentBodySchema,
    body,
    {
      headers: { 'Idempotency-Key': key },
      signal: options.signal,
    },
  );
}
