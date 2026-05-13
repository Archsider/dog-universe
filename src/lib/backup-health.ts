// Backup health telemetry — persists the outcome of every backup attempt
// (cron OR manual trigger) so the UI can surface a meaningful status banner
// without scraping Vercel logs.
//
// Backed by Upstash Redis (fail-open). Keys:
//   - bk:last:ok    : last successful run as JSON { at, key, bytes }
//   - bk:last:err   : last failed run as JSON { at, code, error }
// Both keys live 90 days — long enough to diagnose "why is the latest dump
// 3 weeks old?" without growing unbounded.

import { Redis } from '@upstash/redis';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

const TTL_SECONDS = 90 * 24 * 3600;

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
  if (!redis) return;
  const at = new Date().toISOString();
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
