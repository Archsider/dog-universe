/**
 * Observability helpers — wraps Sentry.startSpan and structured logging.
 *
 * - `withSpan(name, attrs, fn)` : execute `fn` inside a Sentry span. Captures
 *   exceptions with span context, marks span as errored, then rethrows.
 * - `logServerError(service, message, error, extra?)` : structured stderr log
 *   (JSON one-liner) + Sentry capture. Use this in catch blocks of route
 *   handlers / crons where you want the stack trace visible in Vercel logs
 *   AND in Sentry.
 *
 * Both helpers fail-safe : Sentry init may be absent in dev, no throw.
 */

import * as Sentry from '@sentry/nextjs';
import { cacheSet, cacheGet } from './cache';

type SpanAttr = string | number | boolean | undefined | null;

export async function withSpan<T>(
  name: string,
  attributes: Record<string, SpanAttr>,
  fn: () => Promise<T>,
): Promise<T> {
  // Strip undefined/null attributes — Sentry rejects them silently but we
  // want clean logs.
  const cleanAttrs: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(attributes)) {
    if (v !== undefined && v !== null) cleanAttrs[k] = v;
  }

  return Sentry.startSpan({ name, attributes: cleanAttrs }, async (span) => {
    try {
      return await fn();
    } catch (err) {
      Sentry.captureException(err, {
        tags: { span: name },
        contexts: { spanAttributes: cleanAttrs },
      });
      try {
        span?.setStatus?.({ code: 2, message: 'internal_error' }); // 2 = ERROR
      } catch {
        // older Sentry SDKs: ignore
      }
      throw err;
    }
  });
}

export function logServerError(
  service: string,
  message: string,
  error: unknown,
  extra?: Record<string, unknown>,
): void {
  const err = error instanceof Error ? error : new Error(String(error));
  // Structured JSON line — easy to parse from Vercel logs.
  // eslint-disable-next-line no-console
  console.error(
    JSON.stringify({
      level: 'error',
      service,
      message,
      error: err.message,
      stack: err.stack,
      extra,
      timestamp: new Date().toISOString(),
    }),
  );
  try {
    Sentry.captureException(err, { tags: { service }, extra });
  } catch {
    // Sentry not initialized — already logged to stderr above.
  }
}

/**
 * Record the timestamp of the last successful cron run. Stored 7 days in
 * Redis under `cron:last_run:{name}`. Fail-open : if Redis is down the
 * value won't be set and `/admin/health` will display "unknown" — but the
 * cron still completes normally.
 */
export async function markCronRun(name: string): Promise<void> {
  try {
    await cacheSet(`cron:last_run:${name}`, new Date().toISOString(), 7 * 24 * 3600);
  } catch {
    // ignore
  }
}

export async function getCronLastRun(name: string): Promise<string | null> {
  try {
    return (await cacheGet<string>(`cron:last_run:${name}`)) ?? null;
  } catch {
    return null;
  }
}

export const CRON_NAMES = [
  'reminders',
  'birthday-notifications',
  'contract-reminders',
  'overdue-invoices',
  'review-requests',
  'weekly-pet-report',
  'dlq-watch',
  'taxi-retention',
  'db-backup',
  'refresh-monthly-revenue',
  'purge-anonymized',
  'health-reconciliation',
] as const;
