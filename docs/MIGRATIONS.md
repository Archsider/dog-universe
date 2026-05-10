# Database Migrations Workflow

Dog Universe uses a **home-grown migration runner** (`scripts/db-migrate.mjs`) backed by a custom tracker table `_app_migrations` — *not* `prisma migrate deploy`.

## Why not `prisma migrate deploy` ?

Historical reason : the project has 70+ migrations, of which a large majority were applied **by hand** on Supabase before the runner existed. There is no `_prisma_migrations` table in production and no `migration_lock.toml`. Running `prisma migrate deploy` would attempt to replay every migration from scratch and corrupt the schema.

The custom tracker `_app_migrations(name TEXT PK, checksum TEXT, applied_at TIMESTAMP)` records what has actually been applied. On first boot, the runner detects the legacy schema (presence of `InvoiceItem.category`) and **baselines** every migration prefixed `< 20260506_` as applied without replaying them.

## Where migrations live

```
prisma/migrations/
  YYYYMMDD_short_name/
    migration.sql
```

Naming convention :

- `YYYYMMDD` = ISO date of authorship (not application).
- `short_name` = lowercase snake_case, ≤ 4 words, describes the *intent*.
- One folder per migration. The file **must** be named `migration.sql`.

Examples :
- `20260511_invoice_sequence/migration.sql`
- `20260512_app_migrations_checksum/migration.sql`

## Safety rules (enforced by the runner)

Every `migration.sql` is validated **before** any DB connection. Violations abort the runner with exit code 1.

| Rule | Why |
|---|---|
| `DROP TABLE` must include `IF EXISTS` | Prevents accidental hard failure when replaying on a divergent DB. |
| `DELETE FROM` requires a `WHERE` clause | Refuses mass-delete. |
| `UPDATE` requires a `WHERE` clause | Refuses mass-update. |
| Migrations > 100 lines require a `-- @safety: reviewed` header (within the first 20 lines) | Forces a second pair of eyes on large data-fix scripts. |

False positives (e.g. `ON CONFLICT DO UPDATE`, `ON UPDATE CASCADE`, `UPDATE` inside a `DO $$ ... $$` body, comment-mentioned UPDATE) are filtered out by the parser. See `scripts/__tests__/db-migrate.test.mjs` for the test matrix.

### Bypass token : `-- @safety: reviewed`

Add this comment in the **first 20 lines** of `migration.sql` to acknowledge intentional mass-update / mass-delete / long backfill. Example :

```sql
-- 20260601_backfill_user_locale
-- @safety: reviewed
-- Sets default 'fr' on legacy User rows imported before next-intl was wired.
UPDATE "User" SET locale = 'fr' WHERE locale IS NULL;
```

## Checksums & drift detection

When a migration is applied, the runner stores `SHA256(migration.sql)` in `_app_migrations.checksum`. On every subsequent run, the runner re-hashes each `migration.sql` and emits a `WARN ... checksum drift detected` log when the on-disk SQL has been modified post-application.

**Never edit an applied migration's SQL** unless you understand the implication : the warning will fire forever for that row. Prefer a new migration that fixes whatever was wrong.

## Runner modes

```bash
# Production (Vercel buildCommand) — auto-applies pending migrations.
node scripts/db-migrate.mjs

# Show what would be applied without running.
node scripts/db-migrate.mjs --dry-run

# Static safety validation only (no DB needed). Used in CI.
node scripts/db-migrate.mjs --validate-only
```

Auto-skip conditions :
- `CI=true` → skip (unless `--dry-run` or `--validate-only`).
- `DATABASE_URL` contains `localhost` / `127.0.0.1` → skip (dev local).
- No `DATABASE_URL` / `DIRECT_URL` → skip.

These ensure the runner only mutates production Supabase, never local dev or CI ephemeral DBs.

## CI : `.github/workflows/migration-check.yml`

Runs on every PR / push that touches `prisma/**` or `scripts/db-migrate.mjs` :

1. `npx prisma validate` — schema sanity.
2. `node scripts/db-migrate.mjs --validate-only` — runs every safety rule against every migration.
3. `npx vitest run scripts/__tests__/db-migrate.test.mjs` — validator unit tests (15 cases).
4. `node scripts/db-migrate.mjs --dry-run` against a `postgres:16-alpine` service container — confirms the runner can connect and resolve the pending set without mutating anything in prod.

## Workflow : creating a migration

1. **Update `prisma/schema.prisma`** with the desired changes.
2. **Generate the client** : `npm run db:generate` (works without a DB).
3. **Write the migration SQL by hand** in `prisma/migrations/YYYYMMDD_short_name/migration.sql`. The local DB is not the source of truth — Supabase is — so do *not* use `prisma migrate dev`.
4. **Validate locally** : `node scripts/db-migrate.mjs --validate-only`.
5. **TypeScript check** : `npx tsc --noEmit`.
6. **Unit tests** : `npx vitest run`.
7. **Commit** with a message describing the schema intent.
8. **Push** → CI runs `migration-check.yml` automatically.
9. Vercel deploys → runner applies pending migrations on the next build.

For long-running or risky migrations (data backfill, type changes, dropping columns) : either add `-- @safety: reviewed` and split the migration into multiple smaller steps, **or** apply the SQL manually via Supabase SQL editor and add the row in `_app_migrations` to mark it as applied.

## Rollback workflow

Migrations are forward-only by default, but every reversible migration **should** ship a `down.sql` next to its `migration.sql`. The convention is opt-in: missing `down.sql` files are tolerated, but explicitly-irreversible migrations must declare it.

### Convention

```
prisma/migrations/
  20260512_addon_request/
    migration.sql   # forward
    down.sql        # reverse — optional
```

A `down.sql` either:

1. **Reverses the schema** (`DROP TABLE IF EXISTS ...`, `ALTER TABLE ... DROP COLUMN IF EXISTS ...`), or
2. **Declares itself non-applicable** with the header `-- @rollback: not-applicable` in the first 5 lines. Use this when the forward migration drops data that cannot be recovered, runs an irreversible backfill, or modifies state in a way that has no meaningful inverse. Example:

```sql
-- @rollback: not-applicable
-- This migration drops Tenant rows; restoring would only recreate empty rows.
```

### Running a rollback

```bash
node scripts/db-rollback.mjs 20260512_addon_request           # apply down.sql + delete tracker row
node scripts/db-rollback.mjs 20260512_addon_request --dry-run # print SQL without touching the DB
```

The runner:

1. Refuses if `down.sql` is missing or marked `@rollback: not-applicable`.
2. Wraps the SQL in a transaction (`BEGIN ... COMMIT`).
3. Deletes the row from `_app_migrations` so the migration becomes pending again and can be re-applied.

### Examples

| Forward operation | Recommended `down.sql` |
|---|---|
| `CREATE TABLE "Foo"` | `DROP TABLE IF EXISTS "Foo" CASCADE;` |
| `ALTER TABLE "X" ADD COLUMN "y"` | `ALTER TABLE "X" DROP COLUMN IF EXISTS "y";` |
| `CREATE INDEX idx_x` | `DROP INDEX IF EXISTS idx_x;` |
| Irreversible drop / data backfill | `-- @rollback: not-applicable` |

### CI coverage : `.github/workflows/migration-rollback-check.yml`

For every migration authored within the last 90 days that ships a runnable `down.sql`, CI runs the loop:

1. `pg_dump -s` → snapshot the schema **before** the up.
2. Apply `migration.sql` against an ephemeral `postgres:16-alpine`.
3. `pg_dump -s` → snapshot **after** the up (reference only).
4. `node scripts/db-rollback.mjs <name>` → apply `down.sql`.
5. `pg_dump -s` → snapshot **after** the down. Must be byte-identical to the BEFORE snapshot.

Any drift fails the job. Migrations marked `@rollback: not-applicable` and migrations with no `down.sql` are skipped (the latter prints a notice).

### Partial failure recovery (legacy note)

If a migration partially failed in production (e.g. one of two `ALTER TABLE` succeeded, the second crashed) :

1. The runner uses a single transaction per migration (`BEGIN ... COMMIT`), so partial failures rollback. Exception : statements containing `CONCURRENTLY` run **outside** the transaction (Postgres requirement) — if those fail, the preceding transactional part has already committed.
2. To recover : connect to Supabase, manually fix the state, then run `INSERT INTO "_app_migrations"(name, checksum) VALUES ('<name>', '<hash>')` to mark the migration as applied. Subsequent runs will skip it.

## Pre-push checklist

- [ ] Migration file in `prisma/migrations/YYYYMMDD_short_name/migration.sql`
- [ ] `node scripts/db-migrate.mjs --validate-only` exits 0
- [ ] `npx prisma validate` exits 0
- [ ] `npx tsc --noEmit` exits 0
- [ ] `npx vitest run` exits 0
- [ ] If > 100 lines or mass DML → `-- @safety: reviewed` header in place
- [ ] `prisma/schema.prisma` updated to match the new SQL state
- [ ] `npm run db:generate` re-run so the Prisma client matches

## Known caveats

- **`CREATE INDEX CONCURRENTLY`** is auto-detected and split out of the transactional block — it must not be wrapped in `BEGIN`/`COMMIT`. If your migration mixes both, the transactional statements commit first, then concurrent ones run sequentially after.
- **Multi-statement strings** : the runner concatenates transactional statements with `;` and submits them as a single `client.query()` call. Postgres' simple query protocol supports this. If a statement uses `$$` dollar quoting (PL/pgSQL bodies), it must close cleanly *before* the next `;` outside the body.
- **Editing applied SQL files** triggers a checksum-drift warning on every subsequent runner invocation. Avoid unless you understand the cost.
