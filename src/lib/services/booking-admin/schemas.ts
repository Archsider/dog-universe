/**
 * Zod schemas for the admin booking PATCH route.
 *
 * Centralised here so the route handler stays a thin dispatcher and so the
 * discriminator whitelist is reviewable in one place. Per-branch payloads are
 * still validated downstream inside their own service (each service knows its
 * own contract better than the envelope).
 */
import { z } from 'zod';

export const VALID_BOOKING_STATUSES = [
  'PENDING', 'CONFIRMED', 'AT_PICKUP', 'IN_PROGRESS',
  'CANCELLED', 'REJECTED', 'COMPLETED', 'NO_SHOW',
  'WAITLIST', 'PENDING_EXTENSION',
] as const;

export const adminBookingPatchSchema = z
  .object({
    status: z.enum(VALID_BOOKING_STATUSES).optional(),
    notes: z.string().optional(),
    version: z.number().int().optional(),
    cancellationReason: z.string().optional(),
    // Discriminator branches — each one's payload is validated by its own
    // service downstream. We accept `unknown` here only to gate the field name.
    patchBoardingDetail: z.unknown().optional(),
    addBookingItems: z.unknown().optional(),
    approveExtension: z.unknown().optional(),
    rejectExtension: z.unknown().optional(),
    editDates: z.unknown().optional(),
    extendEndDate: z.unknown().optional(),
    forcePaidInvoice: z.unknown().optional(),
  })
  .strict();

export const adminBookingParamsSchema = z.object({ id: z.string().min(1) });

export type AdminBookingPatchBody = z.infer<typeof adminBookingPatchSchema>;
