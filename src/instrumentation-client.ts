// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import { SENTRY_DSN } from "@/lib/sentry-dsn";

Sentry.init({
  // DSN resolved by `src/lib/sentry-dsn.ts` — same source of truth as the
  // server + edge configs. Hardcoded fallback inside the resolver keeps the
  // client working even if NEXT_PUBLIC_SENTRY_DSN drifts off the env list.
  dsn: SENTRY_DSN,

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 0.1,
  // Enable logs to be sent to Sentry
  enableLogs: true,

  // RGPD : pas d'envoi de PII (IP, headers, cookies). Les emails/IPs explicitement
  // attachés à un event sont nettoyés par beforeSend ci-dessous.
  sendDefaultPii: false,

  // Bruit : fetch annulé par navigation utilisateur, plugins navigateur,
  // erreurs réseau hors-app (Wi-Fi qui tombe, 4G qui change de cellule…).
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
    // Strip PII from user context
    if (event.user) {
      delete event.user.email;
      delete event.user.ip_address;
      delete event.user.username;
    }
    // Strip sensitive request headers (client-side — belt-and-suspenders)
    if (event.request?.headers) {
      delete (event.request.headers as Record<string, unknown>)['cookie'];
      delete (event.request.headers as Record<string, unknown>)['authorization'];
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

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
