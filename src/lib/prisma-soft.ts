// Soft-delete helpers — Dog Universe never hard-deletes a User, Pet, or
// Booking. The convention is to set `deletedAt = now()` and filter every
// read with `{ deletedAt: null }`.
//
// This file centralises the filter so we can:
//   1. Search a single name (`notDeleted()`) instead of grepping for the
//      raw `deletedAt: null` literal (~170 inline occurrences).
//   2. Compose with other where clauses without forgetting the filter.
//   3. Provide a typed shorthand that documents the intent at the call
//      site (`where: notDeleted({ role: 'CLIENT' })` reads as "active
//      clients", not as "rows where role = CLIENT … oh and not deleted").
//
// Why we don't use a Prisma extension (`$extends`):
//   The middleware path runs through Edge Runtime, which fails to load
//   Prisma extensions reliably (see RISQUES CONNUS in CLAUDE.md). The
//   manual `deletedAt: null` pattern is intentional and supported.

// We type the input as a loose record + an optional deletedAt field. The
// Prisma where-input on User/Pet/Booking always allows extra keys, so a
// strict structural type would fight every call site. We trust the caller
// to pass a real Prisma where clause — the helper's only job is to inject
// `deletedAt: null` when it's not already specified.
type WithSoftDelete = Record<string, unknown> & {
  deletedAt?: unknown;
};

/**
 * Composes a `where` clause that includes `deletedAt: null` while
 * preserving any existing fields. If the caller already passes an
 * explicit `deletedAt` (eg. to query trash), it wins — we never silently
 * override an explicit decision.
 *
 * Examples:
 *   prisma.user.findMany({ where: notDeleted({ role: 'CLIENT' }) })
 *   prisma.pet.findFirst({ where: notDeleted({ id: petId }) })
 *   prisma.booking.count({ where: notDeleted({ status: 'PENDING' }) })
 *
 * Generic on T so the inferred return type matches the call site's
 * Prisma where-input.
 */
export function notDeleted<T extends WithSoftDelete>(where?: T): T {
  if (!where) return { deletedAt: null } as T;
  if ('deletedAt' in where && where.deletedAt !== undefined) return where;
  return { ...where, deletedAt: null };
}

/**
 * Inverse helper — returns the `where` clause for **only** soft-deleted
 * rows (the "trash" view). Used by recovery flows in `/admin/users`.
 */
export function onlyDeleted<T extends WithSoftDelete>(where?: T): T {
  if (!where) return { deletedAt: { not: null } } as T;
  if ('deletedAt' in where && where.deletedAt !== undefined) return where;
  return { ...where, deletedAt: { not: null } };
}
