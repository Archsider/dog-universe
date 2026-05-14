# ADR-0003 — Idempotency: Stripe-style `Idempotency-Key` header

**Status:** Accepted
**Date:** 2026-04-30
**Deciders:** solo founder

## Context

Several mutation routes have catastrophic failure modes if executed
twice:

- `POST /api/bookings` — double-booking the same dates for the same
  pet, double-charging on auto-invoice
- `POST /api/invoices/[id]/payments` — recording a payment twice
  inflates `paidAmount`, eventually triggers PG CHECK violation
  (`paidAmount <= amount + 0.01`)
- `POST /api/contracts/sign` — double-PDF, signature stored twice

The classic causes: client retry on slow network, double-tap on a
button, browser back-then-resubmit, mobile app retry policy.

## Decision

**We will use the Stripe-style `Idempotency-Key` HTTP header pattern,
with Redis as the shared idempotency store.**

Implementation in `src/lib/idempotency.ts` — `tryAcquireIdempotency(req,
scope, ttl?)`:

1. Reads `Idempotency-Key` from the request header (8-128 chars,
   `[A-Za-z0-9_\-]`)
2. `SET NX EX 24h` on `idempotency:{scope}:{key}` in Redis
3. First request → `{ acquired: true }`, route proceeds
4. Replay within 24h → `{ acquired: false }`, route returns 409
   `DUPLICATE_REQUEST`

**Fail-open:** if Redis is down, `tryAcquireIdempotency` returns
`acquired: true` and the route proceeds normally. Trade-off: a transient
Redis outage may allow a duplicate request through, but a Redis outage
should never block a legitimate booking.

**Scopes** are per-route prefixes (`booking:create`,
`payment:{invoiceId}`, `contract:sign:{userId}`) so two distinct
operations can re-use the same client-supplied key without colliding.

The header is **optional**. Routes that lose data on duplicate (POST
bookings, POST payments, POST contracts/sign) check it and return 409.
GET endpoints do not check.

## Consequences

**Easier:**
- Mobile clients can retry blindly without risk
- Frontend "double-click protection" becomes a defence-in-depth, not a
  primary safety net
- The 24h TTL covers the realistic retry window for a transient outage

**Harder:**
- Clients MUST generate a fresh key per logical operation. We document
  this in `docs/REALTIME_NOTIFICATIONS.md` and in the route handler
  JSDoc.
- Debugging "why is my second request 409-ing?" requires Redis
  inspection.

**Trade-off accepted:** fail-open during Redis outage is the right
choice for our blast radius (small, mostly Maroc). A bank would
fail-closed.

## Alternatives considered

- **Database-level uniqueness constraint** — rejected. Works for
  bookings (we already have `Booking.idempotencyKey @unique`) but
  doesn't generalize to payments / contracts which don't have a natural
  unique key.
- **`POST` → `303 See Other`** redirect pattern — rejected. Doesn't
  help mobile clients that retry on transport errors before receiving
  the 303.
- **No idempotency, rely on client discipline** — rejected. Bookings
  are too high-stakes to rely on client correctness.
