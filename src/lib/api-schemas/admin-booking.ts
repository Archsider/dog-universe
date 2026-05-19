// Shared schema + types for POST /api/admin/bookings (admin creates a
// booking on behalf of a client or walks in someone "de passage").
//
// The actual Zod schema lives in `src/lib/validation.ts` (historical
// home, also used by withSchema in the route). This file re-exports
// it under the api-schemas convention + ships the error code union.

import type { z } from 'zod';
import { adminBookingCreateSchema } from '../validation';

export { adminBookingCreateSchema };
export type AdminBookingCreateBody = z.infer<typeof adminBookingCreateSchema>;

export interface AdminBookingCreateSuccess {
  ok: true;
  bookingId: string;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
}

export type AdminBookingCreateErrorCode =
  | 'INVALID_BODY'
  | 'INVALID_JSON'
  // Date / structural validations
  | 'INVALID_DATE_RANGE'
  | 'END_DATE_REQUIRED_FOR_COMPLETED'
  | 'OPEN_ENDED_CANNOT_BE_PENDING'
  | 'WALKIN_OPENENDED_WITH_COMPLETED'
  | 'FINAL_AMOUNT_REQUIRED'
  // Identity
  | 'CLIENT_NOT_FOUND'
  | 'PETS_NOT_FOUND'
  // Capacity
  | 'CAPACITY_EXCEEDED'
  | 'CAPACITY_OVERRIDE_REQUIRED'
  // Taxi
  | 'SUNDAY_NOT_ALLOWED'
  | 'INVALID_TIME_SLOT'
  // Generic
  | 'CONFLICT'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN';
