// Typed client for POST /api/admin/invoices/[id]/cancel.

import { apiPost, type ApiResult } from './fetcher';
import {
  cancelInvoiceBodySchema,
  type CancelInvoiceBody,
  type CancelInvoiceSuccess,
  type CancelInvoiceErrorCode,
} from '../api-schemas/cancel-invoice';

export async function cancelInvoice(
  invoiceId: string,
  body: CancelInvoiceBody,
  options: { signal?: AbortSignal } = {},
): Promise<ApiResult<CancelInvoiceSuccess, CancelInvoiceErrorCode>> {
  return apiPost<typeof cancelInvoiceBodySchema, CancelInvoiceSuccess, CancelInvoiceErrorCode>(
    `/api/admin/invoices/${encodeURIComponent(invoiceId)}/cancel`,
    cancelInvoiceBodySchema,
    body,
    { signal: options.signal },
  );
}
