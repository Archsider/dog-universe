// Queue stats API — SUPERADMIN only.
// Returns job counts + recent failed jobs for each managed queue.
import { NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { isBullMQConfigured, getBullMQConnection } from '@/lib/redis-bullmq';
import { getEmailQueue, getSmsQueue, getDlqQueue, QUEUE_EMAIL, QUEUE_SMS, QUEUE_DLQ } from '@/lib/queues/index';
import type { Queue } from 'bullmq';

async function getQueueStats(queue: Queue, name: string) {
  const [counts, failed, completed] = await Promise.all([
    queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed', 'paused'),
    queue.getFailed(0, 9),
    queue.getCompleted(0, 4),
  ]);
  return {
    name,
    counts,
    recentFailed: failed.map((j) => ({
      id: j.id,
      data: j.data,
      failedReason: j.failedReason,
      attemptsMade: j.attemptsMade,
      timestamp: j.timestamp,
    })),
    recentCompleted: completed.map((j) => ({
      id: j.id,
      finishedOn: j.finishedOn,
    })),
  };
}

export async function GET() {
  const session = await auth();
  if (session?.user?.role !== 'SUPERADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!isBullMQConfigured()) {
    return NextResponse.json({ configured: false, queues: [] });
  }

  try {
    const [emailStats, smsStats, dlqStats] = await Promise.all([
      getQueueStats(getEmailQueue(), QUEUE_EMAIL),
      getQueueStats(getSmsQueue(),   QUEUE_SMS),
      getQueueStats(getDlqQueue(),   QUEUE_DLQ),
    ]);
    return NextResponse.json({ configured: true, queues: [emailStats, smsStats, dlqStats] });
  } catch (err) {
    console.error('[admin/queues] stats error:', err);
    return NextResponse.json({ error: 'REDIS_ERROR' }, { status: 503 });
  }
}

// Allow SUPERADMIN to retry a specific failed job
export async function POST(request: Request) {
  const session = await auth();
  if (session?.user?.role !== 'SUPERADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!isBullMQConfigured()) {
    return NextResponse.json({ error: 'Redis not configured' }, { status: 503 });
  }

  const body = await request.json() as { queue: string; jobId: string };
  const VALID_QUEUES: Record<string, Queue> = {
    [QUEUE_EMAIL]: getEmailQueue(),
    [QUEUE_SMS]:   getSmsQueue(),
    [QUEUE_DLQ]:   getDlqQueue(),
  };

  const queue = VALID_QUEUES[body.queue];
  if (!queue || !body.jobId) {
    return NextResponse.json({ error: 'Invalid queue or jobId' }, { status: 400 });
  }

  try {
    const job = await queue.getJob(body.jobId);
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    await job.retry('failed');
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[admin/queues] retry error:', err);
    return NextResponse.json({ error: 'RETRY_FAILED' }, { status: 500 });
  }
}
