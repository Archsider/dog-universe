// Shared schema + types for POST /api/admin/bookings/[id]/cancel.

import { z } from 'zod';

export const cancelBookingBodySchema = z
  .object({
    reason: z
      .string()
      .trim()
      .min(10, 'reason must be ≥ 10 chars')
      .max(2000),
    /** When true, no notification is sent to the client (silent admin cancel
     *  for data cleanup). Defaults to false (the client is informed). */
    silent: z.boolean().optional(),
  })
  .strict();

export type CancelBookingBody = z.infer<typeof cancelBookingBodySchema>;

export interface CancelBookingSuccess {
  ok: true;
  timeProposalsSuperseded: number;
}

export type CancelBookingErrorCode =
  | 'INVALID_BODY'
  | 'INVALID_JSON'
  | 'BOOKING_NOT_FOUND'
  | 'CROSS_ROLE_FORBIDDEN'
  | 'INVALID_STATUS_TRANSITION'
  | 'VERSION_CONFLICT'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN';
