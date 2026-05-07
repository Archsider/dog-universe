# Performance — Bundle analysis & runtime tuning

## Bundle analyzer

The project ships with `@next/bundle-analyzer` wired into `next.config.mjs`,
gated by an env flag so production builds stay fast.

### Run the analyzer

```bash
npm run analyze
```

This is equivalent to `ANALYZE=true next build`. Three reports are generated:

- `.next/analyze/client.html`   — what ends up in the **browser bundle**
- `.next/analyze/edge.html`     — what ends up in **middleware / edge runtime**
- `.next/analyze/nodejs.html`   — what ends up in **server / serverless lambdas**

Open them in a browser. Each file is a treemap. Larger rectangles = bigger bytes.

### What to look for

- **Client bundle bloat** — anything in `client.html` that doesn't need to run
  in the browser. Server-only deps (Prisma, ioredis, bullmq, sharp,
  `@react-pdf/renderer`) should *never* show up there. They are listed in
  `serverExternalPackages` in `next.config.mjs`. If one leaks, hunt the
  import chain.
- **Duplicate copies** — if a package appears multiple times under different
  versions, add a `resolutions` / `overrides` entry in `package.json`.
- **Edge runtime** — the middleware bundle has a hard 1 MB limit on Vercel.
  Anything dragged into `src/middleware.ts` (auth, rate-limit) must stay
  Edge-compatible. No Node APIs.
- **Lambda size** — Vercel cap is 250 MB unzipped. `outputFileTracingExcludes`
  in `next.config.mjs` already strips `.git`, `.next/cache`, Sentry CLI,
  Playwright. Watch for new heavy deps that creep into the trace.

### Top dependencies to monitor

These are the largest contributors observed during the Tier 3 baseline; sizes
will drift as deps update — re-run `npm run analyze` to refresh:

1. `@react-pdf/renderer` — server-only (excluded from client bundle)
2. `recharts` — client (admin dashboard chart)
3. `react-leaflet` + `leaflet` — client (taxi tracking)
4. `@sentry/nextjs` — both runtimes
5. `next-intl` — both runtimes
6. `@prisma/client` — server-only
7. `bullmq` + `ioredis` — server-only
8. `lucide-react` — client (icons; tree-shaken per import)
9. `signature_pad` — client (contract modal — already lazy-loaded)
10. `qrcode` / `qrcode.react` — client (member card)

If a client-only icon library (e.g. `lucide-react`) starts looking heavy,
double-check the import shape: `import { X } from 'lucide-react'` is
tree-shaken; `import * as Icons from 'lucide-react'` is not.

## Lazy modals (admin)

Heavy admin modals are loaded with `next/dynamic` from thin client wrappers
to keep them out of the initial render path:

- `src/app/[locale]/admin/billing/PaymentModal.tsx`
  — wrapped via `PaymentModalLazy.tsx`
- `src/components/admin/CreateStandaloneInvoiceModal.tsx`
  — wrapped via `CreateStandaloneInvoiceModalLazy.tsx`
- `src/components/admin/AdminCreateBookingModal.tsx`
  — wrapped via `AdminCreateBookingModalLazy.tsx`
- `src/components/contract/ContractModal.tsx`
  — dynamic-loaded inside `ContractGate.tsx` (already a client component)

The wrappers call `dynamic(() => import('./Modal'), { ssr: false })` so
the modal JS is fetched only when the user opens it.

## RSC streaming on dashboard

`/admin/dashboard` is split into Suspense boundaries:

- KPIs (top-of-fold) render synchronously with the page shell
- Recent activity (chart + recent bookings + check-ins/outs) streams in
  via `<Suspense>` with a skeleton fallback
- Lower sections (top 5 clients) stream independently

Same `revalidate = 60` ISR window is preserved.

## Edge caching (public routes)

- `GET /api/availability` — `Cache-Control: public, s-maxage=60,
  stale-while-revalidate=300` + `revalidate = 60` ISR
- `GET /api/client/products` — auth-gated, `private, max-age=30` for
  browser cache only (no shared cache)

## See also

- [DATABASE.md](./DATABASE.md) — pgbouncer / connection pooling
- [MUTATION_TESTING.md](./MUTATION_TESTING.md) — mutation testing setup
