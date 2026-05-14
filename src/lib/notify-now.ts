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
import { tryReserveSmsSend, markSmsSent } from '@/lib/sms-dedup';
import { enqueueSms } from '@/lib/queues';
import type { EmailJobData, SmsJobData } from '@/lib/queues/index';
import {
  decideSmsPolicy,
  type SmsCategory,
  type SmsRecipientType,
} from '@/lib/sms-policy';
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

  // Atomic reservation via SmsLog unique index. The first caller wins and
  // proceeds to the gateway; concurrent callers see the row already exists
  // and bail. This is the ONLY dedup gate — no TOCTOU window.
  const reserved = await tryReserveSmsSend(phone, data.message);
  if (!reserved) {
    logger.warn('notify-now', 'sms doublon bloqué (reservation lost)', {
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
        await markSmsSent(phone, data.message);
        return;
      }
    } catch (err) {
      lastErr = err;
    }
  }
  // All retries exhausted. The reservation row stays PENDING and blocks
  // re-sends for the dedup window. We prefer this over "no record" (which
  // would let a manual retry re-send) — the operator can see in SmsLog
  // which messages failed by filtering on status='PENDING'.
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

/**
 * Send a transactional SMS while respecting the business policy:
 *
 *   - Walk-in client + COMPTA category → SKIP (no SMS at all). A
 *     one-off cash payer doesn't expect ongoing notifications.
 *
 *   - Standard client + COMPTA + quiet hours (21h–9h Casablanca) →
 *     DEFER to next 9h via BullMQ delayed job. Atomic SmsLog dedup
 *     still applies, so even multiple admin-side mutations queue at
 *     most one SMS per (phone, content) pair.
 *
 *   - ADMIN recipient OR OPS category → send immediately, no
 *     conditions. Operational events (taxi tracking, booking
 *     confirmations) and admin-side notifications are real-time by
 *     design.
 *
 * Defaults are conservative: `category = 'OPS'` and
 * `recipient = 'standard'` (or 'admin' if `to === 'ADMIN'`). A caller
 * that forgets to mark a payment SMS as COMPTA ships it as OPS — which
 * means it WILL get sent (no spam suppression). Better to leak a
 * notification than to silence a critical one.
 *
 * See `src/lib/sms-policy.ts` for the pure decision function and the
 * docs/adr/0008-respectful-sms-policy.md ADR for the rationale.
 */
export function sendSmsRespectful(
  data: SmsJobData,
  opts: {
    category: SmsCategory;
    /** Override recipient classification. Defaults: 'admin' if
     *  `to === 'ADMIN'`, otherwise 'standard'. Pass 'walkin' for known
     *  walk-in client phones. */
    recipient?: SmsRecipientType;
  },
): void {
  const recipient: SmsRecipientType =
    opts.recipient ?? (data.to === 'ADMIN' ? 'admin' : 'standard');

  const decision = decideSmsPolicy({
    category: opts.category,
    recipient,
  });

  switch (decision.kind) {
    case 'send-now':
      sendSmsNow(data);
      return;

    case 'defer':
      // BullMQ delayed job → invisible until delayMs elapses → worker
      // cron tick after 9h picks it up. The standard processor path
      // re-checks SmsLog dedup at delivery time, so a second compta SMS
      // with the same content queued during the night collapses to one.
      void enqueueSms(data, undefined, { delay: decision.delayMs });
      logger.info('notify-now', 'sms deferred (quiet hours)', {
        to: data.to === 'ADMIN' ? 'ADMIN' : maskPhone(data.to ?? ''),
        delayMs: decision.delayMs,
        category: opts.category,
      });
      return;

    case 'skip':
      logger.info('notify-now', 'sms suppressed by policy', {
        to: data.to === 'ADMIN' ? 'ADMIN' : maskPhone(data.to ?? ''),
        reason: decision.reason,
        category: opts.category,
      });
      return;
  }
}
