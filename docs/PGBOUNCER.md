# PgBouncer / Supabase Transaction Pooler — runbook

> **Current state (2026-05-13)** : the production Vercel deployment **already
> runs through the Supabase Transaction Pooler**. `DATABASE_URL` points at
> `pooler.supabase.com:6543?pgbouncer=true`, `DIRECT_URL` carries the
> port-5432 link for migrations. Verified by the `dbPool` field on
> `/api/admin/health` (SUPERADMIN). This document is kept for the day
> someone needs to re-do the wiring (new project, staging environment,
> migration of providers).

> **Why this matters.** Vercel runs each request in a fresh Lambda; without
> a pooler, every Lambda opens a Postgres connection and we hit the
> ~500-connection ceiling at moderate traffic. With the pooler, hundreds
> of Lambdas multiplex onto a small pool — the standard Vercel × Supabase
> deployment pattern.

## Why we use TWO connection strings

Prisma needs **two distinct URLs**:

| Variable        | Target                | Used by                         |
|-----------------|-----------------------|---------------------------------|
| `DATABASE_URL`  | **Pooler** (port 6543, `?pgbouncer=true`) | Application runtime queries  |
| `DIRECT_URL`    | **Direct** (port 5432)            | `prisma migrate`, schema introspection |

`schema.prisma` is already wired this way (`url` + `directUrl`).

## Manual activation — 5 minutes on Vercel

1. Open **Supabase Dashboard → Project Settings → Database → Connection Pooling**.
2. Copy the **Transaction pooler URI** (it has port `6543` and ends with
   `pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=...`).
3. Open **Vercel Dashboard → Project Settings → Environment Variables**.
4. Edit `DATABASE_URL` (Production, Preview, Development) → paste the
   pooler URI. Add `&sslmode=require` if missing.
5. Confirm `DIRECT_URL` is set to the **direct** connection string (port
   5432). Leave it as is — migrations need the unpooled link.
6. Redeploy production (Vercel → Deployments → latest → Redeploy).
7. Verify on `/admin/health` (SUPERADMIN) — the new `dbPool` field should
   show `{ pooled: true, via: 'port' }`.

## Verification post-deploy

The boot guard in `src/lib/boot-checks.ts` emits a structured warning if
`DATABASE_URL` is not pooled. Inspect the first prod log line after
deploy:

```
[boot] optional env vars missing — feature degraded
```

If you see `DATABASE_URL does not look pooled (expect :6543 or pgbouncer=true)`,
the env update did not take effect.

`/api/admin/health` returns:

```json
{
  "dbPool": {
    "pooled": true,        // false ⇒ still on direct connection
    "via": "port",         // "port" | "pgbouncer-flag" | "unknown"
    "warning": null
  }
}
```

`/admin/health` (SUPERADMIN UI) surfaces this banner in red when
`pooled: false`.

## Common gotchas

- **Migrations failing after switching.** You probably overwrote
  `DIRECT_URL` instead of `DATABASE_URL`. Migrations need the direct
  link; runtime queries need the pool. Restore `DIRECT_URL` to the
  port-5432 string.
- **`prepared statement "s0" already exists` errors.** PgBouncer in
  transaction mode does not support prepared statements. Prisma works
  around this with `pgbouncer=true` in the URL — make sure the flag is
  present.
- **Connection limit reached even with the pooler.** Open Supabase
  Dashboard → Database → Connection Pooling and lower the
  `default_pool_size` if necessary; the pooler itself can be
  oversubscribed.

## Why we didn't auto-detect

A heuristic boot guard (port `:6543` OR `pgbouncer=true` flag) is
intentional. We refuse to auto-rewrite `DATABASE_URL` because:

- Some non-prod environments (local Postgres, CI, ephemeral test DBs)
  legitimately bypass the pooler.
- A silent rewrite would mask configuration drift.

The guard is **warning-only** in production (does not crash boot) so a
mis-set var degrades scaling without taking the app offline.
