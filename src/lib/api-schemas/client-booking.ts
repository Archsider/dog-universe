// Shared schema + types for POST /api/bookings (client creates a booking
// for themselves, or admin via clientId override).
//
// The Zod schema lives in `src/lib/validation.ts` (historic home, used by
// withSchema in the route). This file re-exports under the api-schemas
// convention + ships the error code union.

import type { z } from 'zod';
import { bookingCreateSchema } from '../validation';

export { bookingCreateSchema };
export type ClientBookingCreateBody = z.infer<typeof bookingCreateSchema>;

export interface ClientBookingCreateSuccess {
  ok?: true;
  id?: string;
  bookingId?: string;
  status?: string;
  /** Various fields returned by the route (booking, invoice ref, etc.). */
  [extra: string]: unknown;
}

export type ClientBookingCreateErrorCode =
  | 'INVALID_BODY'
  | 'INVALID_JSON'
  | 'INVALID_DATE_RANGE'
  | 'DUPLICATE_REQUEST'
  | 'IDEMPOTENCY_KEY_INVALID'
  | 'CAPACITY_EXCEEDED'
  | 'PETS_NOT_FOUND'
  | 'PET_NOT_OWNED'
  | 'SUNDAY_NOT_ALLOWED'
  | 'INVALID_TIME_SLOT'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN';
