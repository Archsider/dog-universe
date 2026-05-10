// Health snapshot endpoint — SUPERADMIN only.
// Returns invariant violations + DLQ count + crons last-run timestamps.
// Used by /admin/health for manual refresh (auto-refresh 60s).
import { NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { runAllInvariantChecks } from '@/lib/health-invariants';
import { getCronLastRun, CRON_NAMES, logServerError } from '@/lib/observability';
import { isBullMQConfigured } from '@/lib/redis-bullmq';
import { getDlqQueue } from '@/lib/queues';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (session?.user?.role !== 'SUPERADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const [invariants, cronRuns, dlqCount] = await Promise.all([
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
    ]);

    return NextResponse.json({
      invariants,
      cronRuns,
      dlqCount,
      sentry: { available: !!process.env.SENTRY_DSN, note: 'open issues not queried via SaaS API' },
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    logServerError('health', 'health snapshot failed', err);
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500 });
  }
}
