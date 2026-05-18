// Typed client re-exports.
// Import from '@/lib/api-client' rather than the per-route files —
// the bundler will tree-shake unused fetchers.

export { apiPost, type ApiResult, type ApiError } from './fetcher';
export { createWalkinInvoice } from './walkin-invoice';
export { recordInvoicePayment } from './record-payment';
export { cancelInvoice } from './cancel-invoice';
