import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Capture 10% of transactions
  tracesSampleRate: 0.1,

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
