// Vercel Cron worker — runs every minute.
// Creates short-lived BullMQ Workers for the email and SMS queues, processes up
// to MAX_JOBS_PER_QUEUE jobs each, then closes them before Vercel's 60 s timeout.
// The worker auto-picks up "waiting" and "delayed" jobs. The "drained" event fires
// when the queue is empty; we also enforce a hard 55 s timeout as a safety net.
// DLQ: jobs that exhaust all retry attempts are moved to the `dlq` queue for
// manual inspection via the /admin/queues monitoring page.
import { NextRequest, NextResponse } from 'next/server';
import { Worker } from 'bullmq';
import { Redis } from '@upstash/redis';
import { log } from '@/lib/logger';
import { getBullMQConnection, isBullMQConfigured } from '@/lib/redis-bullmq';
import {
  QUEUE_EMAIL, QUEUE_SMS, QUEUE_DLQ,
  getEmailQueue, getSmsQueue, getDlqQueue,
  type EmailJobData, type SmsJobData,
} from '@/lib/queues/index';
import { processEmailJob, processSmsJob } from '@/workers/processors';
import { prisma } from '@/lib/prisma';
import { getLastHeartbeat, tryClaimAlertSlot } from '@/lib/taxi-heartbeat';
import { notifyAdminsTaxiHeartbeatLost, createNotification } from '@/lib/notifications';

export const maxDuration = 60;

// Upstash REST client used solely for the DLQ alert dedup latch (SET NX EX).
// Reuses the same env pattern as src/lib/cache.ts. Fail-open: any error in
// the alerting path is swallowed so the worker loop is never broken.
let _alertRedis: Redis | null | undefined;
function getAlertRedis(): Redis | null {
  if (_alertRedis !== undefined) return _alertRedis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) { _alertRedis = null; return null; }
  _alertRedis = new Redis({ url, token });
  return _alertRedis;
}

// Notify all SUPERADMINs that a job has exhausted its retries and was archived
// to the DLQ. Dedup: at most one alert per (jobType, hourUTC) via SET NX EX 3600.
// Wrapped in a try/catch — alerting failures must NEVER break the worker loop.
async function alertDlqJob(params: {
  jobType: 'email' | 'sms';
  bookingId: string;
  jobId: string | undefined;
  failedReason: string;
}): Promise<void> {
  try {
    const { jobType, bookingId, jobId, failedReason } = params;
    const currentHourISO = new Date().toISOString().slice(0, 13); // e.g. 2026-04-30T08
    const dedupKey = `dlq:alert:${jobType}:${currentHourISO}`;

    const redis = getAlertRedis();
    if (!redis) return; // No Redis → can't dedup safely; skip alert.
    const acquired = await redis.set(dedupKey, '1', { nx: true, ex: 3600 });
    if (acquired !== 'OK') return; // Another worker already alerted this hour.

    const superadmins = await prisma.user.findMany({
      where: { role: 'SUPERADMIN', deletedAt: null }, // soft-delete: required — no global extension (Edge Runtime incompatible)
      select: { id: true },
    });

    for (const sa of superadmins) {
      try {
        await createNotification({
          userId: sa.id,
          type: 'ADMIN_MESSAGE',
          titleFr: 'Job en échec définitif',
          titleEn: 'Job failed permanently',
          messageFr: `⚠️ Job ${jobType} échoué après 3 tentatives — booking ${bookingId}`,
          messageEn: `⚠️ ${jobType} job failed after 3 retries — booking ${bookingId}`,
          metadata: { jobType, bookingId, jobId: jobId ?? 'unknown', failedReason },
        });
      } catch (err) {
        console.error(JSON.stringify({ level: 'error', service: 'workers-process', message: 'DLQ alert createNotification failed', userId: sa.id, error: err instanceof Error ? err.message : String(err), timestamp: new Date().toISOString() }));
      }
    }
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', service: 'workers-process', message: 'alertDlqJob failed', error: err instanceof Error ? err.message : String(err), timestamp: new Date().toISOString() }));
  }
}

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
      where: { serviceType: 'PET_TAXI', status: 'IN_PROGRESS', deletedAt: null }, // soft-delete: required — no global extension (Edge Runtime incompatible)
      select: {
        id: true,
        client: { select: { name: true, email: true } },
        bookingPets: { select: { pet: { select: { name: true } } } },
      },
      take: 200,
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
        console.error(JSON.stringify({ level: 'error', service: 'workers-process', message: 'notifyAdmins failed for taxi heartbeat', bookingId: b.id, error: err instanceof Error ? err.message : String(err), timestamp: new Date().toISOString() }));
      }
    }
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', service: 'workers-process', message: 'checkTaxiHeartbeats failed', error: err instanceof Error ? err.message : String(err), timestamp: new Date().toISOString() }));
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
        console.error(JSON.stringify({ level: 'error', service: 'workers-process', message: 'Failed to archive dead job to DLQ', error: dlqErr instanceof Error ? dlqErr.message : String(dlqErr), timestamp: new Date().toISOString() }));
      }

      // Fire-and-forget SUPERADMIN alert (deduped per hour per jobType).
      const jobType: 'email' | 'sms' =
        queueName === QUEUE_EMAIL ? 'email' :
        queueName === QUEUE_SMS   ? 'sms'   :
        'email'; // unreachable: only email/sms workers run
      const rawData = (job.data ?? {}) as Record<string, unknown>;
      const bookingIdRaw = rawData.bookingId;
      const bookingId = typeof bookingIdRaw === 'string' && bookingIdRaw.length > 0 ? bookingIdRaw : 'unknown';
      void alertDlqJob({ jobType, bookingId, jobId: job.id, failedReason: err.message });
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
    await log('error', 'workers-process', 'Worker error', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'WORKER_ERROR', heartbeat: heartbeatResult }, { status: 500 });
  }

  return NextResponse.json({ ok: true, results, heartbeat: heartbeatResult });
}
