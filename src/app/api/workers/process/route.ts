// Vercel Cron worker — runs every minute.
// Creates short-lived BullMQ Workers for the email and SMS queues, processes up
// to MAX_JOBS_PER_QUEUE jobs each, then closes them before Vercel's 60 s timeout.
// The worker auto-picks up "waiting" and "delayed" jobs. The "drained" event fires
// when the queue is empty; we also enforce a hard 55 s timeout as a safety net.
// DLQ: jobs that exhaust all retry attempts are moved to the `dlq` queue for
// manual inspection via the /admin/queues monitoring page.
import { NextRequest, NextResponse } from 'next/server';
import { Worker } from 'bullmq';
import { getBullMQConnection, isBullMQConfigured } from '@/lib/redis-bullmq';
import {
  QUEUE_EMAIL, QUEUE_SMS, QUEUE_DLQ,
  getEmailQueue, getSmsQueue, getDlqQueue,
  type EmailJobData, type SmsJobData,
} from '@/lib/queues/index';
import { processEmailJob, processSmsJob } from '@/workers/processors';
import { prisma } from '@/lib/prisma';
import { getLastHeartbeat, tryClaimAlertSlot } from '@/lib/taxi-heartbeat';
import { notifyAdminsTaxiHeartbeatLost } from '@/lib/notifications';

const MAX_JOBS_PER_QUEUE = 10;
const WORKER_TIMEOUT_MS  = 55_000;

// Scans STANDALONE PET_TAXI bookings currently IN_PROGRESS and fires an alert
// to admins for each one whose Redis heartbeat key has expired. Dedup latch
// (taxi:alert:{bookingId} EX 3600) prevents repeat alerts within 1 h.
// Fail-open: any error is logged and swallowed — never breaks the cron.
async function checkTaxiHeartbeats(): Promise<{ scanned: number; alerted: number }> {
  let scanned = 0;
  let alerted = 0;
  try {
    const bookings = await prisma.booking.findMany({
      where: { serviceType: 'PET_TAXI', status: 'IN_PROGRESS', deletedAt: null },
      select: {
        id: true,
        client: { select: { name: true, email: true } },
        bookingPets: { select: { pet: { select: { name: true } } } },
      },
    });
    scanned = bookings.length;

    for (const b of bookings) {
      const last = await getLastHeartbeat(b.id);
      if (last !== null) continue; // signal alive within TTL window

      const claimed = await tryClaimAlertSlot(b.id);
      if (!claimed) continue; // already alerted this hour, or Redis unavailable

      const clientName = b.client?.name ?? b.client?.email ?? 'Client';
      const petNames = b.bookingPets.map(bp => bp.pet.name).join(', ') || '—';
      const bookingRef = b.id.slice(0, 8).toUpperCase();
      try {
        await notifyAdminsTaxiHeartbeatLost({ bookingId: b.id, bookingRef, clientName, petNames });
        alerted++;
      } catch (err) {
        console.error('[taxi-heartbeat] notifyAdmins failed for booking', b.id, err);
      }
    }
  } catch (err) {
    console.error('[taxi-heartbeat] checkTaxiHeartbeats failed:', err);
  }
  return { scanned, alerted };
}

type QueueResult = { processed: number; failed: number };

async function runWorker<T>(
  queueName: string,
  processor: (job: import('bullmq').Job<T>) => Promise<void>,
): Promise<QueueResult> {
  const connection = getBullMQConnection();
  const dlqQueue   = getDlqQueue();

  let processed = 0;
  let failed = 0;

  const worker = new Worker<T>(queueName, processor, {
    connection,
    concurrency: 3,
  });

  // Archive permanently-failed jobs to the DLQ
  worker.on('failed', async (job, err) => {
    failed++;
    if (!job) return;
    const exhausted = (job.attemptsMade ?? 0) >= (job.opts.attempts ?? 3);
    if (exhausted) {
      try {
        await dlqQueue.add('dead', {
          originQueue: queueName,
          jobId: job.id,
          data: job.data,
          failedReason: err.message,
          failedAt: new Date().toISOString(),
        });
      } catch (dlqErr) {
        console.error('[dlq] Failed to archive dead job:', dlqErr);
      }
    }
  });

  worker.on('completed', () => { processed++; });

  await Promise.race([
    new Promise<void>((resolve) => {
      const check = () => {
        if (processed + failed >= MAX_JOBS_PER_QUEUE) resolve();
      };
      worker.on('completed', check);
      worker.on('failed',    check);
      worker.on('drained',   resolve);
    }),
    new Promise<void>((resolve) => setTimeout(resolve, WORKER_TIMEOUT_MS)),
  ]);

  await worker.close();
  return { processed, failed };
}

export async function GET(request: NextRequest) {
  // Vercel Cron sends Authorization: Bearer <CRON_SECRET>
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization') ?? '';
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  // Heartbeat scan runs even when BullMQ is not configured — it uses the
  // separate Upstash REST client and is independent of the queue infra.
  const heartbeatResult = await checkTaxiHeartbeats();

  if (!isBullMQConfigured()) {
    return NextResponse.json({ skipped: 'queues', reason: 'UPSTASH_REDIS_HOST not configured', heartbeat: heartbeatResult });
  }

  const results: Record<string, QueueResult> = {};

  try {
    [results[QUEUE_EMAIL], results[QUEUE_SMS]] = await Promise.all([
      runWorker<EmailJobData>(QUEUE_EMAIL, processEmailJob),
      runWorker<SmsJobData>(QUEUE_SMS, processSmsJob),
    ]);
  } catch (err) {
    console.error('[workers/process] Worker error:', err);
    return NextResponse.json({ error: 'WORKER_ERROR', heartbeat: heartbeatResult }, { status: 500 });
  }

  return NextResponse.json({ ok: true, results, heartbeat: heartbeatResult });
}
