# ADR-0005 — Decimal money columns, not Float

**Status:** Accepted
**Date:** 2026-05-04
**Deciders:** solo founder

## Context

Dog Universe stores money in MAD (Moroccan Dirhams). The original schema
used Prisma `Float` (PostgreSQL `DOUBLE PRECISION`) for all monetary
columns. This causes well-known floating-point errors:

```js
0.1 + 0.2          // 0.30000000000000004
0.1 + 0.2 === 0.3  // false
```

The drift is invisible at small scale but accumulates: an invoice with
20 items of 12.10 MAD each can compute to 241.99999999999997 MAD instead
of 242.00, which then fails the PG CHECK `paidAmount <= amount + 0.01`.

We caught this when an admin reported "the trigger keeps refusing my
payment" — `paidAmount` was 242.00 (legitimately) but `amount` had
drifted to 241.9999…

## Decision

**We will store every monetary column as `Decimal @db.Decimal(10, 2)`
in Prisma → `DECIMAL(10, 2)` in PostgreSQL.**

- 10 total digits, 2 after the decimal point → max 99,999,999.99 MAD
  (~100 M MAD; way more than we'll ever bill)
- Migration `20260504_decimal_money` converts all 12 affected columns
  in-place (`ALTER TABLE ... TYPE DECIMAL(10,2) USING ...::DECIMAL(10,2)`)
- Helper `toNumber(decimal)` in `src/lib/decimal.ts` for boundary
  conversion to JS number when needed (UI rendering, JSON serialisation,
  arithmetic when precision is not critical)
- `formatMAD()` accepts `DecimalLike` so call sites never need to
  pre-convert

The DB-level CHECK + the trigger `trg_recompute_invoice_amount` (which
rewrites `Invoice.amount = SUM(items.total)` on every InvoiceItem
INSERT/UPDATE/DELETE) guarantee `Invoice.amount` is always exact.

## Consequences

**Easier:**
- No more drift. Sums are exact at the DB level.
- The PG CHECK can be tight (1 cent tolerance) without false positives.
- Upgrading to multi-currency later just adds a `currency` column; the
  precision logic doesn't change.

**Harder:**
- `Prisma.Decimal` is a runtime object, not a primitive. Naive
  `decimal + number` is a TypeScript error.
  - We accept conversion at the boundary via `toNumber()` and re-store
    the result. Acceptable because the precision is guaranteed at the
    DB layer; transient JS-side arithmetic on < 10 items doesn't drift
    enough to break the cent.
- Decimal arithmetic with `Prisma.Decimal.add()` etc. is verbose. We
  use it only inside the few critical paths (allocation, billing
  totals).

**Trade-off accepted:** the verbosity of `toNumber(d).toFixed(2)` is
worth the elimination of the entire class of float-drift bugs.

## Alternatives considered

- **Store cents as integers** (`242 → 24200`) — rejected. Convention
  is non-obvious to new developers; UI rendering needs constant
  division; risk of accidental int division in JS.
- **Use `numeric` PostgreSQL without precision spec** — rejected.
  Precision should be explicit; saves a few bytes per row but bills the
  same to operators.
- **Continue with Float, add tolerance everywhere** — rejected. The
  tolerance creep is exactly how legacy financial systems become
  unmaintainable.
