// Shared schema + types for PATCH /api/admin/bookings/[id].
//
// The envelope schema lives in `src/lib/services/booking-admin/schemas.ts`
// (historic home, used by `withSchema` in the route). Per-branch payloads
// are validated by the corresponding service downstream — see the README
// in `src/lib/services/booking-admin/`. This file re-exports under the
// api-schemas convention + ships the error code union.

import type { z } from 'zod';
import {
  adminBookingPatchSchema,
  VALID_BOOKING_STATUSES,
} from '../services/booking-admin/schemas';

export { adminBookingPatchSchema, VALID_BOOKING_STATUSES };
export type AdminBookingPatchBody = z.infer<typeof adminBookingPatchSchema>;
export type BookingStatus = (typeof VALID_BOOKING_STATUSES)[number];

/**
 * The PATCH route is multi-purpose — it can update status, edit dates,
 * patch the boarding detail, add items, approve/reject extensions… The
 * success shape is largely opaque from the client's perspective (the
 * caller's UI typically just refreshes after success).
 */
export interface AdminBookingPatchSuccess {
  ok?: true;
  booking?: unknown;
  /** Some branches return additional metadata (extension flow, etc.). */
  [extra: string]: unknown;
}

export type AdminBookingPatchErrorCode =
  | 'INVALID_BODY'
  | 'INVALID_JSON'
  | 'NOT_FOUND'
  | 'BOOKING_NOT_FOUND'
  // Status transition
  | 'INVALID_STATUS_TRANSITION'
  | 'CANCELLATION_REASON_REQUIRED'
  // Optimistic lock
  | 'VERSION_CONFLICT'
  // Capacity
  | 'CAPACITY_EXCEEDED'
  | 'CAPACITY_OVERRIDE_REQUIRED'
  // Cross-role
  | 'CROSS_ROLE_FORBIDDEN'
  | 'FORBIDDEN'
  | 'UNAUTHORIZED'
  // Per-branch errors
  | 'ONLY_BOARDING'
  | 'INVALID_FIELDS'
  | 'NO_PENDING_EXTENSION'
  | 'EXTENSION_TARGET_NOT_FOUND'
  | 'INVALID_DATE_RANGE';
