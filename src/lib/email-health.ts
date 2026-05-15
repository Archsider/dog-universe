// Email health telemetry — captures "when was the last email actually sent?"
// from the SINGLE chokepoint `sendEmail()` (`src/lib/email/shared.ts`). Both
// transactional `sendEmailNow` (fire-and-forget direct SMTP since 2026-05-07)
// AND the BullMQ worker route through `sendEmail()`, so this captures every
// successful delivery regardless of path.
//
// Why a separate module from the existing diagnostics route? Because the
// previous implementation queried BullMQ's `getCompleted(0,0)` — which only
// reflects the LAST CRON BATCH email. Transactional emails (booking
// confirmation, validation, …) bypass the queue entirely since 2026-05-07,
// so the diagnostics widget froze at "Email il y a 3059 min" even though
// admin emails were arriving every hour.
//
// Backed by Upstash Redis. Single key:
//
//   email:last:sent  →  ISO timestamp, TTL 30 days
//
// No structured payload (just a timestamp) — full email history would
// require an `EmailLog` table, which we don't need today. SMS has SmsLog
// because dedup is enforced via the unique index; email dedup is the SMTP
// server's job (idempotent on Message-ID), so a "last sent" timestamp is
// enough for the diagnostics widget.

import { Redis } from '@upstash/redis';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

const TTL_SECONDS = 30 * 24 * 3600;

let cached: Redis | null | undefined;
function getRedis(): Redis | null {
  if (cached !== undefined) return cached;
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) { cached = null; return null; }
  cached = new Redis({ url, token });
  return cached;
}

/**
 * Records the ISO timestamp of the most recent successful email delivery.
 * Called from `sendEmail()` right after the SMTP `transport.sendMail` resolves.
 *
 * Fail-open: Redis unavailable → silently no-ops. We never block an email
 * send on the telemetry write.
 */
export async function markEmailSent(): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set('email:last:sent', new Date().toISOString(), { ex: TTL_SECONDS });
  } catch (err) {
    logger.error('email-health', 'markEmailSent failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Reads the ISO timestamp of the most recent successful email delivery, or
 * `null` if no email has been sent in the last 30 days (TTL window) or the
 * Redis backing is unreachable.
 */
export async function getLastEmailSentAt(): Promise<string | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get('email:last:sent');
    if (raw === null || raw === undefined) return null;
    return typeof raw === 'string' ? raw : String(raw);
  } catch (err) {
    logger.error('email-health', 'getLastEmailSentAt failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
