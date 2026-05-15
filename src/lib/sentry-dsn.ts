// Single source of truth for the Sentry DSN. Resolved in this order:
//
//   1. NEXT_PUBLIC_SENTRY_DSN — inlined at build time, available in every
//      runtime (server, edge, browser). The historical name on this project.
//   2. SENTRY_DSN              — runtime-only var (no NEXT_PUBLIC_ prefix),
//      kept as a fallback for environments that prefer not to inline the DSN
//      into the client bundle.
//   3. Hardcoded production DSN — DSNs are PUBLIC by design (domain-locked
//      at the Sentry project level), so embedding the prod DSN as a last-resort
//      fallback is safe and prevents an entire class of "DSN env var missing
//      → Sentry silently disabled" outages.
//
// Why this exists: the prior layout had `sentry.server.config.ts` reading
// NEXT_PUBLIC_SENTRY_DSN while `boot-checks.ts` validated SENTRY_DSN, and the
// new client file (`src/instrumentation-client.ts`) hardcoded the DSN — three
// drifting sources that caused "client events arrive but server is silent"
// for an unknown duration. One source, one fallback, one diag log on init.

const HARDCODED_PROD_DSN =
  'https://5afa584dbdac521c8ba12d42a6e3394e@o4511208546828288.ingest.de.sentry.io/4511209470689360';

export type SentryDsnSource = 'NEXT_PUBLIC_SENTRY_DSN' | 'SENTRY_DSN' | 'hardcoded-fallback';

export function resolveSentryDsn(): { dsn: string; source: SentryDsnSource } {
  const fromPublic = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (fromPublic && fromPublic.length > 10) {
    return { dsn: fromPublic, source: 'NEXT_PUBLIC_SENTRY_DSN' };
  }
  const fromServer = process.env.SENTRY_DSN;
  if (fromServer && fromServer.length > 10) {
    return { dsn: fromServer, source: 'SENTRY_DSN' };
  }
  return { dsn: HARDCODED_PROD_DSN, source: 'hardcoded-fallback' };
}

export const SENTRY_DSN = resolveSentryDsn().dsn;
