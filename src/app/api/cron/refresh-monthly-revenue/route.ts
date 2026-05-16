import { prisma } from '@/lib/prisma';
import { log } from '@/lib/logger';
import { defineCron } from '@/lib/cron-runner';
import { markMVRefreshed } from '@/lib/billing/monthly-revenue';

export const maxDuration = 60;

/**
 * GET /api/cron/refresh-monthly-revenue
 *
 * Hourly cron — refreshes the `monthly_revenue_mv` materialized view that
 * pre-aggregates encashed revenue per (year, month, category). The unique
 * index on (year, month, category) lets PostgreSQL use REFRESH … CONCURRENTLY
 * so the view stays readable during the refresh.
 *
 * Lock strategy: the lock key embeds the current hour (YYYY-MM-DDTHH) so
 * Vercel back-to-back retries within the same hour are deduped, but the
 * next hour's run proceeds normally. We use `lockName` to override the
 * default `name`-based key.
 */
export const GET = defineCron({
  name: 'refresh-monthly-revenue',
  period: 'daily', // period controls the TTL formula; actual dedup is via lockName (hourly key)
  lockName: () => `refresh-mv-${new Date().toISOString().slice(0, 13)}`, // YYYY-MM-DDTHH
  ttlSeconds: 3500,
  fn: async () => {
    try {
      await prisma.$executeRawUnsafe(
        'REFRESH MATERIALIZED VIEW CONCURRENTLY monthly_revenue_mv',
      );
      // Stamp Redis ONLY after a successful REFRESH. If the REFRESH throws,
      // markMVRefreshed is skipped → staleness signal persists → readers
      // fall back to live compute (Sémantique B fast/slow path contract).
      await markMVRefreshed();
      await log('info', 'cron-refresh-mv', 'refreshed monthly_revenue_mv');
      return { refreshedAt: new Date().toISOString() };
    } catch (err) {
      // CONCURRENTLY requires the unique index — if missing or first-time
      // populate, fall back to a non-concurrent refresh.
      try {
        await prisma.$executeRawUnsafe(
          'REFRESH MATERIALIZED VIEW monthly_revenue_mv',
        );
        await markMVRefreshed();
        await log('warn', 'cron-refresh-mv', 'fallback non-concurrent refresh', {
          error: err instanceof Error ? err.message : String(err),
        });
        return { mode: 'non-concurrent' };
      } catch (err2) {
        await log('error', 'cron-refresh-mv', 'refresh failed', {
          error: err2 instanceof Error ? err2.message : String(err2),
        });
        throw new Error('Refresh failed');
      }
    }
  },
});
