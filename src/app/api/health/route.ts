import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { prisma } from '@/lib/prisma';
import { checkRedisHealth } from '@/lib/cache';
import { checkStorageHealth } from '@/lib/supabase';
import { isBullMQConfigured } from '@/lib/redis-bullmq';
import { getDlqQueue, getEmailQueue, getSmsQueue, DLQ_WARNING_THRESHOLD } from '@/lib/queues/index';

type DlqCheck =
  | { status: 'skipped'; count: 0 }
  | { status: 'ok' | 'warning' | 'error'; count: number };

type QueueDepthStatus = 'ok' | 'degraded' | 'error' | 'skipped';

interface QueueDepthCheck {
  wait: number;
  delayed: number;
  status: QueueDepthStatus;
}

const QUEUE_DEGRADED_THRESHOLD = 50;
const QUEUE_ERROR_THRESHOLD = 200;

async function checkDlqHealth(): Promise<DlqCheck> {
  if (!isBullMQConfigured()) return { status: 'skipped', count: 0 };
  try {
    const counts = await getDlqQueue().getJobCounts('failed', 'wait', 'delayed', 'active');
    const count =
      (counts.failed ?? 0) +
      (counts.wait ?? 0) +
      (counts.delayed ?? 0) +
      (counts.active ?? 0);
    return { status: count > DLQ_WARNING_THRESHOLD ? 'warning' : 'ok', count };
  } catch {
    return { status: 'error', count: 0 };
  }
}

async function checkQueueDepth(queueName: 'email' | 'sms'): Promise<QueueDepthCheck> {
  if (!isBullMQConfigured()) return { wait: 0, delayed: 0, status: 'skipped' };
  try {
    const queue = queueName === 'email' ? getEmailQueue() : getSmsQueue();
    const counts = await queue.getJobCounts('wait', 'delayed');
    const wait = counts.wait ?? 0;
    const delayed = counts.delayed ?? 0;
    const total = wait + delayed;
    const status: QueueDepthStatus =
      total > QUEUE_ERROR_THRESHOLD ? 'error' :
      total > QUEUE_DEGRADED_THRESHOLD ? 'degraded' :
      'ok';
    return { wait, delayed, status };
  } catch {
    return { wait: 0, delayed: 0, status: 'error' };
  }
}

export async function GET() {
  const [dbResult, redisResult, storageResult, dlqResult, emailQueueResult, smsQueueResult] = await Promise.allSettled([
    prisma.$queryRaw`SELECT 1`,
    checkRedisHealth(),
    checkStorageHealth(),
    checkDlqHealth(),
    checkQueueDepth('email'),
    checkQueueDepth('sms'),
  ]);

  const db = dbResult.status === 'fulfilled' ? 'ok' : 'error';
  const redis = redisResult.status === 'fulfilled' && redisResult.value ? 'ok' : 'degraded';
  const storage = storageResult.status === 'fulfilled' && storageResult.value ? 'ok' : 'degraded';
  const dlq: DlqCheck = dlqResult.status === 'fulfilled' ? dlqResult.value : { status: 'error', count: 0 };
  const emailQueue: QueueDepthCheck = emailQueueResult.status === 'fulfilled' ? emailQueueResult.value : { wait: 0, delayed: 0, status: 'error' };
  const smsQueue: QueueDepthCheck = smsQueueResult.status === 'fulfilled' ? smsQueueResult.value : { wait: 0, delayed: 0, status: 'error' };

  const queuesDegraded = emailQueue.status === 'degraded' || smsQueue.status === 'degraded';
  const queuesError = emailQueue.status === 'error' || smsQueue.status === 'error';

  // Hard-fail checks gate the HTTP status; DLQ warning only downgrades to 'degraded'.
  const hardFail = db === 'error';
  const overall =
    hardFail ? 'error' :
    redis !== 'ok' || storage !== 'ok' || dlq.status === 'warning' || queuesDegraded || queuesError ? 'degraded' :
    'ok';

  // Surface DLQ saturation to Sentry — fingerprint is stable so repeated
  // probes within the same incident dedupe to a single Sentry issue.
  if (dlq.status === 'warning') {
    Sentry.captureMessage('DLQ size exceeded threshold', {
      level: 'warning',
      fingerprint: ['health', 'dlq-warning'],
      extra: { dlqCount: dlq.count, threshold: DLQ_WARNING_THRESHOLD },
    });
  }

  return NextResponse.json(
    {
      status: overall,
      db,
      redis,
      storage,
      dlq,
      dlq_count: dlq.count,
      queues: {
        email: emailQueue,
        sms: smsQueue,
      },
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local',
      uptime: Math.floor(process.uptime()),
    },
    { status: overall === 'error' ? 503 : 200 },
  );
}
