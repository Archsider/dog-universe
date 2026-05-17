// GET /api/admin/backups/download/[date] — SUPERADMIN only.
// Returns a short-lived (15 min) signed URL for downloading a backup file.
// The date param format is YYYY-MM-DD.
import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';
import { logServerError } from '@/lib/observability';
import { BACKUP_PREFIX } from '@/lib/db-backup';
import { createSignedBackupUrl } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ date: string }> },
) {
  const authResult = await requireRole(['SUPERADMIN']);
  if (authResult.error) return authResult.error;

  const { date } = await params;
  if (!DATE_RE.test(date)) {
    return NextResponse.json({ error: 'Invalid date format (expected YYYY-MM-DD)' }, { status: 400 });
  }

  try {
    // Signed URL via the dedicated backup helper. The bucket is private
    // (no public URLs ever generated) — admin sees a 15-minute link only.
    const url = await createSignedBackupUrl(`${BACKUP_PREFIX}${date}.json.gz`, 15 * 60);
    return NextResponse.json({ url, expiresInSeconds: 900 });
  } catch (err) {
    logServerError('admin-backups', 'signed URL failed', err);
    return NextResponse.json({ error: 'Could not generate download link' }, { status: 500 });
  }
}
