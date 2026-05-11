// /admin/health — SUPERADMIN only.
// Server component fetches initial snapshot ; client component polls every 60s
// + manual refresh button.
import { redirect } from 'next/navigation';
import { auth } from '../../../../../auth';
import { prisma } from '@/lib/prisma';
import { runAllInvariantChecks } from '@/lib/health-invariants';
import { getCronLastRun, CRON_NAMES } from '@/lib/observability';
import { isBullMQConfigured } from '@/lib/redis-bullmq';
import { getDlqQueue } from '@/lib/queues';
import HealthClient from './HealthClient';

export const dynamic = 'force-dynamic';

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

export default async function HealthPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const session = await auth();
  if (session?.user?.role !== 'SUPERADMIN') {
    redirect(`/${locale}/admin/dashboard`);
  }

  const [invariants, cronRuns, dlqCount, smsStats] = await Promise.all([
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
    getSmsStats(),
  ]);

  return (
    <HealthClient
      initial={{
        invariants,
        cronRuns,
        dlqCount,
        smsStats,
        sentry: { available: !!process.env.SENTRY_DSN, note: 'open issues not queried via SaaS API' },
        generatedAt: new Date().toISOString(),
      }}
    />
  );
}
