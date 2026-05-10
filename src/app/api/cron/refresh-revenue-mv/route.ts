import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { acquireCronLock } from '@/lib/cron-lock';
import { log } from '@/lib/logger';

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
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
    ?? req.headers.get('authorization')?.replace('Bearer ', '');

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    await log('error', 'cron-refresh-revenue-mv', 'CRON_SECRET not configured');
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }
  const secretBuf = Buffer.from(secret ?? '');
  const expectedBuf = Buffer.from(cronSecret);
  const authorized =
    secretBuf.length === expectedBuf.length && timingSafeEqual(secretBuf, expectedBuf);
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const acquired = await acquireCronLock('refresh-revenue-mv-daily', 23 * 3600, 'daily');
  if (!acquired) {
    return NextResponse.json({ skipped: true, reason: 'already_run' }, { status: 200 });
  }

  try {
    await prisma.$executeRawUnsafe(
      'REFRESH MATERIALIZED VIEW CONCURRENTLY monthly_revenue_mv',
    );
    revalidateTag('admin-counts');
    await log('info', 'cron-refresh-revenue-mv', 'refreshed monthly_revenue_mv (daily)');
    return NextResponse.json({ ok: true, mode: 'concurrent', refreshedAt: new Date().toISOString() });
  } catch (err) {
    try {
      await prisma.$executeRawUnsafe(
        'REFRESH MATERIALIZED VIEW monthly_revenue_mv',
      );
      revalidateTag('admin-counts');
      await log('warn', 'cron-refresh-revenue-mv', 'fallback non-concurrent refresh', {
        error: err instanceof Error ? err.message : String(err),
      });
      return NextResponse.json({ ok: true, mode: 'non-concurrent' });
    } catch (err2) {
      await log('error', 'cron-refresh-revenue-mv', 'refresh failed', {
        error: err2 instanceof Error ? err2.message : String(err2),
      });
      return NextResponse.json({ error: 'Refresh failed' }, { status: 500 });
    }
  }
}
