# ADR-0001 — Soft-delete via explicit `{ deletedAt: null }` filters

**Status:** Accepted
**Date:** 2026-04-15
**Deciders:** solo founder

## Context

Dog Universe handles client + pet + booking data that has legal /
accounting retention requirements. A `DELETE` button must NOT permanently
remove invoices linked to a tax-deductible operation; it also must not
break the loyalty grade aggregates that depend on historical bookings.

We need:

1. A way to "delete" a record from the user-facing UI
2. The record to remain in the DB for audit / accounting / dispute
3. Foreign-key relationships preserved (no cascading nuke)

A standard `DELETE FROM` approach would break #2 and #3.

## Decision

**We will soft-delete by setting a `deletedAt` timestamp on the row, and
filter every read with `{ deletedAt: null }` (or the helper
`notDeleted({...})` from `src/lib/prisma-soft.ts`).**

- Models with soft-delete: `User`, `Pet`, `Booking`
- DELETE handlers in API routes set `deletedAt = new Date()` instead of
  calling `prisma.X.delete()`
- All `findMany` / `findFirst` / `findUnique` queries on these models
  filter `deletedAt: null` explicitly (or via `notDeleted({ ... })`)

We do NOT use a global Prisma extension (`$extends`) for two reasons:

1. **Edge Runtime incompatibility** — the middleware path runs through
   Edge, which fails to load Prisma extensions reliably. We tried this
   in commit `0d3e8c1`, reverted in `3477025`.
2. **Visibility** — explicit filters surface the soft-delete intent at
   every call site. A reviewer immediately sees "this query intentionally
   excludes deleted users" instead of having to know about the
   middleware magic.

## Consequences

**Easier:**
- Audit / accounting compliance
- Loyalty grade computation can scan all historical rows
- Recovery flow is trivial (set `deletedAt = null`)
- Clear at every call site that we mean "active records"

**Harder:**
- Every new query must remember the filter
- A new developer who forgets the filter exposes deleted data
- ~120 inline call sites at adoption time (now mostly migrated to
  `notDeleted()` via the codemod in `scripts/codemod-not-deleted.mjs`)

**Trade-off accepted:** the verbosity of explicit filters is worth the
visibility. We mitigate the "forgot the filter" risk with the
`notDeleted()` helper + a soft-delete-check CI workflow.

## Alternatives considered

- **Hard delete + audit log table** — rejected. Doubles the storage,
  doesn't preserve FK relationships at query time, and complicates
  recovery.
- **Global Prisma `$extends` middleware** — rejected. Fails on Edge
  Runtime; also opaque (queries silently filter, harder to debug).
- **Postgres row-level security (RLS) policies** — rejected. Adds DB
  complexity for a single-tenant app, and we already cap admin reads at
  the application layer.
