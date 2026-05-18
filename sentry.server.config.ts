// Server-side Sentry init for the Node.js runtime (API routes, RSC,
// Server Actions, crons). Loaded by `src/instrumentation.ts` via dynamic
// import in `register()` when NEXT_RUNTIME === 'nodejs'.
//
// DSN is resolved through `src/lib/sentry-dsn.ts` — same source of truth as
// the edge config and the client `instrumentation-client.ts`. See that file
// for the resolution order. A diag log is emitted at init so the operator
// can confirm in Vercel runtime logs which DSN source actually won (and
// catch a future env-var drift before it silences server events again —
// which is the exact failure mode that hid bug #6 for weeks: NEXT_PUBLIC_
// SENTRY_DSN on Vercel pointed at a stale "sentry-celeste-bucket" project
// that no longer existed. See docs/SENTRY_INTEGRATION.md).

import * as Sentry from '@sentry/nextjs';
import { resolveSentryDsn } from './src/lib/sentry-dsn';

const { dsn, source } = resolveSentryDsn();

Sentry.init({
  dsn,

  // Known-benign noise on Node runtime — filtered before send to keep the
  // Sentry signal high. Each entry below is justified by a real incident:
  //
  //  - "Connection is closed.":
  //    BullMQ ephemeral workers on Vercel serverless (/api/workers/process)
  //    close their ioredis blocking client at the end of each tick. Any
  //    pending BRPOPLPUSH / queue probe in flight at that moment rejects
  //    with this message. Functional impact: nil (jobs are already
  //    processed before close()). Sentry noise: high. Filtering here
  //    instead of swallowing in the worker so we don't mask a real
  //    connection problem if it ever shows up in a non-shutdown context —
  //    a real outage would surface as repeated "ECONNREFUSED" or
  //    "ETIMEDOUT", which we DO want to see.
  ignoreErrors: [
    /Connection is closed\.?$/,
  ],

  // Dynamic sampling tuned for 10x growth (May 17 scale prep):
  //  - 1.0 for crons (low volume, high signal — never miss a job failure)
  //  - 0.1 for API routes and everything else (~10% sample is enough to
  //    surface regressions while keeping monthly transaction budget bounded
  //    when API QPS grows by an order of magnitude).
  // A static `tracesSampleRate: 1.0` would have multiplied Sentry transaction
  // ingestion cost by 10× at the projected traffic — see PR scale-prep-may17.
  tracesSampler: (samplingContext) => {
    const url = (samplingContext.attributes?.['http.url'] as string | undefined)
      ?? (samplingContext.normalizedRequest?.url as string | undefined)
      ?? '';
    if (typeof url === 'string' && url.includes('/api/cron/')) return 1.0;
    return 0.1;
  },

  // Don't send errors in development
  enabled: process.env.NODE_ENV === 'production',

  // RGPD : pas d'envoi de PII (IP, headers, cookies)
  sendDefaultPii: false,

  beforeSend(event) {
    // Strip PII from user context
    if (event.user) {
      delete event.user.email;
      delete event.user.ip_address;
      delete event.user.username;
    }
    // Strip sensitive request headers
    if (event.request?.headers) {
      delete (event.request.headers as Record<string, unknown>)['cookie'];
      delete (event.request.headers as Record<string, unknown>)['Cookie'];
      delete (event.request.headers as Record<string, unknown>)['authorization'];
      delete (event.request.headers as Record<string, unknown>)['Authorization'];
    }
    if (event.request?.cookies) {
      delete event.request.cookies;
    }
    // Strip phone/email/password from extra data
    if (event.extra) {
      for (const key of Object.keys(event.extra)) {
        if (/email|phone|password/i.test(key)) delete event.extra[key];
      }
    }
    return event;
  },
});

// Diag log: prints once per cold start. Search "[sentry-server] init" in
// Vercel runtime logs to confirm the SDK actually initialised AND which DSN
// source was used. Kept as a permanent observability signal — if the env
// var ever drifts to a wrong project again (bug #6, May 15), this is the
// first place to look.
if (process.env.NODE_ENV === 'production') {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({
    level: 'info',
    service: 'sentry-server',
    message: 'init',
    timestamp: new Date().toISOString(),
    dsnSource: source,
    dsnHostname: (() => { try { return new URL(dsn).hostname; } catch { return 'invalid'; } })(),
    enabled: true,
  }));
}
