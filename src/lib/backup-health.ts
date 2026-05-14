// Backup health telemetry — persists the outcome of every backup attempt
// (cron OR manual trigger) so the UI can surface a meaningful status banner
// without scraping Vercel logs.
//
// Backed by Upstash Redis (fail-open). Keys:
//   - bk:last:ok    : last successful run as JSON { at, key, bytes }
//   - bk:last:err   : last failed run as JSON { at, code, error }
// Both keys live 90 days — long enough to diagnose "why is the latest dump
// 3 weeks old?" without growing unbounded.
//
// Real-time alerts (added 2026-05-14): every failed attempt fires an SMS to
// every SUPERADMIN (deduped 1h per error code so a flapping transient bucket
// can't spam). The heartbeat cron also calls `notifyBackupStale` every 5 min
// — if no successful backup landed in the last 25h, the same SUPERADMIN set
// receives a daily-dedup'd "no fresh backup" warning.

import { Redis } from '@upstash/redis';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { sendSmsNow } from '@/lib/notify-now';
import { tryAcquireFlag } from '@/lib/cache';

const TTL_SECONDS = 90 * 24 * 3600;

// A backup older than 25h is stale (the daily cron fires at 03:00 UTC, so a
// healthy pipeline always lands a row inside the last 24h ± slack).
export const BACKUP_STALE_THRESHOLD_HOURS = 25;
const STALE_ALERT_TTL_SECONDS = 24 * 3600;    // 1 alert / UTC day for staleness
const FAILURE_ALERT_TTL_SECONDS = 3600;       // 1 alert / hour per error code

let cached: Redis | null | undefined;
function getRedis(): Redis | null {
  if (cached !== undefined) return cached;
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) { cached = null; return null; }
  cached = new Redis({ url, token });
  return cached;
}

export interface LastBackupSuccess {
  at: string;       // ISO timestamp of the successful run
  key: string;      // backups/YYYY-MM-DD.json.gz
  bytes: number;    // compressed size on disk
}

export interface LastBackupError {
  at: string;       // ISO timestamp of the failed attempt
  code: string;     // BackupError code or 'UNKNOWN'
  error: string;    // human-readable message
}

export async function markBackupAttempt(
  input:
    | { ok: true; key: string; bytes: number }
    | { ok: false; code: string; error: string },
): Promise<void> {
  const redis = getRedis();
  const at = new Date().toISOString();
  if (redis) {
    try {
      if (input.ok) {
        const payload: LastBackupSuccess = { at, key: input.key, bytes: input.bytes };
        await redis.set('bk:last:ok', JSON.stringify(payload), { ex: TTL_SECONDS });
      } else {
        const payload: LastBackupError = { at, code: input.code, error: input.error };
        await redis.set('bk:last:err', JSON.stringify(payload), { ex: TTL_SECONDS });
      }
    } catch (err) {
      logger.error('backup-health', 'markBackupAttempt failed', {
        ok: input.ok,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Real-time SMS fan-out on failure. Fire-and-forget so we never block the
  // backup pipeline on the SMS gateway, and never throw to the caller — the
  // Redis write outcome above is the source of truth for telemetry. We still
  // call notifyBackupFailure when Redis is unconfigured: missing telemetry is
  // exactly when the operator most needs the SMS.
  if (!input.ok) {
    void notifyBackupFailure(input.code, input.error).catch((err) => {
      logger.error('backup-health', 'notifyBackupFailure dispatch failed', {
        code: input.code,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }
}

function parsePayload<T>(raw: unknown): T | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'object') return raw as T;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }
  return null;
}

export async function getLastBackupSuccess(): Promise<LastBackupSuccess | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    return parsePayload<LastBackupSuccess>(await redis.get('bk:last:ok'));
  } catch (err) {
    logger.error('backup-health', 'getLastBackupSuccess failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export async function getLastBackupError(): Promise<LastBackupError | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    return parsePayload<LastBackupError>(await redis.get('bk:last:err'));
  } catch (err) {
    logger.error('backup-health', 'getLastBackupError failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// ─── Freshness + real-time alerts ─────────────────────────────────────────

export interface BackupFreshness {
  /** True when no successful run exists, the recorded timestamp is unparseable,
   *  OR the last success is older than `BACKUP_STALE_THRESHOLD_HOURS`. */
  stale: boolean;
  /** Hours since the last successful run. `null` when no record exists or the
   *  recorded timestamp is unparseable. */
  hoursSinceLast: number | null;
  /** ISO timestamp of the last successful run, or `null`. */
  lastSuccessAt: string | null;
}

/** Pure-ish freshness inspector. Reads `bk:last:ok` and compares to `now`. */
export async function getBackupFreshness(now: Date = new Date()): Promise<BackupFreshness> {
  const last = await getLastBackupSuccess();
  if (!last) return { stale: true, hoursSinceLast: null, lastSuccessAt: null };
  const lastMs = new Date(last.at).getTime();
  if (!Number.isFinite(lastMs)) {
    return { stale: true, hoursSinceLast: null, lastSuccessAt: last.at };
  }
  const hours = (now.getTime() - lastMs) / 3_600_000;
  return {
    stale: hours >= BACKUP_STALE_THRESHOLD_HOURS,
    hoursSinceLast: hours,
    lastSuccessAt: last.at,
  };
}

/**
 * Broadcast a short SMS to every SUPERADMIN with a phone number on file.
 * Routed through `sendSmsNow` so SmsLog atomic dedup (ADR-0007) still applies
 * — two simultaneous alerts with the same body collapse to one delivery per
 * recipient. Returns the number of dispatch attempts made (not deliveries).
 */
async function broadcastBackupAlert(message: string): Promise<number> {
  let recipients: { phone: string | null }[] = [];
  try {
    recipients = await prisma.user.findMany({
      where: { role: 'SUPERADMIN', deletedAt: null, phone: { not: null } },
      select: { phone: true },
    });
  } catch (err) {
    logger.error('backup-health', 'broadcastBackupAlert lookup failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
  let count = 0;
  for (const r of recipients) {
    if (!r.phone) continue;
    sendSmsNow({ to: r.phone, message });
    count++;
  }
  return count;
}

/**
 * Real-time SMS fan-out on a failed backup attempt. Dedup is keyed by the
 * BackupError code so a flapping transient bucket (eg. STORAGE_TIMEOUT)
 * triggers at most one alert per hour, while a different failure mode that
 * appears 5 min later still gets through.
 *
 * Fail-open: any Redis hiccup in `tryAcquireFlag` falls through to a send,
 * because missing a real failure alert is worse than risking a duplicate SMS.
 */
export async function notifyBackupFailure(code: string, error: string): Promise<void> {
  const ok = await tryAcquireFlag(`bk:alert:err:${code}`, FAILURE_ALERT_TTL_SECONDS);
  if (!ok) return;
  // Keep the SMS short — the channel costs money per segment and the operator
  // already knows where to dig (`/admin/backups` shows the full error).
  const truncated = error.length > 120 ? `${error.slice(0, 117)}…` : error;
  const message = `🚨 Dog Universe: backup KO (${code}). ${truncated}`;
  await broadcastBackupAlert(message);
}

/**
 * Stale-backup alert — fires when `getBackupFreshness()` reports `stale: true`.
 * Dedup is keyed by the UTC calendar date so a still-broken pipeline produces
 * one reminder per day, not one per heartbeat tick (every 5 min = 288/day).
 *
 * Designed to be called from the heartbeat cron, but pure enough to call from
 * anywhere (admin diagnostic, smoke test, etc).
 */
export async function notifyBackupStale(
  freshness: BackupFreshness,
  now: Date = new Date(),
): Promise<boolean> {
  if (!freshness.stale) return false;
  const ymd = now.toISOString().slice(0, 10);
  const ok = await tryAcquireFlag(`bk:alert:stale:${ymd}`, STALE_ALERT_TTL_SECONDS);
  if (!ok) return false;
  const since =
    freshness.hoursSinceLast == null
      ? 'jamais'
      : `${Math.round(freshness.hoursSinceLast)}h`;
  const message = `🚨 Dog Universe: aucun backup réussi depuis ${since}. Vérifier /admin/backups.`;
  await broadcastBackupAlert(message);
  return true;
}
