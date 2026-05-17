import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { requireRole } from '@/lib/auth-guards';
import { prisma } from '@/lib/prisma';
import { log, logger } from '@/lib/logger';
import { markMVRefreshed } from '@/lib/billing/monthly-revenue';

/**
 * POST /api/admin/refresh-revenue-mv
 *
 * Manual on-demand refresh of `monthly_revenue_mv`. Reserved to SUPERADMIN
 * because it temporarily increases DB load (the view is normally refreshed
 * hourly by /api/cron/refresh-monthly-revenue and daily by
 * /api/cron/refresh-revenue-mv).
 *
 * Useful when an admin has just recorded a backdated payment or large
 * invoice correction and wants the analytics dashboard to reflect it
 * immediately, without waiting for the next cron tick.
 *
 * Falls back to a non-concurrent refresh when CONCURRENTLY fails (first
 * populate or missing unique index). Always invalidates the `admin-counts`
 * tag so the dashboard re-fetches.
 */
export async function POST() {
  const guard = await requireRole(['SUPERADMIN']);
  if (guard.error) return guard.error;
  const { session } = guard;

  try {
    await prisma.$executeRawUnsafe(
      'REFRESH MATERIALIZED VIEW CONCURRENTLY monthly_revenue_mv',
    );
    // Stamp Redis ONLY after a successful REFRESH (Sémantique B contract).
    await markMVRefreshed();
    revalidateTag('admin-counts');
    await log('info', 'admin-refresh-mv', 'manual refresh ok', {
      userId: session.user.id,
    });
    return NextResponse.json({ ok: true, mode: 'concurrent', refreshedAt: new Date().toISOString() });
  } catch (err) {
    try {
      await prisma.$executeRawUnsafe(
        'REFRESH MATERIALIZED VIEW monthly_revenue_mv',
      );
      await markMVRefreshed();
      revalidateTag('admin-counts');
      await log('warn', 'admin-refresh-mv', 'fallback non-concurrent refresh', {
        userId: session.user.id,
        error: err instanceof Error ? err.message : String(err),
      });
      return NextResponse.json({ ok: true, mode: 'non-concurrent' });
    } catch (err2) {
      await log('error', 'admin-refresh-mv', 'refresh failed', {
        userId: session.user.id,
        error: err2 instanceof Error ? err2.message : String(err2),
      });
      return NextResponse.json({ error: 'Refresh failed' }, { status: 500 });
    }
  }
}
