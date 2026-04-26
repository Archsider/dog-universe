import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Capture 10% of transactions
  tracesSampleRate: 0.1,

  // Don't send errors in development
  enabled: process.env.NODE_ENV === 'production',
});
