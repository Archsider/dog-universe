# E2E Playwright Setup

End-to-end tests run on every push to `main` and on every pull request via
`.github/workflows/ci.yml` (`e2e` job). They target the **production**
deployment (`https://app.doguniverse.ma`) and exercise critical user flows:
login, contract signature, TOTP enrollment, loyalty claims.

When the GitHub Actions secrets below are absent (forks, contributor PRs
without write access), every spec calls `test.skip()` in `beforeEach`
via `e2eSecretsAvailable()` from `e2e/helpers/auth.ts` — CI stays green.

---

## 1. Required GitHub Actions secrets

Add these in **Settings → Secrets and variables → Actions → New repository
secret**:

| Secret | Purpose | Example |
|---|---|---|
| `TEST_CLIENT_EMAIL` | Login email of the seeded test client | `e2e-client@doguniverse.ma` |
| `TEST_CLIENT_PASSWORD` | Password for that client | strong, 16+ chars |
| `TEST_CLIENT_NAME` | Display name expected on the client dashboard | `E2E Client` |
| `TEST_ADMIN_EMAIL` | Login email of the seeded test admin | `e2e-admin@doguniverse.ma` |
| `TEST_ADMIN_PASSWORD` | Password for that admin | strong, 16+ chars |
| `DATABASE_URL` | Already in use for the `build` job (Prisma migrate deploy). Reused here only to seed if needed. | `postgresql://…` |

The `PLAYWRIGHT_BASE_URL` env is hard-coded to
`https://app.doguniverse.ma` at the job level — change in
`.github/workflows/ci.yml` if you ever point at a staging deployment.

---

## 2. Create the test accounts in production

These must exist **before** the first CI run with secrets:

```sql
-- Run in Supabase SQL Editor

-- 2.1. Client account (CLIENT role)
INSERT INTO "User" (id, email, "passwordHash", name, role, "isWalkIn", "createdAt", "updatedAt")
VALUES (
  'usr_e2e_client',
  'e2e-client@doguniverse.ma',
  '<bcrypt hash of TEST_CLIENT_PASSWORD>',
  'E2E Client',
  'CLIENT',
  false,
  NOW(),
  NOW()
)
ON CONFLICT (email) DO NOTHING;

-- 2.2. Admin account (ADMIN role — not SUPERADMIN, to keep blast radius small)
INSERT INTO "User" (id, email, "passwordHash", name, role, "isWalkIn", "createdAt", "updatedAt")
VALUES (
  'usr_e2e_admin',
  'e2e-admin@doguniverse.ma',
  '<bcrypt hash of TEST_ADMIN_PASSWORD>',
  'E2E Admin',
  'ADMIN',
  false,
  NOW(),
  NOW()
)
ON CONFLICT (email) DO NOTHING;
```

Generate the bcrypt hash locally with:

```bash
node -e "console.log(require('bcrypt').hashSync(process.argv[1], 10))" '<password>'
```

> **Security**: do NOT commit passwords. They live only in GitHub Actions
> secrets + the production DB. Rotate every 90 days.

---

## 3. Verify the setup

### 3.1. Locally

```bash
export TEST_CLIENT_EMAIL=...
export TEST_CLIENT_PASSWORD=...
export TEST_CLIENT_NAME='E2E Client'
export TEST_ADMIN_EMAIL=...
export TEST_ADMIN_PASSWORD=...
export PLAYWRIGHT_BASE_URL=https://app.doguniverse.ma

node scripts/check-e2e-secrets.mjs
# → [e2e-secrets] OK — all required E2E secrets are set

npx playwright install chromium --with-deps
npx playwright test
```

### 3.2. In CI

After adding the secrets in GitHub, push a commit that touches anything
under `e2e/**` or rerun the latest CI run. The `e2e` job log should show:

- `Run Playwright tests` step executing (NOT the
  `Run Playwright tests (secrets absent — graceful skip)` step)
- All specs reporting pass/fail (not "skipped")

If you see `skipped`, check `secrets.TEST_CLIENT_EMAIL` is populated and
that the secret name matches exactly (case-sensitive).

---

## 4. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `LOGIN_FAILED` in spec output | DB account missing or password mismatch | Re-seed step 2 with the bcrypt hash of the current secret |
| `Timeout 30000ms exceeded` on first navigation | Production deploy lagging behind `main` | Wait for Vercel deploy, re-run the failed job |
| All specs skipped despite secrets configured | Secret name typo in Settings (case-sensitive!) | Compare `.github/workflows/ci.yml` `env:` block vs. Settings → Secrets |
| `gitignore` warning about `playwright-report/` artifacts | Local report dir polluting commits | Already gitignored in repo root `.gitignore` |

---

## 5. Adding new specs

1. Create `e2e/<feature>.spec.ts` and wrap with `test.skip` guard:

   ```ts
   import { test, expect } from '@playwright/test';
   import { e2eSecretsAvailable, requireEnv } from './helpers/auth';

   test.beforeEach(() => {
     if (!e2eSecretsAvailable()) test.skip();
   });

   test('feature flow', async ({ page }) => {
     const email = requireEnv('TEST_CLIENT_EMAIL');
     // ...
   });
   ```

2. The graceful-skip pattern lets the spec run in forks without secrets.

3. If your spec mutates production data (e.g. creates a booking), clean
   up in `afterEach` — the test admin/client should remain idempotent
   across runs.
