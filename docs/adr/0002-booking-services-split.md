# ADR-0002 — `booking-client.service.ts` vs `booking-admin.service.ts` split

**Status:** Accepted
**Date:** 2026-04-30
**Deciders:** solo founder

## Context

The booking creation logic was originally inlined in two API routes:

- `POST /api/bookings` — client-facing (own bookings only)
- `POST /api/admin/bookings` — admin-facing (walk-ins, status overrides,
  retroactive entries)

These two routes shared ~70 % of the logic (capacity check, transaction,
validation rules, side-effects) but each had its own quirks:

- Client: PENDING by default, no walk-in support, can't override status,
  Pet Taxi must respect Sunday/time rules
- Admin: 5 walk-in cases (classic, open-ended, retroactive, taxi,
  combo), can pre-set any status, can bypass capacity warnings

A naive shared service would either grow a `mode: 'client' | 'admin'`
parameter polluting every function, or split the code only halfway and
keep route-level branching.

## Decision

**We will keep TWO service modules with focused responsibilities, sharing
small utilities only:**

- `src/lib/services/booking-client.service.ts` — client flow only
- `src/lib/services/booking-admin/` — admin flow split into focused
  files (`status-transitions.ts`, `extension.ts`, `edit-dates.ts`)
- `src/lib/services/booking-errors.ts` — shared error type
  (`BookingError` with HTTP code mapping)

The shared utilities live at the top level of `services/`. The
client-specific runtime constraints (Sunday block, Time slot 10-17h,
Idempotency-Key pattern) live in `booking-client.service.ts` and are NOT
re-exported.

## Consequences

**Easier:**
- Each file has ONE audience: client or admin. Reading either is fast.
- Client-only invariants (Sunday block, time slot) are physically
  isolated — an admin route refactor cannot accidentally remove them.
- New admin flows (eg. "import from CSV") live next to their peers in
  `services/booking-admin/`, not bolted onto a shared file.

**Harder:**
- A bug fix that touches both flows requires editing two files.
- Some duplication: capacity check is called from both, with slightly
  different error mapping.

**Trade-off accepted:** the friction of "edit two files for cross-cutting
fixes" is worth the clarity of "client and admin live in separate
files". The duplication is shallow (15-20 lines).

## Alternatives considered

- **Single `booking.service.ts` with `mode` parameter** — rejected.
  Every internal function would carry a `mode` argument; the conditional
  branches would multiply with each new admin feature.
- **Inheritance / class hierarchy** — rejected. Functional service
  modules are easier to test in isolation, and the codebase has no other
  class-based services.
- **Inline in routes** — the original state. Rejected because the same
  logic was duplicated and slowly diverged.
