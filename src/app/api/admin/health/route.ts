// Health snapshot endpoint — SUPERADMIN only.
// Returns invariant violations + DLQ count + crons last-run timestamps + SMS stats.
// Used by /admin/health for manual refresh (auto-refresh 60s).
import { NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { prisma } from '@/lib/prisma';
import { runAllInvariantChecks } from '@/lib/health-invariants';
import { getCronLastRun, CRON_NAMES, logServerError } from '@/lib/observability';
import { isBullMQConfigured } from '@/lib/redis-bullmq';
import { getDlqQueue } from '@/lib/queues';

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
    const [sent24h, last] = await Promise.all([
      prisma.smsLog.count({ where: { sentAt: { gte: since24h }, status: 'SENT' } }),
      prisma.smsLog.findFirst({ orderBy: { sentAt: 'desc' }, select: { sentAt: true } }),
    ]);
    return { sent24h, lastSentAt: last?.sentAt?.toISOString() ?? null };
  } catch {
    return null;
  }
}

export async function GET() {
  const session = await auth();
  if (session?.user?.role !== 'SUPERADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const [invariants, cronRuns, dlqCount, smsStats] = await Promise.all([
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
    ]);

    return NextResponse.json({
      invariants,
      cronRuns,
      dlqCount,
      smsStats,
      dbPool: getDbPoolStatus(),
      sentry: { available: !!process.env.SENTRY_DSN, note: 'open issues not queried via SaaS API' },
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    logServerError('health', 'health snapshot failed', err);
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500 });
  }
}
