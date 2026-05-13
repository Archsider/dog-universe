// POST /api/admin/backups/trigger — SUPERADMIN only.
//
// Runs `runDbBackup()` synchronously and bypasses the daily cron-lock so a
// manual trigger always produces a fresh dump even if the 03:00 UTC auto-run
// already claimed today's lock. The bucket upload uses `upsert: true`, so
// today's file is simply overwritten.
//
// 2026-05-13 fix: the previous implementation proxied to /api/cron/db-backup
// which went through defineCron + acquireCronLock — every manual click after
// the daily cron returned `{ skipped: true, reason: 'already_run' }` and the
// UI mistakenly surfaced "backup already done" while no extra dump existed.
import { NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { runDbBackup, BackupError } from '@/lib/db-backup';
import { markBackupAttempt } from '@/lib/backup-health';
import { logServerError } from '@/lib/observability';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST() {
  const session = await auth();
  if (session?.user?.role !== 'SUPERADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const result = await runDbBackup();
    await markBackupAttempt({ ok: true, key: result.key, bytes: result.bytes });
    return NextResponse.json({
      ok: true,
      key: result.key,
      bytes: result.bytes,
      rotated: result.rotated,
      generatedAt: result.generatedAt,
      tableCounts: result.tableCounts,
      durationMs: result.durationMs,
    });
  } catch (err) {
    if (err instanceof BackupError) {
      await markBackupAttempt({ ok: false, code: err.code, error: err.message });
      const status = err.code === 'NOT_CONFIGURED' ? 503 : 500;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    await markBackupAttempt({ ok: false, code: 'UNKNOWN', error: message });
    logServerError('admin-backups', 'trigger error', err);
    return NextResponse.json({ error: message, code: 'UNKNOWN' }, { status: 500 });
  }
}
