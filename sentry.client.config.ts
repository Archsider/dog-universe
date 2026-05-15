// Legacy entry-point retained for any tool/plugin that still references the
// old `sentry.client.config.ts` filename. The active client init lives in
// `src/instrumentation-client.ts` (Sentry SDK v9+ pattern). DSN comes from
// the shared `src/lib/sentry-dsn.ts` resolver — same value as server + edge.
import * as Sentry from '@sentry/nextjs';
import { SENTRY_DSN } from './src/lib/sentry-dsn';

Sentry.init({
  dsn: SENTRY_DSN,

  // Capture 10% of transactions for performance monitoring
  tracesSampleRate: 0.1,

  // Capture replays only on errors (not on every session)
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0,

  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: false,
    }),
  ],

  // Don't send errors in development
  enabled: process.env.NODE_ENV === 'production',

  // RGPD : pas d'envoi de PII (IP, headers, cookies)
  sendDefaultPii: false,

  // Bruit : fetch annulé par navigation utilisateur, plugins navigateur,
  // erreurs réseau hors-app (Wi-Fi qui tombe, 4G qui change de cellule…).
  // Pas des bugs — silence sans casser le tracking des vraies erreurs.
  ignoreErrors: [
    'TypeError: network error',
    'TypeError: Failed to fetch',
    'TypeError: Load failed',
    'TypeError: NetworkError when attempting to fetch resource.',
    'AbortError',
    'The user aborted a request.',
    'ResizeObserver loop limit exceeded',
    'ResizeObserver loop completed with undelivered notifications.',
    'Non-Error promise rejection captured',
  ],

  beforeSend(event) {
    if (event.user) {
      delete event.user.email;
      delete event.user.ip_address;
    }
    return event;
  },
});
