import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { prisma } from '@/lib/prisma';
import { checkRedisHealth } from '@/lib/cache';
import { checkStorageHealth } from '@/lib/supabase';
import { isBullMQConfigured } from '@/lib/redis-bullmq';
import { getDlqQueue, DLQ_WARNING_THRESHOLD } from '@/lib/queues/index';

type DlqCheck =
  | { status: 'skipped'; count: 0 }
  | { status: 'ok' | 'warning' | 'error'; count: number };

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

export async function GET() {
  const [dbResult, redisResult, storageResult, dlqResult] = await Promise.allSettled([
    prisma.$queryRaw`SELECT 1`,
    checkRedisHealth(),
    checkStorageHealth(),
    checkDlqHealth(),
  ]);

  const db = dbResult.status === 'fulfilled' ? 'ok' : 'error';
  const redis = redisResult.status === 'fulfilled' && redisResult.value ? 'ok' : 'degraded';
  const storage = storageResult.status === 'fulfilled' && storageResult.value ? 'ok' : 'degraded';
  const dlq: DlqCheck = dlqResult.status === 'fulfilled' ? dlqResult.value : { status: 'error', count: 0 };

  // Hard-fail checks gate the HTTP status; DLQ warning only downgrades to 'degraded'.
  const hardFail = db === 'error';
  const overall =
    hardFail ? 'error' :
    redis !== 'ok' || storage !== 'ok' || dlq.status === 'warning' ? 'degraded' :
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
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local',
      uptime: Math.floor(process.uptime()),
    },
    { status: overall === 'error' ? 503 : 200 },
  );
}
