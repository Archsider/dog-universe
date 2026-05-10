#!/usr/bin/env node
/**
 * scripts/check-e2e-secrets.mjs
 *
 * Verifies the Playwright E2E env vars are all set, then exits:
 *   - 0 → all secrets present, Playwright should run with real auth
 *   - 1 → at least one missing, tests will skip gracefully (CI stays green
 *         thanks to test.skip() in e2e/helpers/auth.ts) — script exits non-zero
 *         so local devs notice the gap.
 *
 * Use locally:   node scripts/check-e2e-secrets.mjs
 * Use in CI:     not blocking — the job already gates on env.TEST_CLIENT_EMAIL.
 *
 * See docs/E2E_SETUP.md for the full setup guide.
 */

const REQUIRED = [
  'TEST_CLIENT_EMAIL',
  'TEST_CLIENT_PASSWORD',
  'TEST_CLIENT_NAME',
  'TEST_ADMIN_EMAIL',
  'TEST_ADMIN_PASSWORD',
];

const OPTIONAL = ['PLAYWRIGHT_BASE_URL'];

const missing = REQUIRED.filter((k) => !process.env[k] || process.env[k] === '');
const presentOptional = OPTIONAL.filter((k) => !!process.env[k]);

if (missing.length === 0) {
  console.log('[e2e-secrets] OK — all required E2E secrets are set:');
  for (const k of REQUIRED) {
    const v = process.env[k];
    const masked = k.includes('PASSWORD') ? '***' : v.slice(0, 3) + '…';
    console.log(`  - ${k} = ${masked}`);
  }
  if (presentOptional.length > 0) {
    console.log('[e2e-secrets] Optional env:');
    for (const k of presentOptional) console.log(`  - ${k} = ${process.env[k]}`);
  }
  process.exit(0);
}

console.log('[e2e-secrets] Missing required E2E secrets:');
for (const k of missing) console.log(`  - ${k}`);
console.log('');
console.log('Tests will skip gracefully (CI stays green) but you will not run real auth flows.');
console.log('See docs/E2E_SETUP.md for the full setup guide.');
process.exit(1);
