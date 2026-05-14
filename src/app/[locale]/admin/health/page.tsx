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
import { getDedupBlockedCount } from '@/lib/cache';
import HealthClient from './HealthClient';

export const dynamic = 'force-dynamic';

/** SMS pipeline KPIs for the past 24h:
 *   - sent24h:        rows in SmsLog with status='SENT' (delivered)
 *   - pending24h:     rows with status='PENDING' (reserved but never marked
 *                     SENT → either a failed send or an in-flight one)
 *   - blockedToday:   duplicates blocked since 00:00 UTC, from a Redis
 *                     counter incremented by tryReserveSmsSend on lost
 *                     races or recent-sends-already-recorded
 *   - lastSentAt:     ISO of the most recent SmsLog entry, regardless of
 *                     status — answers "when did SMS last move?"
 *   - recent:         the last 20 attempts for an at-a-glance audit trail
 */
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
        // Mask everything except the last 2 digits so the operator can
        // recognise the recipient without leaking the full number to a
        // browser screenshot.
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
      isFr={locale !== 'en'}
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
