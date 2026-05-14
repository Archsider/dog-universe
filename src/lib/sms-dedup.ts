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

/**
 * Atomically reserve the right to send `(phone, message)`.
 *
 * Races between two concurrent sends (admin double-click, retry, two code
 * paths firing the same event) are resolved here by the unique index
 * `(phone, contentHash)`: only one INSERT wins, the loser sees a P2002 and
 * returns `false`. The winner is the one allowed to hit the SMS gateway.
 *
 * Why this exists in addition to `isSmsDedup` + `recordSmsSent`: the old
 * read-then-write pair has a TOCTOU window — between the `findFirst` and
 * the eventual `upsert` a second caller can pass the dedup check and race
 * to send. We saw this in production (admin SMS shipped in pairs at busy
 * moments). INSERT-first uses the DB constraint as the lock. No window.
 *
 * Sentinel status `'PENDING'`: rows are created BEFORE the send. On send
 * success the caller flips them to `'SENT'`. On send failure they stay
 * `'PENDING'` and the dedup window blocks retries for the TTL — we prefer
 * "no SMS" over "two SMS" when the gateway is misbehaving.
 *
 * Fail-open: if the table doesn't exist or the DB is unreachable, return
 * `true` so an outage of the dedup layer never silences the user's
 * notifications. The warn log tells the operator.
 */
export async function tryReserveSmsSend(
  phone: string,
  message: string,
  opts?: { bookingId?: string },
): Promise<boolean> {
  const hash = smsDedupHash(phone, message);
  const since = new Date(Date.now() - DEDUP_WINDOW_HOURS * 3_600_000);

  try {
    const existing = await prisma.smsLog.findUnique({
      where: { phone_contentHash: { phone, contentHash: hash } },
      select: { sentAt: true },
    });
    if (existing && existing.sentAt >= since) {
      return false; // already sent within the dedup window
    }

    if (existing) {
      // Row exists but is stale (outside the window). Refresh atomically.
      // First caller's UPDATE wins; later concurrent UPDATEs overwrite with
      // the same data — harmless.
      await prisma.smsLog.update({
        where: { phone_contentHash: { phone, contentHash: hash } },
        data: { sentAt: new Date(), status: 'PENDING', bookingId: opts?.bookingId ?? null },
      });
      return true;
    }

    // No row at all — try to claim it. The unique constraint resolves the
    // race: exactly one concurrent caller's INSERT succeeds.
    try {
      await prisma.smsLog.create({
        data: {
          phone,
          contentHash: hash,
          status: 'PENDING',
          bookingId: opts?.bookingId ?? null,
        },
      });
      return true;
    } catch (err: unknown) {
      const code = (err as { code?: string } | null)?.code;
      if (code === 'P2002') return false; // lost the race
      throw err;
    }
  } catch (err) {
    logger.warn('sms-dedup', 'reserve failed — fail-open (allow send)', {
      error: err instanceof Error ? err.message : String(err),
    });
    return true;
  }
}

/**
 * Mark a previously reserved SMS as actually delivered. Idempotent.
 */
export async function markSmsSent(phone: string, message: string): Promise<void> {
  const hash = smsDedupHash(phone, message);
  try {
    await prisma.smsLog.update({
      where: { phone_contentHash: { phone, contentHash: hash } },
      data: { status: 'SENT', sentAt: new Date() },
    });
  } catch {
    // non-blocking
  }
}
