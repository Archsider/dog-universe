/**
 * DB-backed SMS deduplication — survives Redis restarts.
 *
 * Uses SmsLog.@@unique([phone, contentHash]) so BullMQ retry storms, Redis
 * flushes, and Vercel redeployments cannot deliver the same message twice
 * within a 24-hour window.
 *
 * Both paths (sendSmsWithRetry for critical SMS, processSmsJob for queued
 * batch SMS) call isSmsDedup before sending and recordSmsSent after success.
 * Fail-open on DB errors: the call proceeds rather than silently dropping.
 */
import { createHash } from 'crypto';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

const DEDUP_WINDOW_HOURS = 24;

export function smsDedupHash(phone: string, message: string): string {
  return createHash('sha256').update(`${phone}\x00${message}`).digest('hex');
}

/**
 * Returns true if an SMS to `phone` with the same content was already sent
 * within the last 24 hours. Fail-open: returns false on DB errors.
 */
export async function isSmsDedup(phone: string, message: string): Promise<boolean> {
  const hash = smsDedupHash(phone, message);
  const since = new Date(Date.now() - DEDUP_WINDOW_HOURS * 3_600_000);
  try {
    const existing = await prisma.smsLog.findFirst({
      where: { phone, contentHash: hash, sentAt: { gte: since } },
      select: { id: true },
    });
    return existing !== null;
  } catch (err) {
    logger.warn('sms-dedup', 'DB check failed (fail-open)', {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/**
 * Records a successfully sent SMS. Upserts on (phone, contentHash) to reset
 * the dedup window — correct if the same message is re-sent after the window
 * expires. Non-blocking: errors are swallowed so callers are never blocked.
 */
export async function recordSmsSent(
  phone: string,
  message: string,
  opts?: { bookingId?: string },
): Promise<void> {
  const hash = smsDedupHash(phone, message);
  try {
    await prisma.smsLog.upsert({
      where: { phone_contentHash: { phone, contentHash: hash } },
      update: { sentAt: new Date(), status: 'SENT' },
      create: {
        phone,
        contentHash: hash,
        status: 'SENT',
        bookingId: opts?.bookingId ?? null,
      },
    });
  } catch {
    // non-blocking: a missed dedup record is acceptable; a blocked send is not
  }
}
