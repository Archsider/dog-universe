# Database — connection pooling

Dog Universe runs on **Supabase Postgres** behind **PgBouncer**. Two distinct
connection strings are used by Prisma — getting them mixed up causes
either Lambda cold-start storms or migration failures.

## Two URLs, two purposes

| Env var          | Port | Mode         | Used by                                  |
| ---------------- | ---- | ------------ | ---------------------------------------- |
| `DATABASE_URL`   | 6543 | PgBouncer **transaction** mode | Prisma client at runtime (Lambdas) |
| `DIRECT_URL`     | 5432 | Direct Postgres                | `prisma migrate`, `prisma db push`, introspection |

Both strings are present on Vercel. The Prisma datasource is wired so
that the right one is picked for the right operation:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

## Why PgBouncer matters on Vercel

Each Lambda invocation that touches the DB normally opens a new TCP
connection. At ~100 concurrent requests, Postgres collapses (default
`max_connections` is 100, and each idle connection eats RAM). PgBouncer
multiplexes thousands of client connections onto a small pool of
real Postgres connections — and Supabase exposes it on port `6543`.

**Transaction mode** is the right level for a stateless serverless workload:
each transaction grabs a backend connection, releases it on COMMIT/ROLLBACK,
and the next request reuses it.

### Caveats of transaction mode

- No prepared statements (Prisma already disables them on PgBouncer
  via `?pgbouncer=true` in the URL)
- No `LISTEN/NOTIFY`, no advisory locks, no session-level GUCs
- Long transactions still hold a backend slot — keep `$transaction` blocks
  short and avoid `prisma.$transaction(..., { isolationLevel: 'Serializable' })`
  for slow operations

For the rare operation that needs session features (e.g. `pg_advisory_lock`
or running raw schema DDL outside Prisma migrate), point that one client
at `DIRECT_URL` instead.

## Connection string format

`DATABASE_URL` (PgBouncer):
```
postgresql://postgres.<project>:<pwd>@<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
```

`DIRECT_URL` (direct Postgres):
```
postgresql://postgres.<project>:<pwd>@<region>.pooler.supabase.com:5432/postgres
```

Notes:

- `pgbouncer=true` is mandatory on the pooled URL — Prisma uses it to
  disable prepared-statement caching that PgBouncer cannot serve
- `connection_limit=1` per Lambda is the right knob: each Lambda is
  short-lived and serial; one PgBouncer slot per running Lambda is enough
- Do **not** put `connection_limit=1` on the direct URL — migrations
  may need parallel connections

## Cold-start gain

Before pooling: every Lambda cold start opened a fresh TCP connection
to Postgres (TLS handshake + auth round-trip ≈ 100–200 ms).

With PgBouncer, the TCP target is the pooler, which keeps warm
connections to Postgres on the backend. Cold start latency on DB-bound
routes drops by **80–150 ms**, depending on region.

## Setting it up on Vercel

1. Supabase → Project Settings → Database → **Connection string**
2. Copy the **Transaction** URL (port 6543) → set as `DATABASE_URL` in
   Vercel env vars (Production, Preview, Development)
3. Copy the **Session** URL (port 5432) → set as `DIRECT_URL` in
   Vercel env vars
4. Append `?pgbouncer=true&connection_limit=1` to `DATABASE_URL` if
   not already present
5. Redeploy

Verify with a quick `prisma migrate deploy` from the Vercel shell or
locally with the Vercel-pulled env: it should run against the direct
URL without complaint.

## Local dev

`localhost:5432` is the standard Postgres dev DB. In sandbox environments
where the local DB is unreachable:

- `npx prisma generate` works without a DB — regenerates the TS client
- Migrations are authored as raw SQL in `prisma/migrations/YYYYMMDD_name/migration.sql`
- Apply them on Supabase via the SQL editor or `prisma migrate deploy`
  from a machine that can reach the DB
