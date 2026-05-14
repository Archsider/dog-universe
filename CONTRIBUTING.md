# Contributing to Dog Universe

> **Goal of this doc:** get a new developer productive in **under 2 hours**.

If anything below is wrong or unclear, that's a bug — open a PR to fix it.

---

## 0. Prerequisites

| Tool | Version | Why |
|------|---------|-----|
| Node.js | 20+ | Next.js 15, native `fs.promises.glob`, `AbortSignal.timeout` |
| npm | 10+ | Bundled with Node 20 |
| Git | recent | Standard |
| Docker (optional) | recent | Only if you want a local Postgres without Supabase |

**You do NOT need** a Supabase account to run the app locally — the soft-delete + invoice trigger work against any Postgres 14+.

---

## 1. Clone + install (5 min)

```bash
git clone https://github.com/Archsider/dog-universe.git
cd dog-universe
npm install
```

This runs `next build` once (Vercel does this too). On first install, `npm install` also triggers `prisma generate` via the `postinstall` hook.

---

## 2. Environment variables (10 min)

```bash
cp .env.example .env.local
```

Edit `.env.local`. The **minimum** to run `npm run dev`:

```bash
# DB — any Postgres works locally
DATABASE_URL="postgresql://user:pass@localhost:5432/doguniverse"
DIRECT_URL="postgresql://user:pass@localhost:5432/doguniverse"

# NextAuth — generate via `openssl rand -base64 32`
NEXTAUTH_SECRET="<32-byte random string>"
NEXTAUTH_URL="http://localhost:3000"
CRON_SECRET="<another random string>"

# TOTP encryption — `openssl rand -hex 32`
TOTP_ENCRYPTION_KEY="<64 hex chars>"

# Skip prod boot guards in dev
SKIP_ENV_VALIDATION="1"
```

The rest of `.env.example` (Supabase, Anthropic, Upstash Redis, Resend, BullMQ, Sentry, GitHub PAT, etc.) is for features that **degrade gracefully** in their absence:

- No Supabase → file upload writes to `public/uploads/` locally
- No Upstash → no rate-limiting, no caching, no cron locks (still works in dev)
- No Anthropic → vaccination extract returns a manual-entry draft
- No Resend → emails log to console
- No Sentry → no error reporting

Set them up later as you touch the relevant features.

---

## 3. Database setup (15 min)

### Option A — Local Postgres

```bash
# Start Postgres however you like (Docker, brew, native install)
docker run -d --name dog-universe-pg -p 5432:5432 \
  -e POSTGRES_USER=user -e POSTGRES_PASSWORD=pass -e POSTGRES_DB=doguniverse \
  postgres:16

# Apply schema + seed sample data
npm run setup    # = npm install + prisma generate + prisma db push + seed
```

### Option B — Supabase

1. Create a project on supabase.com (free tier OK)
2. Copy the **direct** connection string into both `DATABASE_URL` and `DIRECT_URL` (don't use the pooler URL locally — slows down `prisma db push`)
3. Run `npm run setup`

---

## 4. Run the app (1 min)

```bash
npm run dev
```

Open http://localhost:3000. Sign in with one of the seeded accounts:

| Email | Password | Role |
|-------|----------|------|
| `admin@example.com` | `admin1234` | ADMIN |
| `client@example.com` | `client1234` | CLIENT |

Check the seed file (`prisma/seed.ts`) for the current list — adjust if seed has evolved.

---

## 5. Make a change + verify (20 min)

Standard loop:

```bash
# 1. Branch off main
git checkout -b feat/my-change

# 2. Edit code

# 3. Verify
npx tsc --noEmit          # TypeScript: 0 errors required
npm run lint              # ESLint: warnings OK, 0 errors required
npm test                  # Vitest: all green required
node scripts/check-route-exports.mjs   # Forbidden exports in route.ts

# 4. Commit + push + open PR
git add -A
git commit -m "feat(scope): one-line summary"
git push -u origin feat/my-change
gh pr create   # or open via GitHub UI
```

The CI pipeline (`.github/workflows/ci.yml`) re-runs all of the above on every PR.

---

## 6. Project layout (10 min)

```
src/
├── app/                       Next.js 15 App Router
│   ├── [locale]/              fr / en / ar routed pages
│   │   ├── admin/             Backoffice (ADMIN/SUPERADMIN gated)
│   │   ├── client/            Client portal
│   │   └── auth/              Sign in / register / TOTP
│   ├── api/                   Route handlers
│   │   ├── admin/             SUPERADMIN/ADMIN routes
│   │   ├── cron/              Vercel cron endpoints (gated by x-cron-secret)
│   │   └── webhooks/          Inbound webhooks (Sentry, etc.)
│   └── layout.tsx             Root layout (HTML shell + Sentry)
├── components/
│   ├── ui/                    shadcn-style primitives (Button, Input, etc.)
│   ├── shared/                Reused across admin + client
│   └── admin/                 Admin-only components
├── lib/                       Pure logic, no React
│   ├── prisma.ts              PrismaClient singleton + slow-query monitor
│   ├── auth-guards.ts         requireRole(), requireTotpSatisfied()
│   ├── feature-flags.ts       isFeatureEnabled(key, ctx)
│   ├── observability.ts       withSpan(), logServerError()
│   ├── pricing.ts             Source of truth for pension rates (verrouillé)
│   └── services/              Multi-step business logic (booking, payment, ...)
└── middleware.ts              Edge middleware (auth, locale, rate-limit)

docs/
├── adr/                       Architecture Decision Records (read first!)
├── BACKUP_RESTORE.md          DB backup + restore procedure
├── PGBOUNCER.md               Supabase connection pooling
├── RUNBOOK.md                 Incident runbook
└── *.md                       Domain docs

prisma/
├── schema.prisma              Source of truth for DB schema
└── migrations/                Manual SQL migrations
```

**The single most important file to read first:** `CLAUDE.md` at the repo root — it's the project's "permanent memory" with all the locked-in conventions, business rules, and decisions.

---

## 7. Conventions you must follow

These are **enforced by CI**. PRs that break them won't merge.

### TypeScript

- **No `any`** in production code (`@typescript-eslint/no-explicit-any: error`). Use `unknown` and narrow.
- **`as` assertions discouraged** (`@typescript-eslint/consistent-type-assertions: warn`). Prefer type guards (`if ('field' in obj)`).
- **No `!` non-null assertion** (`@typescript-eslint/no-non-null-assertion: warn`). Use `if (x != null)` instead.

### Routes

- `route.ts` files may ONLY export HTTP method handlers + Next.js config (`GET`, `POST`, `dynamic`, `maxDuration`, ...). Helpers go in a sibling folder prefixed with `_` (e.g. `_lib/serialize.ts`). Enforced by `scripts/check-route-exports.mjs`.
- All mutation routes (POST/PATCH/DELETE) should validate input via `withSchema(...)` from `src/lib/with-schema.ts`.
- Soft-deleted models (User, Pet, Booking) MUST filter `deletedAt: null` on every read. Use `notDeleted({...})` from `src/lib/prisma-soft.ts`.

### Components

- **No god-files**: keep React components under 500 LOC. Split into `_components/` siblings.
- Tailwind classes only (no CSS modules, no styled-components).
- French + English supported via `next-intl`. New strings → `messages/fr.json` + `messages/en.json`.

### Money

- All MAD amounts use Prisma `Decimal @db.Decimal(10,2)`. Never `Float`. See ADR-0005.
- Use `formatMAD()` for display. Use `toNumber()` for JS arithmetic at the boundary.

### Tests

- Lib code → unit tests in `src/lib/__tests__/`
- API routes → integration tests in `src/__tests__/api/`
- Run with `npm test`

---

## 8. Common commands cheat sheet

```bash
# Dev loop
npm run dev                   # Start Next.js dev server
npm test                      # Run unit tests once
npm run test:ui               # Vitest UI (live re-run)
npx tsc --noEmit              # Type check (no build)
npm run lint                  # ESLint

# DB
npm run db:studio             # Prisma Studio (visual DB browser)
npm run db:push               # Push schema changes (no migration file)
npm run db:migrate            # Create + apply migration file
npm run db:doc                # Regenerate docs/SCHEMA.md

# Migration runner (used by Vercel build)
npm run db:migrate:deploy     # Apply pending migrations + record checksums

# Build
npm run build                 # next build (fails on Google Fonts without internet)
npm run analyze               # Bundle analyzer
node scripts/check-bundle-budget.mjs  # CI bundle size guard
node scripts/check-route-exports.mjs  # CI route.ts guard

# Mutation testing (financial paths)
npm run mutation              # Stryker
```

---

## 9. Deployment

We deploy to **Vercel** via `main` branch.

```
PR → CI green → merge to main → Vercel auto-deploy → production
```

There's **no staging environment** today. Preview deployments are auto-created per PR — that's your "staging".

Migrations run automatically as part of `next build` (via `scripts/db-migrate.mjs`).

For destructive operations or one-shot data fixes, see `docs/RUNBOOK.md`.

---

## 10. Asking for help

1. Search `CLAUDE.md` first — most decisions are already documented.
2. Check `docs/adr/` for the rationale behind major choices.
3. Check `docs/RUNBOOK.md` for incident playbooks.
4. Open a GitHub Discussion before opening a PR if the change is non-trivial.

---

## 11. Reading list (in order)

1. **`CLAUDE.md`** — the project's permanent memory (1h read, but skim first)
2. **`docs/adr/README.md`** — index of architecture decisions
3. **`docs/SCHEMA.md`** — auto-generated DB schema overview
4. **`docs/RUNBOOK.md`** — what to do when prod breaks
5. The codebase. Start in `src/app/[locale]/admin/dashboard/page.tsx` to see how a typical Server Component + Promise.all data load works.

Welcome aboard 🐾
