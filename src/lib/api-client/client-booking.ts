// Typed client for POST /api/bookings.

import { apiPost, type ApiResult } from './fetcher';
import {
  bookingCreateSchema,
  type ClientBookingCreateBody,
  type ClientBookingCreateSuccess,
  type ClientBookingCreateErrorCode,
} from '../api-schemas/client-booking';

function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `bk-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function createClientBooking(
  body: ClientBookingCreateBody,
  options: { idempotencyKey?: string; signal?: AbortSignal } = {},
): Promise<ApiResult<ClientBookingCreateSuccess, ClientBookingCreateErrorCode>> {
  const key = options.idempotencyKey ?? newIdempotencyKey();
  return apiPost<
    typeof bookingCreateSchema,
    ClientBookingCreateSuccess,
    ClientBookingCreateErrorCode
  >(
    '/api/bookings',
    bookingCreateSchema,
    body,
    {
      headers: { 'Idempotency-Key': key },
      signal: options.signal,
    },
  );
}
