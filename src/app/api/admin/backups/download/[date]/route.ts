// GET /api/admin/backups/download/[date] — SUPERADMIN only.
// Returns a short-lived (15 min) signed URL for downloading a backup file.
// The date param format is YYYY-MM-DD.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { auth } from '../../../../../../../auth';
import { logServerError } from '@/lib/observability';
import { getBackupBucket, BACKUP_PREFIX } from '@/lib/db-backup';

export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ date: string }> },
) {
  const session = await auth();
  if (session?.user?.role !== 'SUPERADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { date } = await params;
  if (!DATE_RE.test(date)) {
    return NextResponse.json({ error: 'Invalid date format (expected YYYY-MM-DD)' }, { status: 400 });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = getBackupBucket();

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Storage not configured' }, { status: 503 });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

    const key = `${BACKUP_PREFIX}${date}.json.gz`;
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(key, 15 * 60); // 15 minutes

    if (error) {
      logServerError('admin-backups', 'signed URL failed', error);
      return NextResponse.json({ error: 'Could not generate download link' }, { status: 500 });
    }

    return NextResponse.json({ url: data.signedUrl, expiresInSeconds: 900 });
  } catch (err) {
    logServerError('admin-backups', 'download error', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
