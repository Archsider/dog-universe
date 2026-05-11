/**
 * Typo-safe constants for `Booking.serviceType` values.
 *
 * Prisma stores `serviceType` as a `String` column (not an enum), so the
 * generated `@prisma/client` does not expose a `ServiceType` enum. Use this
 * const object instead of inline string literals — typos become compile errors
 * and call sites are grep-able.
 */
export const ServiceType = {
  BOARDING: 'BOARDING',
  PET_TAXI: 'PET_TAXI',
} as const;

export type ServiceType = typeof ServiceType[keyof typeof ServiceType];
