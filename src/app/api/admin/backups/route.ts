// GET /api/admin/backups — SUPERADMIN only.
// Lists backup files from the private Supabase bucket under backups/ prefix.
// Returns metadata: date, size, key — no content (download is a separate endpoint).
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { auth } from '../../../../../auth';
import { logServerError } from '@/lib/observability';

export const dynamic = 'force-dynamic';

const BACKUP_PREFIX = 'backups/';

export async function GET() {
  const session = await auth();
  if (session?.user?.role !== 'SUPERADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_PRIVATE_STORAGE_BUCKET ?? 'uploads-private';

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Storage not configured' }, { status: 503 });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

    const { data: files, error } = await supabase.storage
      .from(bucket)
      .list(BACKUP_PREFIX.replace(/\/$/, ''), { limit: 90, sortBy: { column: 'name', order: 'desc' } });

    if (error) {
      logServerError('admin-backups', 'list failed', error);
      return NextResponse.json({ error: 'Storage error' }, { status: 500 });
    }

    const backups = (files ?? [])
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.json\.gz$/.test(f.name))
      .map((f) => ({
        date: f.name.slice(0, 10),
        key: `${BACKUP_PREFIX}${f.name}`,
        bytes: f.metadata?.size ?? null,
        createdAt: f.created_at ?? null,
      }));

    return NextResponse.json({ backups });
  } catch (err) {
    logServerError('admin-backups', 'list error', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
