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

// We intentionally avoid a structural constraint (`T extends Record<...>`)
// because that pollutes literal-type inference: a call like
// `notDeleted({ status: 'CONFIRMED' })` would widen `'CONFIRMED'` to
// `string` and fail Prisma's enum-typed `where`. Using a plain unconstrained
// generic preserves the exact input shape, and the intersection with
// `{ deletedAt: null }` adds the field without re-widening.

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
 */
export function notDeleted(): { deletedAt: null };
export function notDeleted<const T extends object>(where: T): T & { deletedAt: null };
export function notDeleted<const T extends object>(where?: T): T & { deletedAt: null } {
  if (!where) return { deletedAt: null } as T & { deletedAt: null };
  if ('deletedAt' in where && (where as { deletedAt?: unknown }).deletedAt !== undefined) {
    return where as T & { deletedAt: null };
  }
  return { ...where, deletedAt: null };
}

/**
 * Reachable-user filter — combines `deletedAt: null` AND
 * `anonymizedAt: null`.  Use this on every cron / notification dispatch
 * that targets a User : an anonymized user has their email and phone
 * wiped (or replaced with a synthetic placeholder), so any email/SMS
 * we'd send would bounce or fail silently.  RGPD audit invariant.
 *
 * Example :
 *   prisma.booking.findMany({
 *     where: { ...notDeleted(), client: contactable() }
 *   })
 */
export function contactable(): { deletedAt: null; anonymizedAt: null } {
  return { deletedAt: null, anonymizedAt: null };
}

/**
 * Inverse helper — returns the `where` clause for **only** soft-deleted
 * rows (the "trash" view). Used by recovery flows in `/admin/users`.
 */
export function onlyDeleted(): { deletedAt: { not: null } };
export function onlyDeleted<const T extends object>(where: T): T & { deletedAt: { not: null } };
export function onlyDeleted<const T extends object>(where?: T): T & { deletedAt: { not: null } } {
  if (!where) return { deletedAt: { not: null } } as T & { deletedAt: { not: null } };
  if ('deletedAt' in where && (where as { deletedAt?: unknown }).deletedAt !== undefined) {
    return where as T & { deletedAt: { not: null } };
  }
  return { ...where, deletedAt: { not: null } };
}
