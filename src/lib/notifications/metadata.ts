/**
 * parseMetadata — décodage sécurisé du champ Notification.metadata.
 *
 * Centralise les 6 call sites historiques JSON.parse(n.metadata ?? '{}') des crons.
 * Retourne {} sur null, parse error, array ou non-object.
 */
import * as Sentry from '@sentry/nextjs';

export function parseMetadata(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    try {
      Sentry.addBreadcrumb({
        category: 'notif',
        level: 'warning',
        message: 'metadata parse failed',
        data: { raw: raw.slice(0, 100) },
      });
    } catch { /* sentry not initialised */ }
    return {};
  }
}
