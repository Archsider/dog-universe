# CSP Rollout — Report-Only → Enforce

Tier 2 hardening (2026-05-09).

## State today (Report-Only)

The strict CSP defined in `next.config.mjs` ships as `Content-Security-Policy-Report-Only`. Browsers enforce nothing; they POST violation reports to `/api/csp-report` (logged via `console.error` → Sentry breadcrumb).

```
default-src 'self';
script-src 'self' 'unsafe-inline' https://*.sentry.io;
style-src 'self' 'unsafe-inline';
img-src 'self' data: https://*.supabase.co;
font-src 'self' data:;
connect-src 'self' https://*.supabase.co https://*.sentry.io https://*.upstash.io;
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
report-uri /api/csp-report
```

The nonce-based enforced CSP currently lives in `src/middleware/i18n.ts` and is unchanged.

## Phase 1 — Observe (2 weeks minimum)

Goal: collect a representative sample of real traffic across all client/admin flows.

1. Deploy this commit to production.
2. Tail Sentry for breadcrumbs `service=csp message=csp-violation`.
3. Walk the major flows: signin, register, booking creation (BOARDING + PET_TAXI), payment, photo upload, vaccinations extract, admin Kanban, admin invoices, admin reviews, RGPD export.
4. Ask a few clients to use the PWA on Android + iOS; collect any third-party domains they hit (banks, captchas, etc).

Aggregate the violations. Each unique `effective-directive` + `blocked-uri` is one entry to investigate.

## Phase 2 — Tighten

For each violation, decide:

- **Add to allowlist** — legitimate third-party (e.g. Sentry CDN, Supabase). Add the host to the corresponding directive in `next.config.mjs`.
- **Refactor** — inline `<script>` or `<style>` we own. Move to a file or attach a nonce.
- **Drop `'unsafe-inline'`** — only after every inline script/style is either refactored or covered by a nonce. Until then, keep `'unsafe-inline'` in `script-src` to avoid breaking React / Next dev tooling.

Keep the policy in Report-Only mode through this phase; redeploys here are non-breaking.

## Phase 3 — Enforce

Once `/api/csp-report` is quiet for ~7 consecutive days:

1. Move the policy string into the existing nonce-based middleware (`src/middleware/i18n.ts` injects `Content-Security-Policy`). Merge directives.
2. Remove the `Content-Security-Policy-Report-Only` entry from `next.config.mjs`, OR keep it briefly to compare enforced vs. report-only counts.
3. Deploy and watch error rates / Sentry for a full traffic cycle (24 h).

## Rollback

Cutting the enforce header is one PR: revert the change in `next.config.mjs` / `src/middleware/i18n.ts` and redeploy. CSP violations don't corrupt data, so a fast rollback is safe.

## Why Report-Only first

Strict CSP is the highest-leverage XSS mitigation we have, but a misconfigured policy bricks the app for every visitor (white screen, no JS). Report-Only buys us the violation feed without the user-visible failure mode.
