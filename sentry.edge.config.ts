// Edge-runtime Sentry init (middleware, edge route handlers). Loaded by
// `src/instrumentation.ts` via dynamic import in `register()` when
// NEXT_RUNTIME === 'edge'.
//
// DSN resolved through `src/lib/sentry-dsn.ts` — see server config for the
// rationale. The diag log is omitted here because the edge runtime serializes
// console output less reliably and a one-line print on every edge cold start
// would dominate the log feed.

import * as Sentry from '@sentry/nextjs';
import { SENTRY_DSN } from './src/lib/sentry-dsn';

Sentry.init({
  dsn: SENTRY_DSN,
  tracesSampleRate: 0.1,
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
