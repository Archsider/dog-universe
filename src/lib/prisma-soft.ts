/**
 * Soft-delete helpers for Dog Universe.
 *
 * WHY explicit filters instead of a Prisma $extends extension:
 * The Next.js middleware (src/middleware.ts) imports auth.ts which imports
 * prisma.ts. The middleware runs in Vercel Edge Runtime, which does not
 * support Node.js internals used by Prisma's $extends() mechanism.
 * Using $extends at module level caused MIDDLEWARE_INVOCATION_FAILED in
 * production (incident: 2026-04-28, commit 3477025).
 *
 * Solution: every findMany / findFirst that touches soft-deletable models
 * (User, Pet, Booking) MUST include { deletedAt: null } in the where clause.
 * This file documents that contract and provides a typed helper for the
 * where clause fragment.
 */

/** Models that support soft-delete via the deletedAt field. */
export const SOFT_DELETE_MODELS = ['User', 'Pet', 'Booking'] as const;
export type SoftDeleteModel = (typeof SOFT_DELETE_MODELS)[number];

/**
 * Returns the standard soft-delete filter fragment.
 * Use in findMany / findFirst where clauses on soft-deletable models.
 *
 * @example
 * prisma.booking.findMany({ where: { ...notDeleted(), clientId } })
 */
export function notDeleted(): { deletedAt: null } {
  return { deletedAt: null };
}
