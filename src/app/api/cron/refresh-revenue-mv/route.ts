import { revalidateTag } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { log } from '@/lib/logger';
import { defineCron } from '@/lib/cron-runner';
import { markMVRefreshed } from '@/lib/billing/monthly-revenue';

export const maxDuration = 60;

/**
 * GET /api/cron/refresh-revenue-mv
 *
 * Daily 02:00 UTC refresh of `monthly_revenue_mv` (low-traffic window).
 * Complements the hourly /api/cron/refresh-monthly-revenue tick: hourly
 * keeps the view fresh during business hours, daily guarantees a full
 * baseline refresh + admin-counts tag bust so the dashboard reflects
 * cross-day reconciliations.
 *
 * Falls back to non-concurrent refresh when CONCURRENTLY fails (initial
 * populate or missing unique index).
 */
export const GET = defineCron({
  name: 'refresh-revenue-mv',
  period: 'daily',
  lockName: 'refresh-revenue-mv-daily',
  fn: async () => {
    try {
      await prisma.$executeRawUnsafe(
        'REFRESH MATERIALIZED VIEW CONCURRENTLY monthly_revenue_mv',
      );
      // Stamp Redis ONLY after a successful REFRESH (Sémantique B contract).
      await markMVRefreshed();
      revalidateTag('admin-counts');
      await log('info', 'cron-refresh-revenue-mv', 'refreshed monthly_revenue_mv (daily)');
      return { mode: 'concurrent', refreshedAt: new Date().toISOString() };
    } catch (err) {
      try {
        await prisma.$executeRawUnsafe(
          'REFRESH MATERIALIZED VIEW monthly_revenue_mv',
        );
        await markMVRefreshed();
        revalidateTag('admin-counts');
        await log('warn', 'cron-refresh-revenue-mv', 'fallback non-concurrent refresh', {
          error: err instanceof Error ? err.message : String(err),
        });
        return { mode: 'non-concurrent' };
      } catch (err2) {
        await log('error', 'cron-refresh-revenue-mv', 'refresh failed', {
          error: err2 instanceof Error ? err2.message : String(err2),
        });
        throw new Error('Refresh failed');
      }
    }
  },
});
