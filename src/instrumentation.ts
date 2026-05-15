// Next.js 15 App Router instrumentation entry-point. With a `src/` directory
// present, Next loads THIS file (not the root one) — having both was the
// source of a silent prod regression where boot-checks lived in the root
// file but `onRequestError` lived here, so neither one had the full setup.
// Single file, single source of truth.
//
//   - register()         : called once per cold start in each runtime. Boots
//                          Sentry by importing the appropriate config file.
//   - assertProductionEnv: hard-fails the boot if a security-critical env
//                          var is missing (TOTP key, DB URL, etc). Runs only
//                          in the Node.js runtime — the edge runtime can't
//                          read the same set of secrets reliably.
//   - onRequestError     : exported hook Next 15 calls for every error
//                          thrown inside a route handler / RSC / server
//                          action. Fans the error to Sentry. Without this
//                          export, server throws are NEVER reported.

import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { assertProductionEnv } = await import('./lib/boot-checks');
    assertProductionEnv();
    await import('../sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
