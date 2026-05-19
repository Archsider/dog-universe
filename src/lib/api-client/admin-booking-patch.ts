// Typed client for PATCH /api/admin/bookings/[id].

import { apiPatch, type ApiResult } from './fetcher';
import {
  adminBookingPatchSchema,
  type AdminBookingPatchBody,
  type AdminBookingPatchSuccess,
  type AdminBookingPatchErrorCode,
} from '../api-schemas/admin-booking-patch';

export async function patchAdminBooking(
  bookingId: string,
  body: AdminBookingPatchBody,
  options: { signal?: AbortSignal } = {},
): Promise<ApiResult<AdminBookingPatchSuccess, AdminBookingPatchErrorCode>> {
  return apiPatch<
    typeof adminBookingPatchSchema,
    AdminBookingPatchSuccess,
    AdminBookingPatchErrorCode
  >(
    `/api/admin/bookings/${encodeURIComponent(bookingId)}`,
    adminBookingPatchSchema,
    body,
    { signal: options.signal },
  );
}
