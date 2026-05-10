import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { acquireCronLock } from '@/lib/cron-lock';
import { markCronRun } from '@/lib/observability';
import { log } from '@/lib/logger';

export const maxDuration = 60;

/**
 * GET /api/cron/refresh-monthly-revenue
 *
 * Hourly cron — refreshes the `monthly_revenue_mv` materialized view that
 * pre-aggregates encashed revenue per (year, month, category). The unique
 * index on (year, month, category) lets PostgreSQL use REFRESH … CONCURRENTLY
 * so the view stays readable during the refresh.
 *
 * The view is not yet wired into reporting — see
 * src/lib/metrics.ts (revenueByCategoryProrata) for the future switch.
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
    ?? req.headers.get('authorization')?.replace('Bearer ', '');

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    await log('error', 'cron-refresh-mv', 'CRON_SECRET not configured');
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }
  const secretBuf = Buffer.from(secret ?? '');
  const expectedBuf = Buffer.from(cronSecret);
  const authorized =
    secretBuf.length === expectedBuf.length && timingSafeEqual(secretBuf, expectedBuf);
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Lock per hour: embed the hour in the lock name so back-to-back Vercel
  // retries within the same hour are deduped, but the next hour's run
  // proceeds normally.
  const hourKey = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
  const acquired = await acquireCronLock(`refresh-mv-${hourKey}`, 3500, 'daily');
  if (!acquired) {
    return NextResponse.json({ skipped: true, reason: 'already_run' }, { status: 200 });
  }

  await markCronRun('refresh-monthly-revenue');

  try {
    await prisma.$executeRawUnsafe(
      'REFRESH MATERIALIZED VIEW CONCURRENTLY monthly_revenue_mv',
    );
    await log('info', 'cron-refresh-mv', 'refreshed monthly_revenue_mv');
    return NextResponse.json({ ok: true, refreshedAt: new Date().toISOString() });
  } catch (err) {
    // CONCURRENTLY requires the unique index — if missing or first-time
    // populate, fall back to a non-concurrent refresh.
    try {
      await prisma.$executeRawUnsafe(
        'REFRESH MATERIALIZED VIEW monthly_revenue_mv',
      );
      await log('warn', 'cron-refresh-mv', 'fallback non-concurrent refresh', {
        error: err instanceof Error ? err.message : String(err),
      });
      return NextResponse.json({ ok: true, mode: 'non-concurrent' });
    } catch (err2) {
      await log('error', 'cron-refresh-mv', 'refresh failed', {
        error: err2 instanceof Error ? err2.message : String(err2),
      });
      return NextResponse.json({ error: 'Refresh failed' }, { status: 500 });
    }
  }
}
