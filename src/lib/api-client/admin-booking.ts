// Typed client for POST /api/admin/bookings.

import { apiPost, type ApiResult } from './fetcher';
import {
  adminBookingCreateSchema,
  type AdminBookingCreateBody,
  type AdminBookingCreateSuccess,
  type AdminBookingCreateErrorCode,
} from '../api-schemas/admin-booking';

export async function createAdminBooking(
  body: AdminBookingCreateBody,
  options: { signal?: AbortSignal } = {},
): Promise<ApiResult<AdminBookingCreateSuccess, AdminBookingCreateErrorCode>> {
  return apiPost<
    typeof adminBookingCreateSchema,
    AdminBookingCreateSuccess,
    AdminBookingCreateErrorCode
  >(
    '/api/admin/bookings',
    adminBookingCreateSchema,
    body,
    { signal: options.signal },
  );
}
