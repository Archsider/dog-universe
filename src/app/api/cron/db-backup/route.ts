import { log } from '@/lib/logger';
import { defineCron } from '@/lib/cron-runner';
import { runDbBackup, BackupError } from '@/lib/db-backup';
import { markBackupAttempt } from '@/lib/backup-health';

export const maxDuration = 300;

/**
 * GET /api/cron/db-backup
 * Daily 03:00 UTC (vercel.json) — exports critical tables to a gzipped JSON
 * dump uploaded to the private Supabase bucket under `backups/YYYY-MM-DD.json.gz`.
 *
 * Idempotent via `acquireCronLock` (defineCron, period: 'daily'): a second
 * tick within the same UTC day returns `{ skipped: true, reason: 'already_run' }`.
 * The SUPERADMIN-initiated manual trigger lives in `/api/admin/backups/trigger`
 * and bypasses this lock by calling `runDbBackup()` directly.
 *
 * Vercel Lambda has no `pg_dump` binary, so we read each table via Prisma
 * and serialise to JSON. Decimal/Date values become strings — the restore
 * route coerces them back. See docs/BACKUP_RESTORE.md for details.
 *
 * Retention: dumps older than 30 days are deleted on the same run.
 */
export const GET = defineCron({
  name: 'db-backup',
  period: 'daily',
  fn: async () => {
    try {
      const result = await runDbBackup();
      await markBackupAttempt({ ok: true, key: result.key, bytes: result.bytes });
      await log('info', 'cron-db-backup', 'backup completed', {
        key: result.key,
        bytes: result.bytes,
        rotated: result.rotated,
        durationMs: result.durationMs,
      });
      return {
        key: result.key,
        bytes: result.bytes,
        rotated: result.rotated,
        generatedAt: result.generatedAt,
        durationMs: result.durationMs,
        tableCounts: result.tableCounts,
      };
    } catch (err) {
      const code = err instanceof BackupError ? err.code : 'UNKNOWN';
      const message = err instanceof Error ? err.message : String(err);
      await markBackupAttempt({ ok: false, error: message, code });
      await log('error', 'cron-db-backup', 'backup failed', { code, error: message });
      throw err;
    }
  },
});
