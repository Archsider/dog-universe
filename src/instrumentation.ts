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

// Top-level probe — fires when the module is LOADED (regardless of whether
// register() is later invoked). Discriminator:
//   - This log present + REGISTER CALLED absent → Next loads the file but
//     doesn't call register() (Next config issue, conventions, etc).
//   - Both absent → the file isn't loaded at all (outputFileTracing excludes
//     it, lambda bundling drops it, wrong path detection by Next 15).
//   - Both present → instrumentation works; drill into sentry.server.config.ts
//     for the silent init failure.
// Two separate `console.log` lines, both unconditional, both fire-and-forget.
// Remove the pair once Sentry server observability is confirmed green.
console.log('INSTRUMENTATION FILE LOADED', { runtime: process.env.NEXT_RUNTIME });

export async function register() {
  console.log('INSTRUMENTATION REGISTER CALLED', process.env.NEXT_RUNTIME);

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
