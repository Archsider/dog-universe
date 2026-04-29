// Queue monitoring page — SUPERADMIN only.
// Server component that fetches queue stats and renders a read-only dashboard.
import { redirect } from 'next/navigation';
import { auth } from '../../../../../auth';
import { isBullMQConfigured } from '@/lib/redis-bullmq';
import { getEmailQueue, getSmsQueue, getDlqQueue, QUEUE_EMAIL, QUEUE_SMS, QUEUE_DLQ } from '@/lib/queues/index';
import QueueMonitorClient from './QueueMonitorClient';
import type { Queue } from 'bullmq';

async function fetchQueueData(queue: Queue, name: string) {
  const [counts, failed, completed] = await Promise.all([
    queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed', 'paused'),
    queue.getFailed(0, 9),
    queue.getCompleted(0, 4),
  ]);
  return {
    name,
    counts,
    recentFailed: failed.map((j) => ({
      id: j.id ?? '',
      data: j.data as Record<string, unknown>,
      failedReason: j.failedReason ?? '',
      attemptsMade: j.attemptsMade,
      timestamp: j.timestamp,
    })),
    recentCompleted: completed.map((j) => ({
      id: j.id ?? '',
      finishedOn: j.finishedOn ?? 0,
    })),
  };
}

export type QueueData = Awaited<ReturnType<typeof fetchQueueData>>;

export default async function QueuesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const session = await auth();

  if (session?.user?.role !== 'SUPERADMIN') {
    redirect(`/${locale}/admin/dashboard`);
  }

  const isFr = locale === 'fr';

  if (!isBullMQConfigured()) {
    return (
      <div className="p-8">
        <h1 className="text-xl font-semibold text-charcoal mb-4">
          {isFr ? 'File de traitement asynchrone' : 'Async Job Queues'}
        </h1>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-amber-800 text-sm">
          <p className="font-medium">
            {isFr ? 'Redis non configuré' : 'Redis not configured'}
          </p>
          <p className="mt-1 text-xs">
            {isFr
              ? 'Définir UPSTASH_REDIS_HOST et UPSTASH_REDIS_PASSWORD pour activer les queues BullMQ.'
              : 'Set UPSTASH_REDIS_HOST and UPSTASH_REDIS_PASSWORD to enable BullMQ queues.'}
          </p>
        </div>
      </div>
    );
  }

  let queues: QueueData[] = [];
  let redisError = false;

  try {
    queues = await Promise.all([
      fetchQueueData(getEmailQueue(), QUEUE_EMAIL),
      fetchQueueData(getSmsQueue(),   QUEUE_SMS),
      fetchQueueData(getDlqQueue(),   QUEUE_DLQ),
    ]);
  } catch {
    redisError = true;
  }

  return (
    <QueueMonitorClient
      locale={locale}
      queues={queues}
      redisError={redisError}
    />
  );
}
