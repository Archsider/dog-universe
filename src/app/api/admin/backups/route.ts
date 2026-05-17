// GET /api/admin/backups — SUPERADMIN only.
//
// Returns the recent backup files PLUS structured diagnostics so the UI can
// display a meaningful status banner: storage configured? last success when?
// last error when? Removes the "is anything actually running?" guesswork.
import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';
import { env } from '@/lib/env';
import { logServerError } from '@/lib/observability';
import { listBackups, BackupError, getBackupBucket } from '@/lib/db-backup';
import { getLastBackupSuccess, getLastBackupError } from '@/lib/backup-health';

export const dynamic = 'force-dynamic';

export async function GET() {
  const authResult = await requireRole(['SUPERADMIN']);
  if (authResult.error) return authResult.error;

  const storageConfigured = Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
  const [lastSuccess, lastError] = await Promise.all([
    getLastBackupSuccess(),
    getLastBackupError(),
  ]);

  if (!storageConfigured) {
    return NextResponse.json({
      backups: [],
      diagnostics: {
        storageConfigured: false,
        bucket: getBackupBucket(),
        lastSuccess,
        lastError,
        message:
          'Supabase storage credentials missing. Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in Vercel env.',
      },
    });
  }

  try {
    const backups = await listBackups();
    return NextResponse.json({
      backups,
      diagnostics: {
        storageConfigured: true,
        bucket: getBackupBucket(),
        lastSuccess,
        lastError,
        count: backups.length,
      },
    });
  } catch (err) {
    if (err instanceof BackupError && err.code === 'NOT_CONFIGURED') {
      return NextResponse.json({ error: 'Storage not configured' }, { status: 503 });
    }
    logServerError('admin-backups', 'list error', err);
    return NextResponse.json({
      backups: [],
      diagnostics: {
        storageConfigured: true,
        bucket: getBackupBucket(),
        lastSuccess,
        lastError,
        listError: err instanceof Error ? err.message : String(err),
      },
    });
  }
}
