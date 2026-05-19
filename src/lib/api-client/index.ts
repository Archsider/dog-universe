// Typed client re-exports.
// Import from '@/lib/api-client' rather than the per-route files —
// the bundler will tree-shake unused fetchers.

export { apiPost, apiPatch, type ApiResult, type ApiError } from './fetcher';
export { createWalkinInvoice } from './walkin-invoice';
export { recordInvoicePayment } from './record-payment';
export { cancelInvoice } from './cancel-invoice';
export { cancelBooking } from './cancel-booking';
export { submitTimeProposal } from './time-proposals';
export { createAdminBooking } from './admin-booking';
export { patchAdminBooking } from './admin-booking-patch';
export { createClientBooking } from './client-booking';
export { createInvoice, patchInvoice } from './invoice';
