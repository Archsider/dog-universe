// Worker processor functions — called by the cron endpoint (/api/workers/process).
// Each processor receives a BullMQ Job and executes the side-effect (send email / SMS).
// Failed jobs are retried up to 3× with exponential backoff as defined in the queue options.
// After all retries are exhausted, BullMQ moves the job to "failed" state and the DLQ
// listener in /api/workers/process archives it to the dlq queue for manual inspection.
import type { Job } from 'bullmq';
import { z } from 'zod';
import { sendEmail } from '@/lib/email';
import { sendSMS, sendAdminSMS } from '@/lib/sms';
import { isSmsDedup, recordSmsSent } from '@/lib/sms-dedup';
import { tryAcquireFlag } from '@/lib/cache';
import type { EmailJobData, SmsJobData } from '@/lib/queues/index';
import { logger } from '@/lib/logger';

// Idempotence : Redis NX EX 24h. Si un Worker BullMQ retraite par erreur le
// même jobId (réseau perdu après ack, dédoublement éventuel), le second
// passage voit le flag déjà posé → no-op silencieux. Fail-open via tryAcquireFlag.
// Second layer: DB SmsLog dedup below (survives Redis restarts).
const PROCESSED_TTL_SECONDS = 86_400;
function processedKey(queue: 'email' | 'sms', jobId: string): string {
  return `job:processed:${queue}:${jobId}`;
}

// Validate job payloads at deserialise. If Redis returns a malformed blob
// (corruption, manual edit, version skew between producer and consumer), we
// throw so BullMQ retries → DLQ — never silently send `undefined` to SMTP.
const emailJobSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1),
  html: z.string().min(1),
  text: z.string().optional(),
});

const smsJobSchema = z.object({
  to: z.union([z.string().min(1), z.null()]),
  message: z.string().min(1),
});

export async function processEmailJob(job: Job<EmailJobData>): Promise<void> {
  const parsed = emailJobSchema.safeParse(job.data);
  if (!parsed.success) {
    throw new Error(`[email-job] invalid payload: ${parsed.error.message}`);
  }
  const jobId = job.id;
  if (jobId) {
    const acquired = await tryAcquireFlag(processedKey('email', jobId), PROCESSED_TTL_SECONDS);
    if (!acquired) {
      logger.info('worker', 'job already processed', { queue: 'email', jobId });
      return;
    }
  }
  await sendEmail(parsed.data);
}

export async function processSmsJob(job: Job<SmsJobData>): Promise<void> {
  const parsed = smsJobSchema.safeParse(job.data);
  if (!parsed.success) {
    throw new Error(`[sms-job] invalid payload: ${parsed.error.message}`);
  }
  const jobId = job.id;
  if (jobId) {
    const acquired = await tryAcquireFlag(processedKey('sms', jobId), PROCESSED_TTL_SECONDS);
    if (!acquired) {
      logger.info('worker', 'job already processed', { queue: 'sms', jobId });
      return;
    }
  }
  const { to, message } = parsed.data;
  if (!to) return; // null = skip silently

  // DB-level dedup: second line of defence after Redis idempotence flag above.
  // Guarantees no duplicate delivery even when Redis is restarted/flushed.
  const dup = await isSmsDedup(to, message);
  if (dup) {
    logger.info('worker', 'sms doublon bloqué (DB)', { queue: 'sms', jobId });
    return;
  }

  const ok = to === 'ADMIN'
    ? await sendAdminSMS(message)
    : await sendSMS(to, message);
  if (!ok) {
    throw new Error(`SMS delivery failed for ${to === 'ADMIN' ? 'ADMIN' : 'recipient'}`);
  }
  await recordSmsSent(to, message);
}
