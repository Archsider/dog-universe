import { Queue, JobsOptions } from 'bullmq';
import { getBullMQConnection, isBullMQConfigured } from '@/lib/redis-bullmq';
import { sendEmail } from '@/lib/email';
import { sendSMS, sendAdminSMS } from '@/lib/sms';

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

// ── Shared job options ────────────────────────────────────────────────────────

const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2_000 },
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
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
  }
  return _emailQueue;
}

export function getSmsQueue(): Queue<SmsJobData> {
  if (!_smsQueue) {
    _smsQueue = new Queue<SmsJobData>(QUEUE_SMS, {
      connection: getBullMQConnection(),
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
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
  if (!isBullMQConfigured()) {
    await sendEmail(data).catch((e) => console.error('[email] direct send failed:', e));
    return;
  }
  try {
    await getEmailQueue().add('send', data, jobId ? { ...DEFAULT_JOB_OPTIONS, jobId } : DEFAULT_JOB_OPTIONS);
  } catch (err) {
    console.error('[queue] email enqueue failed, falling back to direct send:', err);
    await sendEmail(data).catch((e) => console.error('[email] direct send failed:', e));
  }
}

export async function enqueueSms(data: SmsJobData, jobId?: string): Promise<void> {
  if (!isBullMQConfigured()) {
    const fn = data.to === 'ADMIN' ? sendAdminSMS(data.message) : sendSMS(data.to, data.message);
    await fn.catch((e) => console.error('[sms] direct send failed:', e));
    return;
  }
  try {
    await getSmsQueue().add('send', data, jobId ? { ...DEFAULT_JOB_OPTIONS, jobId } : DEFAULT_JOB_OPTIONS);
  } catch (err) {
    console.error('[queue] sms enqueue failed, falling back to direct send:', err);
    const fallback = data.to === 'ADMIN' ? sendAdminSMS(data.message) : sendSMS(data.to, data.message);
    await fallback.catch((e) => console.error('[sms] direct send failed:', e));
  }
}
