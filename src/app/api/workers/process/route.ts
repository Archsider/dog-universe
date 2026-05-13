// Vercel Cron worker — runs every 5 minutes (*/5 * * * * in vercel.json).
// Transactional notifications (booking confirmations, validation, etc.) bypass
// this drain entirely via sendEmailNow / sendSmsNow (src/lib/notify-now.ts) so
// user-visible latency stays sub-second. This drain serves only deferred batch
// work enqueued by daily/weekly crons (reminders, birthdays, weekly reports).
// Creates short-lived BullMQ Workers for the email and SMS queues, processes up
// to MAX_JOBS_PER_QUEUE jobs each, then closes them before Vercel's 60 s timeout.
// The worker auto-picks up "waiting" and "delayed" jobs. The "drained" event fires
// when the queue is empty; we also enforce a hard 55 s timeout as a safety net.
// DLQ: jobs that exhaust all retry attempts are moved to the `dlq` queue for
// manual inspection via the /admin/queues monitoring page.
import { NextRequest, NextResponse } from 'next/server';
import { Worker } from 'bullmq';
import { Redis } from '@upstash/redis';
import { log, logger } from '@/lib/logger';
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
import { markWorkerRun, getQueueLastEnqueueMs, getQueueLastFullCheckMs, markQueueFullCheck } from '@/lib/cache';
import { notDeleted } from '@/lib/prisma-soft';

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
      where: notDeleted({ role: 'SUPERADMIN' }),
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
        logger.error('workers-process', 'DLQ alert createNotification failed', { userId: sa.id, error: err instanceof Error ? err.message : String(err) });
      }
    }
  } catch (err) {
    logger.error('workers-process', 'alertDlqJob failed', { error: err instanceof Error ? err.message : String(err) });
  }
}

const MAX_JOBS_PER_QUEUE = 10;
const WORKER_TIMEOUT_MS  = 55_000;

// R4: when the last successful enqueue is older than this window, the cron
// can skip the BullMQ probe block (~10 Redis cmds) and return early. The
// next enqueue resets the window via `markQueueEnqueue()` in src/lib/queues.
const ENQUEUE_FRESHNESS_MS = 10 * 60 * 1000; // 10 min

// R4 safety net: even on a perfectly idle app, force a full BullMQ probe
// at least once per hour so stuck jobs (e.g. a job that got pushed before
// `bullmq:lastEnqueue` TTL'd, then crashed mid-flight) can't pile up
// undetected. 1 h ≪ BullMQ retry backoff windows, so stuck-job triage
// stays well within SLA.
const FORCE_FULL_CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 h

// Scans STANDALONE PET_TAXI bookings currently IN_PROGRESS and fires an alert
// to admins for each one whose Redis heartbeat key has expired. Dedup latch
// (taxi:alert:{bookingId} EX 3600) prevents repeat alerts within 1 h.
// Fail-open: any error is logged and swallowed — never breaks the cron.
async function checkTaxiHeartbeats(): Promise<{ scanned: number; alerted: number }> {
  let scanned = 0;
  let alerted = 0;
  try {
    const bookings = await prisma.booking.findMany({
      where: notDeleted({ serviceType: 'PET_TAXI', status: 'IN_PROGRESS' }),
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
        logger.error('workers-process', 'notifyAdmins failed for taxi heartbeat', { bookingId: b.id, error: err instanceof Error ? err.message : String(err) });
      }
    }
  } catch (err) {
    logger.error('workers-process', 'checkTaxiHeartbeats failed', { error: err instanceof Error ? err.message : String(err) });
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
  const queue      = queueName === QUEUE_EMAIL ? getEmailQueue() : getSmsQueue();

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
        logger.error('workers-process', 'Failed to archive dead job to DLQ', { error: dlqErr instanceof Error ? dlqErr.message : String(dlqErr) });
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

  // Graceful drain — wait until both:
  //   - no jobs are active in the worker (concurrency: 3 → up to 3 in-flight),
  //   - and no jobs are waiting in the queue (or we hit MAX_JOBS_PER_QUEUE).
  // The previous Promise.race resolved on the first 'drained' event even if
  // jobs were still active concurrently, causing worker.close() to abort them
  // mid-flight → BullMQ retried them → duplicate sends.
  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; clearTimeout(timer); resolve(); } };
    const check = async () => {
      if (done) return;
      try {
        if (processed + failed >= MAX_JOBS_PER_QUEUE) return finish();
        const [active, waiting] = await Promise.all([
          queue.getActiveCount(),
          queue.getWaitingCount(),
        ]);
        if (active === 0 && waiting === 0) finish();
      } catch {
        // If the count probes fail (Redis hiccup), let the timeout net us in.
      }
    };
    worker.on('completed', check);
    worker.on('failed',    check);
    worker.on('drained',   check);
    const timer = setTimeout(finish, WORKER_TIMEOUT_MS);
    // Initial check in case the queue was empty at startup.
    void check();
  });

  // worker.close() waits for active jobs to complete (graceful), so the
  // in-flight set above (≤ concurrency) finishes cleanly — no duplicate retries.
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

  // Stamp last-run heartbeat for /admin/diagnostics. Fail-open inside markWorkerRun.
  await markWorkerRun();

  // Heartbeat scan runs even when BullMQ is not configured — it uses the
  // separate Upstash REST client and is independent of the queue infra.
  const heartbeatResult = await checkTaxiHeartbeats();

  if (!isBullMQConfigured()) {
    return NextResponse.json({ skipped: 'queues', reason: 'UPSTASH_REDIS_HOST not configured', heartbeat: heartbeatResult });
  }

  // R4 — skip BullMQ probes entirely when nothing has been enqueued recently.
  // The two Redis GETs replace ~10 cmds of getJobCounts. Falls back to a full
  // check at least once per hour so stuck jobs are never starved. Fail-open:
  // null reads (Redis down / unset key) flow through to the normal path.
  try {
    const now = Date.now();
    const [lastEnqueueMs, lastFullCheckMs, activeTripsForSkip] = await Promise.all([
      getQueueLastEnqueueMs(),
      getQueueLastFullCheckMs(),
      prisma.taxiTrip.count({ where: { status: 'DRIVER_EN_ROUTE' } }),
    ]);
    const enqueueIsStale =
      lastEnqueueMs === null || (now - lastEnqueueMs) > ENQUEUE_FRESHNESS_MS;
    const fullCheckRecent =
      lastFullCheckMs !== null && (now - lastFullCheckMs) < FORCE_FULL_CHECK_INTERVAL_MS;
    if (enqueueIsStale && fullCheckRecent && activeTripsForSkip === 0) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: 'no recent enqueue (R4)',
        heartbeat: heartbeatResult,
      });
    }
  } catch (err) {
    logger.error('workers-process', 'R4 skip check failed (proceeding with full run)', { error: err instanceof Error ? err.message : String(err) });
  }

  // Early-exit : si rien à faire dans les queues ET aucune course taxi active,
  // on évite d'allouer Workers BullMQ (coût Lambda + connexions Redis). Fail-open :
  // toute erreur sur le check → comportement normal (on tente le run).
  try {
    const emailQ = getEmailQueue();
    const smsQ   = getSmsQueue();
    const [emailCounts, smsCounts, activeTrips] = await Promise.all([
      emailQ.getJobCounts('waiting', 'active', 'delayed'),
      smsQ.getJobCounts('waiting', 'active', 'delayed'),
      prisma.taxiTrip.count({ where: { status: 'DRIVER_EN_ROUTE' } }),
    ]);
    // R4: record that we just performed a full BullMQ probe so the skip
    // window in the next ticks can rely on this freshness signal.
    void markQueueFullCheck();
    const emailPending = (emailCounts.waiting ?? 0) + (emailCounts.active ?? 0) + (emailCounts.delayed ?? 0);
    const smsPending   = (smsCounts.waiting ?? 0)   + (smsCounts.active ?? 0)   + (smsCounts.delayed ?? 0);
    if (emailPending === 0 && smsPending === 0 && activeTrips === 0) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'no work', heartbeat: heartbeatResult });
    }
  } catch (err) {
    logger.error('workers-process', 'early-exit check failed (proceeding with full run)', { error: err instanceof Error ? err.message : String(err) });
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
