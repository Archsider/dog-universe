// /admin/health — SUPERADMIN only.
// Server component fetches initial snapshot ; client component polls every 60s
// + manual refresh button.
import { redirect } from 'next/navigation';
import { auth } from '../../../../../auth';
import { runAllInvariantChecks } from '@/lib/health-invariants';
import { getCronLastRun, CRON_NAMES } from '@/lib/observability';
import { isBullMQConfigured } from '@/lib/redis-bullmq';
import { getDlqQueue } from '@/lib/queues';
import HealthClient from './HealthClient';

export const dynamic = 'force-dynamic';

export default async function HealthPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const session = await auth();
  if (session?.user?.role !== 'SUPERADMIN') {
    redirect(`/${locale}/admin/dashboard`);
  }

  const [invariants, cronRuns, dlqCount] = await Promise.all([
    runAllInvariantChecks(),
    Promise.all(CRON_NAMES.map(async (name) => ({ name, lastRun: await getCronLastRun(name) }))),
    (async () => {
      if (!isBullMQConfigured()) return null;
      try {
        const dlq = getDlqQueue();
        if (!dlq) return null;
        const counts = await dlq.getJobCounts('waiting', 'failed', 'completed');
        return (counts.waiting ?? 0) + (counts.failed ?? 0);
      } catch {
        return null;
      }
    })(),
  ]);

  return (
    <HealthClient
      initial={{
        invariants,
        cronRuns,
        dlqCount,
        sentry: { available: !!process.env.SENTRY_DSN, note: 'open issues not queried via SaaS API' },
        generatedAt: new Date().toISOString(),
      }}
    />
  );
}
