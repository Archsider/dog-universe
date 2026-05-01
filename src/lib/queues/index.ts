import { Queue, JobsOptions } from 'bullmq';
import { getBullMQConnection, isBullMQConfigured } from '@/lib/redis-bullmq';
import { sendEmail } from '@/lib/email';
import { sendSMS, sendAdminSMS } from '@/lib/sms';

/**
 * DLQ depth thresholds — shared between the health endpoint and the dlq-watch cron
 * so they never drift apart.
 *   DLQ_WARNING_THRESHOLD : health check downgrades to "degraded" (early signal)
 *   DLQ_ALERT_THRESHOLD   : dlq-watch cron notifies SUPERADMINs (truly critical)
 */
export const DLQ_WARNING_THRESHOLD = 10;
export const DLQ_ALERT_THRESHOLD = 50;

// PII-safe error logger: masks email recipients in error messages so a queue
// outage doesn't dump client addresses into Sentry / Vercel logs.
function maskEmail(addr: string): string {
  return addr.replace(/(.{2}).*(@.*)/, '$1***$2');
}
function maskPhone(num: string): string {
  return num.length <= 4 ? '***' : `${num.slice(0, 4)}****${num.slice(-2)}`;
}

// ── Job data types ────────────────────────────────────────────────────────────

export interface EmailJobData {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface SmsJobData {
  /** Phone number (null/undefined = skip), or 'ADMIN' to route to sendAdminSMS() */
  to: string | null;
  message: string;
}

// ── Queue names ───────────────────────────────────────────────────────────────

export const QUEUE_EMAIL = 'email';
export const QUEUE_SMS   = 'sms';
export const QUEUE_DLQ   = 'dlq';

// ── Per-queue job options (exponential backoff, provider-tuned) ───────────────
//
// Email: 4 attempts, 1-min base delay → retries at ~1 min, ~2 min, ~4 min.
//   Resend outages typically resolve within a few minutes.
//
// SMS: 3 attempts, 5-min base delay → retries at ~5 min, ~10 min.
//   SMS providers are slower to recover; fewer attempts avoids duplicate sends.
//
// DLQ: no retry — tombstone for manual inspection and replay.

const EMAIL_JOB_OPTIONS: JobsOptions = {
  attempts: 4,
  backoff: { type: 'exponential', delay: 60_000 }, // 1 min → 2 min → 4 min → DLQ
  removeOnComplete: { count: 200 },
  removeOnFail: { count: 500 },
};

const SMS_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 300_000 }, // 5 min → 10 min → DLQ
  removeOnComplete: { count: 200 },
  removeOnFail: { count: 500 },
};

// ── Queue singletons (lazy, only when Redis is configured) ────────────────────

let _emailQueue: Queue<EmailJobData> | null = null;
let _smsQueue:   Queue<SmsJobData>   | null = null;
let _dlqQueue:   Queue<unknown>      | null = null;

export function getEmailQueue(): Queue<EmailJobData> {
  if (!_emailQueue) {
    _emailQueue = new Queue<EmailJobData>(QUEUE_EMAIL, {
      connection: getBullMQConnection(),
      defaultJobOptions: EMAIL_JOB_OPTIONS,
    });
  }
  return _emailQueue;
}

export function getSmsQueue(): Queue<SmsJobData> {
  if (!_smsQueue) {
    _smsQueue = new Queue<SmsJobData>(QUEUE_SMS, {
      connection: getBullMQConnection(),
      defaultJobOptions: SMS_JOB_OPTIONS,
    });
  }
  return _smsQueue;
}

export function getDlqQueue(): Queue<unknown> {
  if (!_dlqQueue) {
    _dlqQueue = new Queue<unknown>(QUEUE_DLQ, {
      connection: getBullMQConnection(),
      defaultJobOptions: { removeOnComplete: { count: 1000 }, removeOnFail: false },
    });
  }
  return _dlqQueue;
}

// ── Enqueue helpers (with fallback to direct send) ────────────────────────────
// If Redis is unavailable or not configured, we fall back to a direct send so
// the API response is never blocked by queue infrastructure being down.

export async function enqueueEmail(data: EmailJobData, jobId?: string): Promise<void> {
  const masked = maskEmail(data.to);
  if (!isBullMQConfigured()) {
    await sendEmail(data).catch((e) => console.error(JSON.stringify({ level: 'error', service: 'bullmq', message: 'email direct send failed', masked, error: e instanceof Error ? e.message : String(e), timestamp: new Date().toISOString() })));
    return;
  }
  try {
    await getEmailQueue().add('send', data, jobId ? { ...EMAIL_JOB_OPTIONS, jobId } : EMAIL_JOB_OPTIONS);
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', service: 'bullmq', message: 'email enqueue failed, falling back to direct send', error: err instanceof Error ? err.message : String(err), timestamp: new Date().toISOString() }));
    await sendEmail(data).catch((e) => console.error(JSON.stringify({ level: 'error', service: 'bullmq', message: 'email direct send failed', masked, error: e instanceof Error ? e.message : String(e), timestamp: new Date().toISOString() })));
  }
}

export async function enqueueSms(data: SmsJobData, jobId?: string): Promise<void> {
  const masked = data.to && data.to !== 'ADMIN' ? maskPhone(data.to) : (data.to ?? 'null');
  if (!isBullMQConfigured()) {
    const fn = data.to === 'ADMIN' ? sendAdminSMS(data.message) : sendSMS(data.to, data.message);
    await fn.catch((e) => console.error(JSON.stringify({ level: 'error', service: 'bullmq', message: 'sms direct send failed', masked, error: e instanceof Error ? e.message : String(e), timestamp: new Date().toISOString() })));
    return;
  }
  try {
    await getSmsQueue().add('send', data, jobId ? { ...SMS_JOB_OPTIONS, jobId } : SMS_JOB_OPTIONS);
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', service: 'bullmq', message: 'sms enqueue failed, falling back to direct send', error: err instanceof Error ? err.message : String(err), timestamp: new Date().toISOString() }));
    const fallback = data.to === 'ADMIN' ? sendAdminSMS(data.message) : sendSMS(data.to, data.message);
    await fallback.catch((e) => console.error(JSON.stringify({ level: 'error', service: 'bullmq', message: 'sms direct send failed', masked, error: e instanceof Error ? e.message : String(e), timestamp: new Date().toISOString() })));
  }
}
