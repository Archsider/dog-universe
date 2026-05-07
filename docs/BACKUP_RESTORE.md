# Backup & Restore — Dog Universe

This document describes the daily DB backup, what it covers, and how to
restore from a dump.

## Architecture

Vercel Lambda has no `pg_dump` binary, so we cannot run a true PostgreSQL
dump from our serverless cron. Instead, the cron at
[`src/app/api/cron/db-backup/route.ts`](../src/app/api/cron/db-backup/route.ts)
exports the critical tables via Prisma to a single gzipped JSON file and
uploads it to Supabase private storage.

| Property      | Value                                            |
|---------------|--------------------------------------------------|
| Schedule      | Daily, **03:00 UTC** (vercel.json)               |
| Auth          | `x-cron-secret` header / `Authorization: Bearer` |
| Bucket        | `uploads-private` (env `SUPABASE_PRIVATE_STORAGE_BUCKET`) |
| Object key    | `backups/YYYY-MM-DD.json.gz`                     |
| Compression   | gzip level 9 (`node:zlib`)                       |
| Retention     | 30 days (older dumps deleted on each run)        |
| Idempotency   | Redis lock `cron:db-backup:YYYY-MM-DD`           |

## Tables exported

The dump prioritises **business-critical** rows. Auxiliary tables (audit
logs, notifications, GPS heartbeats, etc.) are **not** included — they
are either reproducible (notifications), too large (`TaxiLocation`), or
recoverable from the source-of-truth tables.

| Table             | Cap     | Notes                                       |
|-------------------|---------|---------------------------------------------|
| `User`            | 50 000  | Includes admin + client accounts            |
| `Pet`             | 50 000  |                                             |
| `Booking`         | 100 000 |                                             |
| `Invoice`         | 100 000 |                                             |
| `InvoiceItem`     | 200 000 |                                             |
| `Payment`         | 100 000 |                                             |
| `Product`         | 5 000   |                                             |
| `ClientContract`  | 50 000  | Metadata only — PDF lives in Storage         |

If a table grows past its cap, bump the cap in
`src/app/api/cron/db-backup/route.ts` and re-deploy.

## File format

Decompressed JSON shape:

```json
{
  "version": 1,
  "generatedAt": "2026-05-09T03:00:01.234Z",
  "commit": "a1b2c3d",
  "tables": {
    "User":           [ … ],
    "Pet":            [ … ],
    "Booking":        [ … ],
    "Invoice":        [ … ],
    "InvoiceItem":    [ … ],
    "Payment":        [ … ],
    "Product":        [ … ],
    "ClientContract": [ … ]
  }
}
```

Notes:
- `Decimal` columns are serialised as strings (e.g. `"1234.50"`).
- `DateTime` columns are ISO-8601 strings.
- Restore scripts must coerce these back when re-inserting via Prisma.

## Manual restore drill

> **Goal:** practise restoring a single day's dump into a *staging* DB.
> Never run a restore directly into production unless you've already
> verified the dump in staging.

### 1. Download the dump

Generate a signed URL from Supabase (15 min TTL) and `curl` it:

```ts
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const { data } = await sb.storage
  .from('uploads-private')
  .createSignedUrl('backups/2026-05-09.json.gz', 900);
console.log(data?.signedUrl);
```

```bash
curl -L -o backup.json.gz "<signed-url>"
gunzip backup.json.gz
```

### 2. Inspect the dump

```bash
jq '.generatedAt, (.tables | keys)' backup.json
jq '.tables.Booking | length' backup.json
```

### 3. Sample restore script

Write a one-shot Node script (do **not** commit it):

```ts
// scripts/restore-from-dump.mts
import fs from 'node:fs';
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();
const dump = JSON.parse(fs.readFileSync('./backup.json', 'utf8'));

// Coerce Decimal-as-string back into Prisma.Decimal.
function restoreDecimals<T>(rows: T[], fields: (keyof T)[]): T[] {
  return rows.map((r) => {
    const out = { ...r } as Record<string, unknown>;
    for (const f of fields) {
      const v = out[f as string];
      if (typeof v === 'string') out[f as string] = new Prisma.Decimal(v);
    }
    return out as T;
  });
}

await prisma.$transaction([
  // Order matters: parents first.
  prisma.user.createMany({ data: dump.tables.User, skipDuplicates: true }),
  prisma.pet.createMany({ data: dump.tables.Pet, skipDuplicates: true }),
  prisma.product.createMany({ data: dump.tables.Product, skipDuplicates: true }),
  prisma.booking.createMany({
    data: restoreDecimals(dump.tables.Booking, ['totalPrice']),
    skipDuplicates: true,
  }),
  prisma.invoice.createMany({
    data: restoreDecimals(dump.tables.Invoice, ['amount', 'paidAmount']),
    skipDuplicates: true,
  }),
  prisma.invoiceItem.createMany({
    data: restoreDecimals(dump.tables.InvoiceItem, ['unitPrice', 'total', 'allocatedAmount']),
    skipDuplicates: true,
  }),
  prisma.payment.createMany({
    data: restoreDecimals(dump.tables.Payment, ['amount']),
    skipDuplicates: true,
  }),
  prisma.clientContract.createMany({ data: dump.tables.ClientContract, skipDuplicates: true }),
]);
```

Run against the staging DB with:

```bash
DATABASE_URL=$STAGING_DATABASE_URL npx tsx scripts/restore-from-dump.mts
```

### 4. Sanity checks

```sql
SELECT COUNT(*) FROM "User";
SELECT COUNT(*) FROM "Booking";
SELECT MAX("paymentDate") FROM "Payment";
```

## Rotation

The cron deletes `backups/YYYY-MM-DD.json.gz` files older than 30 days
on every run. Errors during rotation are non-fatal — the new dump is
already saved before the rotation runs.

## Drill schedule

We run a restore drill **on the first Monday of every month** against a
disposable Supabase branch. The exercise:

1. Pick yesterday's dump.
2. Restore into a fresh database.
3. Run the SQL sanity checks above.
4. Spot-check 5 random invoices for amount + status.
5. Discard the test database.

Tracking: add to the team calendar — the drill exposes silent format
drift (e.g. a new column shipped without an entry in the export) before
it matters.
