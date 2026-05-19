// Typed client for POST /api/admin/bookings/[id]/cancel.

import { apiPost, type ApiResult } from './fetcher';
import {
  cancelBookingBodySchema,
  type CancelBookingBody,
  type CancelBookingSuccess,
  type CancelBookingErrorCode,
} from '../api-schemas/cancel-booking';

export async function cancelBooking(
  bookingId: string,
  body: CancelBookingBody,
  options: { signal?: AbortSignal } = {},
): Promise<ApiResult<CancelBookingSuccess, CancelBookingErrorCode>> {
  return apiPost<typeof cancelBookingBodySchema, CancelBookingSuccess, CancelBookingErrorCode>(
    `/api/admin/bookings/${encodeURIComponent(bookingId)}/cancel`,
    cancelBookingBodySchema,
    body,
    { signal: options.signal },
  );
}
