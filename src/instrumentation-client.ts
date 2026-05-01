// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://5afa584dbdac521c8ba12d42a6e3394e@o4511208546828288.ingest.de.sentry.io/4511209470689360",

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 0.1,
  // Enable logs to be sent to Sentry
  enableLogs: true,

  // RGPD : pas d'envoi de PII (IP, headers, cookies). Les emails/IPs explicitement
  // attachés à un event sont nettoyés par beforeSend ci-dessous.
  sendDefaultPii: false,

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
