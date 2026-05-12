/**
 * Real-time transactional notifications (fire-and-forget).
 *
 * On Vercel Hobby, the BullMQ worker only runs once per minute via cron — so
 * queued transactional notifications (booking confirmation, validation, etc.)
 * arrive batched with up-to-1-minute latency. This module bypasses the queue
 * entirely for user-action-triggered notifications: it sends directly via the
 * underlying transports with a small in-process retry loop, while never
 * blocking the HTTP response.
 *
 * Usage:
 *   - User actions (booking, validation, photo, claim, message…) → sendEmailNow / sendSmsNow
 *   - Cron batches (reminders, birthdays, reviews, overdue, weekly) → enqueueEmail / enqueueSms
 *
 * Guarantees:
 *   - Returns synchronously (never await; the promise continues after return).
 *   - 3 attempts with backoff (0s, 1s, 3s).
 *   - DB dedup (SmsLog) blocks duplicate SMS even if BullMQ replays.
 *   - Final failure logs a structured error; never throws to the caller.
 */
import { sendEmail } from '@/lib/email';
import { sendSMS, sendAdminSMS } from '@/lib/sms';
import { isSmsDedup, recordSmsSent } from '@/lib/sms-dedup';
import type { EmailJobData, SmsJobData } from '@/lib/queues/index';
import { logger } from '@/lib/logger';

const RETRY_DELAYS_MS = [0, 1_000, 3_000];

function maskEmail(addr: string): string {
  return addr.replace(/(.{2}).*(@.*)/, '$1***$2');
}

function maskPhone(num: string): string {
  return num.length <= 4 ? '***' : `${num.slice(0, 4)}****${num.slice(-2)}`;
}

export async function sendEmailWithRetry(data: EmailJobData): Promise<void> {
  let lastErr: unknown;
  for (let i = 0; i < RETRY_DELAYS_MS.length; i++) {
    if (RETRY_DELAYS_MS[i] > 0) {
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[i]));
    }
    try {
      await sendEmail(data);
      return;
    } catch (err) {
      lastErr = err;
    }
  }
  logger.error('notify-now', 'email failed after 3 attempts', { to: maskEmail(data.to), error: lastErr instanceof Error ? lastErr.message : String(lastErr) });
}

export async function sendSmsWithRetry(data: SmsJobData): Promise<void> {
  if (data.to !== 'ADMIN' && !data.to) {
    // Mirror sendSMS(null) behaviour: silent skip.
    return;
  }
  const phone = data.to as string; // 'ADMIN' or real number

  // DB-level dedup — survives Redis restarts. Fail-open on DB error.
  const dup = await isSmsDedup(phone, data.message);
  if (dup) {
    logger.warn('notify-now', 'sms doublon bloqué', {
      to: phone === 'ADMIN' ? 'ADMIN' : maskPhone(phone),
    });
    return;
  }

  let lastErr: unknown;
  for (let i = 0; i < RETRY_DELAYS_MS.length; i++) {
    if (RETRY_DELAYS_MS[i] > 0) {
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[i]));
    }
    try {
      const ok =
        data.to === 'ADMIN'
          ? await sendAdminSMS(data.message)
          : await sendSMS(data.to, data.message);
      if (ok) {
        await recordSmsSent(phone, data.message);
        return;
      }
    } catch (err) {
      lastErr = err;
    }
  }
  logger.error('notify-now', 'sms failed after 3 attempts', { to: phone === 'ADMIN' ? 'ADMIN' : maskPhone(phone), error: lastErr instanceof Error ? lastErr.message : String(lastErr) });
}

/**
 * Send a transactional email in the background (fire-and-forget).
 * - 3 attempts with exponential-ish backoff (0s, 1s, 3s)
 * - Returns immediately — never await the underlying send
 * - Final failure → structured log, no exception bubbles up
 */
export function sendEmailNow(data: EmailJobData): void {
  // `void` prevents @typescript-eslint/no-floating-promises; the promise is
  // intentionally not awaited so the HTTP handler returns immediately.
  void sendEmailWithRetry(data);
}

export function sendSmsNow(data: SmsJobData): void {
  void sendSmsWithRetry(data);
}
