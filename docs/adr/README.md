# Architecture Decision Records

Each significant technical decision in Dog Universe is recorded here as a
short markdown file. The goal: **a new contributor (or future-you in 6
months) can understand WHY the codebase looks the way it does without
having to interview anyone**.

## Format

ADRs follow the [Michael Nygard template](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions):

```
# ADR-NNNN — <Decision in one line>

**Status:** Accepted | Superseded by ADR-XXXX | Deprecated
**Date:** YYYY-MM-DD
**Deciders:** <names or "solo founder">

## Context
What is the situation that calls for a decision? What forces are at play?

## Decision
What did we decide? State it as a positive command ("We will…").

## Consequences
What becomes easier? Harder? What did we trade off?

## Alternatives considered
What else was on the table, and why did we reject it?
```

## When to write a new ADR

- Adding a new dependency that is hard to swap (auth provider, ORM, hosting)
- Picking between two non-obvious technical paths (REST vs GraphQL,
  Server Component vs Client Component pattern, queue technology…)
- Locking in a non-obvious convention that future contributors might
  break by accident (e.g. "we never hard-delete users")
- Reversing a previous decision

## When NOT to write an ADR

- Routine refactors
- Bug fixes
- Style choices already covered by lint
- Code splits / file organisation (use commit messages instead)

## Index

- [ADR-0001 — Soft-delete instead of cascade](0001-soft-delete.md)
- [ADR-0002 — Notes on splitting BookingClient vs BookingAdmin services](0002-booking-services-split.md)
- [ADR-0003 — Idempotency strategy: Stripe-style header](0003-idempotency.md)
- [ADR-0004 — Storage: 3 Supabase buckets, not 1](0004-three-storage-buckets.md)
- [ADR-0005 — Decimal money columns, not Float](0005-decimal-money.md)
- [ADR-0006 — GPS distance filter for Pet Taxi tracking](0006-gps-distance-filter.md)
- [ADR-0007 — One way to send transactional SMS (atomic SmsLog dedup)](0007-transactional-sms-policy.md)
- [ADR-0008 — Respectful SMS policy (quiet hours + walk-in suppression)](0008-respectful-sms-policy.md)

## Naming

`NNNN-kebab-case-title.md`. NNNN is sequential, never recycled.
