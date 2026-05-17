// Health snapshot endpoint — SUPERADMIN only.
// Returns invariant violations + DLQ count + crons last-run timestamps + SMS stats.
// Used by /admin/health for manual refresh (auto-refresh 60s).
import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';
import { prisma } from '@/lib/prisma';
import { runAllInvariantChecks } from '@/lib/health-invariants';
import { getCronLastRun, CRON_NAMES, logServerError } from '@/lib/observability';
import { isBullMQConfigured } from '@/lib/redis-bullmq';
import { getDlqQueue } from '@/lib/queues';
import { getRecentSlowQueries, getSlowQueryStats, SLOW_QUERY_THRESHOLD_MS } from '@/lib/slow-query-monitor';
import { getDedupBlockedCount } from '@/lib/cache';

export const dynamic = 'force-dynamic';

function getDbPoolStatus(): { pooled: boolean; via: 'port' | 'pgbouncer-flag' | 'unknown'; warning: string | null } {
  // Heuristic: a Supabase Transaction Pooler URL points at port 6543 OR
  // explicitly carries `pgbouncer=true`. Surface this in /admin/health so
  // the SUPERADMIN can confirm at a glance that the pool is in front of
  // every Lambda — without it, scale ceiling is ~500 connections.
  const url = process.env.DATABASE_URL ?? '';
  if (url.includes(':6543')) return { pooled: true, via: 'port', warning: null };
  if (url.includes('pgbouncer=true')) return { pooled: true, via: 'pgbouncer-flag', warning: null };
  return {
    pooled: false,
    via: 'unknown',
    warning:
      'DATABASE_URL is not on the Supabase Transaction Pooler. ' +
      'Switch to port 6543 — see docs/PGBOUNCER.md.',
  };
}

async function getSmsStats() {
  try {
    const since24h = new Date(Date.now() - 24 * 3_600_000);
    const [sent24h, pending24h, last, recent, blockedToday] = await Promise.all([
      prisma.smsLog.count({ where: { sentAt: { gte: since24h }, status: 'SENT' } }),
      prisma.smsLog.count({ where: { sentAt: { gte: since24h }, status: 'PENDING' } }),
      prisma.smsLog.findFirst({ orderBy: { sentAt: 'desc' }, select: { sentAt: true } }),
      prisma.smsLog.findMany({
        orderBy: { sentAt: 'desc' },
        take: 20,
        select: { phone: true, status: true, sentAt: true, bookingId: true },
      }),
      getDedupBlockedCount(),
    ]);
    return {
      sent24h,
      pending24h,
      blockedToday,
      lastSentAt: last?.sentAt?.toISOString() ?? null,
      recent: recent.map((r) => ({
        phone: r.phone === 'ADMIN'
          ? 'ADMIN'
          : r.phone.length <= 4
            ? '****'
            : `${r.phone.slice(0, 4)}****${r.phone.slice(-2)}`,
        status: r.status,
        sentAt: r.sentAt.toISOString(),
        bookingId: r.bookingId,
      })),
    };
  } catch {
    return null;
  }
}

export async function GET() {
  const authResult = await requireRole(['SUPERADMIN']);
  if (authResult.error) return authResult.error;

  try {
    const [invariants, cronRuns, dlqCount, smsStats, slowQueryStats, slowQueriesSample] =
      await Promise.all([
        runAllInvariantChecks(),
        Promise.all(
          CRON_NAMES.map(async (name) => ({ name, lastRun: await getCronLastRun(name) })),
        ),
        (async () => {
          if (!isBullMQConfigured()) return null;
          try {
            const dlq = getDlqQueue();
            if (!dlq) return null;
            const counts = await dlq.getJobCounts('waiting', 'failed', 'completed');
            return (counts.waiting ?? 0) + (counts.failed ?? 0);
          } catch (err) {
            logServerError('health', 'DLQ count failed', err);
            return null;
          }
        })(),
        getSmsStats(),
        getSlowQueryStats(),
        // Top 10 most recent slow queries — enough to spot a pattern without
        // bloating the response payload (each entry can be ~600 bytes).
        getRecentSlowQueries().then((all) => all.slice(0, 10)),
      ]);

    return NextResponse.json({
      invariants,
      cronRuns,
      dlqCount,
      smsStats,
      dbPool: getDbPoolStatus(),
      slowQueries: {
        thresholdMs: SLOW_QUERY_THRESHOLD_MS,
        stats: slowQueryStats, // null when no data
        recent: slowQueriesSample,
      },
      sentry: {
        available: !!process.env.SENTRY_DSN,
        note: 'open issues not queried via SaaS API',
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    logServerError('health', 'health snapshot failed', err);
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500 });
  }
}
