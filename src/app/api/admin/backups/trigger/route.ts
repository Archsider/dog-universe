// POST /api/admin/backups/trigger — SUPERADMIN only.
// Triggers an immediate backup by calling the db-backup cron endpoint internally.
// Useful for on-demand backup before risky migrations or releases.
import { NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { logServerError } from '@/lib/observability';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST() {
  const session = await auth();
  if (session?.user?.role !== 'SUPERADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 503 });
  }

  const baseUrl = process.env.NEXTAUTH_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

  try {
    const res = await fetch(`${baseUrl}/api/cron/db-backup`, {
      headers: { 'x-cron-secret': cronSecret },
      signal: AbortSignal.timeout(280_000),
    });

    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      return NextResponse.json({ error: body.error ?? 'Backup failed', status: res.status }, { status: 500 });
    }

    return NextResponse.json({ ok: true, ...body });
  } catch (err) {
    logServerError('admin-backups', 'trigger error', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
