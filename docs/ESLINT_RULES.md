# Custom ESLint rules — `eslint-plugin-dog-universe`

This plugin is **local** to the repo (under `eslint-rules/`, linked into
`node_modules/` via the `file:` protocol in `package.json`). Each rule
codifies a family of production bugs we chased so the same shape of bug
can never silently come back.

All four rules ship at **`error` severity** — they block CI. When the
rule fires on a genuinely safe construct, escape with an inline
`eslint-disable-next-line` **and a one-line justification** :

```ts
// eslint-disable-next-line dog-universe/no-getmonth-on-date-casa -- OK: <one-line reason>
const m = d.getMonth();
```

The justification is mandatory by convention — a reviewer should know
why this site is safe without having to trace the call graph.

---

## 1. `no-getmonth-on-date-casa`

**Forbids** : `.getMonth()`, `.getFullYear()`, `.getDate()`,
`.getDay()`, `.getHours()`, `.getMinutes()` on any value.

**Why** : on the Vercel UTC runtime, reading these properties on a
Casablanca-anchored Date silently returns the **UTC** value, not the
Casa value. At 00:30 wall-clock Casa, UTC is still 23:30 the previous
day — every dashboard / cache key / cron / billing query that runs in
that one-hour band silently shifts by ±1 day.

The full audit lives in CLAUDE.md under the "Bug TZ" entries. This rule
is the machine-enforced version of the discipline.

**Fix** :

```diff
- const m = d.getMonth();
+ const { month } = casablancaYMD(d);

- const y = new Date().getFullYear();
+ const { year } = currentMonthCasa();
```

**Auto-whitelisted files** :
- `src/lib/dates-casablanca.ts` — the helper implementation must read
  the raw Date API to do its job.
- `src/lib/__tests__/dates-casablanca.test.ts` — tests on the helper
  need raw Date assertions.

**Escape hatch** : when the call is provably safe (browser-side UI
where the user TZ is the source of truth, copyright year on a static
footer, `new Date(year, month, 0)` idiom for last day of month, etc.),
disable inline with a one-line justification.

---

## 2. `no-money-tofixed`

**Forbids** : `.toFixed()` on any expression whose rightmost identifier
in the receiver chain looks like a money field — `amount`, `paidAmount`,
`allocatedAmount`, `total`, `unitPrice`, `price`, `pricePerNight`,
`totalPrice`, `historicalSpendMAD`, etc. Also matches `<name>MAD` and
`<name>Amount` / `<name>Price` suffixes by convention.

**Why** : `Prisma.Decimal.prototype.toFixed()` returns a string and
silently rounds at the digit boundary. Two harms :
1. **Display** : `invoice.amount.toFixed(2)` produced the legendary
   Rita DU-2026-0030 = `"120.10"` while the real Decimal was 120.105.
2. **Compute** : `(a.amount + b.amount).toFixed(2)` performs a float
   addition before toFixed — money arithmetic should be Decimal.

**Fix** :

```diff
- {invoice.amount.toFixed(2)} MAD
+ {formatMAD(invoice.amount)}
```

`formatMAD()` (from `@/lib/utils`) is Decimal-aware and produces the
canonical MAD formatting (`12 345,67 MAD`).

**Escape hatch** : controlled `<input>` values that need a raw
`"12.34"` string ; CSV export cells (spreadsheets need raw decimals to
sum) ; custom UI markup that intentionally splits the number and unit
across two `<span>` for alignment.

---

## 3. `no-direct-payment-create`

**Forbids** : `prisma.payment.create()`, `prisma.payment.createMany()`,
and the same on `tx.*` / `db.*` / `client.*` transaction handles.

**Why** : `recordPayment()` from `@/lib/payment-allocation` is the
single canonical insertion path. Bypassing it skips :
- amount / method / date validation
- overpayment guard (unless `trustedAmount: true`)
- `allocatePayments(invoiceId)` re-run that keeps
  `InvoiceItem.allocatedAmount` in sync
- `revenue:YYYY:MM` cache invalidation
- SMS OPS notification on ADMIN/SUPERADMIN actions
- the cross-role gate (ADMIN cannot touch a SUPERADMIN-owned invoice)

Two production bugs would have been caught at lint time : the walk-in
invoice creation skipped revenue cache invalidation (Module 4-A fix),
and the paymentMethod whitelist diverged between Site A and Site B.

**Fix** :

```diff
- await prisma.payment.create({ data: { invoiceId, amount, paymentMethod } });
+ await recordPayment({ invoiceId, amount, paymentMethod, paymentDate });
```

**Auto-whitelisted files** :
- `src/lib/payment-allocation.ts` itself — contains the canonical
  `prisma.payment.create()` call.

---

## 4. `no-prisma-date-without-helper`

**Forbids** : `new Date()` (with no arguments, or with `Date.now()`) as
the value of a Prisma filter on a date column — `paymentDate`,
`startDate`, `endDate`, `issuedAt`, `createdAt`, `nextDueDate`,
`paidAt`, `deletedAt`, …

**Why** : on Vercel UTC, `new Date()` is the current UTC instant. When
local wall-clock Casa is 00:30, UTC is still 23:30 the previous day,
so a query `where startDate >= today` silently includes yesterday's
bookings.

Detected forms :
```ts
// All flagged
prisma.booking.findMany({ where: { startDate: { gte: new Date() } } });
prisma.invoice.count({ where: { issuedAt: { lt: new Date(Date.now()) } } });
prisma.payment.findFirst({ where: { paymentDate: new Date() } });
prisma.booking.findMany({
  where: { AND: [{ endDate: { gte: new Date() } }] },
});
prisma.user.findMany({
  where: { bookings: { some: { startDate: { gte: new Date() } } } },
});
```

**Fix** :

```diff
- await prisma.booking.findMany({
-   where: { startDate: { gte: new Date() } },
- });
+ const today = startOfTodayCasa();
+ await prisma.booking.findMany({
+   where: { startDate: { gte: today } },
+ });
```

Available helpers in `@/lib/dates-casablanca` :
- `startOfTodayCasa()` / `endOfTodayCasa()`
- `startOfDayCasa(d)` / `endOfDayCasa(d)`
- `casablancaStartOfDay(d)`
- `startOfMonthCasa(d)` / `endOfMonthCasa(d)`
- `casablancaYMD(d)` → `{ year, month, day }`
- `currentMonthCasa()` → `{ year, month }`

---

## How the plugin is wired

`package.json` :
```jsonc
"devDependencies": {
  "eslint-plugin-dog-universe": "file:./eslint-rules"
}
```

`eslint-rules/package.json` :
```json
{ "name": "eslint-plugin-dog-universe", "main": "index.js" }
```

`.eslintrc.json` :
```jsonc
{
  "plugins": ["dog-universe"],
  "rules": {
    "dog-universe/no-getmonth-on-date-casa": "error",
    "dog-universe/no-money-tofixed": "error",
    "dog-universe/no-direct-payment-create": "error",
    "dog-universe/no-prisma-date-without-helper": "error"
  }
}
```

Test files, `scripts/`, `prisma/`, and `eslint-rules/` itself are all
exempted via `.eslintrc.json` overrides — RuleTester fixtures must be
allowed to mention the forbidden patterns.

---

## Adding a new rule

1. Create `eslint-rules/rules/<name>.js` exporting `{ meta, create }`.
2. Wire it in `eslint-rules/index.js` under `rules`.
3. Add a test in `eslint-rules/__tests__/<name>.test.js` using
   `RuleTester` from `eslint`. Use `@typescript-eslint/parser` as the
   parser so TypeScript syntax is supported.
4. Activate in `.eslintrc.json` at `error` severity.
5. Run `npm run lint` and triage the existing violations — migrate the
   real bugs, inline-disable the safe sites with a justification.
6. Document the rule in this file.

Tests run automatically via vitest (it picks up `.test.js` in the
default file pattern). Validate locally with :
```bash
npx vitest run eslint-rules/
```
