// POST /api/admin/cron-trigger/purge-anonymized — SUPERADMIN only.
//
// Runs the RGPD purge synchronously and bypasses the monthly cron-lock so
// a manual trigger always actually executes. Mirrors the pattern used by
// /api/admin/backups/trigger (where the lock-bypass was the 2026-05-13 fix
// for "click does nothing after the daily run").
//
// Use cases:
//   - Validate after a config change (env vars, schedule, etc.) without
//     waiting for the next 1st-of-month tick.
//   - Recover if Vercel cron didn't fire on schedule (Vercel plan limits,
//     project not redeployed since the cron entry was added, etc.).
//   - Force-purge after a manual `anonymizedAt` backfill.

import { NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { runPurgeAnonymized } from '@/lib/rgpd-purge';
import { logServerError, markCronRun } from '@/lib/observability';
import { logAction } from '@/lib/log';

export const dynamic = 'force-dynamic';
// 60 s budget covers the 200-user batch cap (with contract storage I/O).
// Bump if the user count outgrows this.
export const maxDuration = 60;

export async function POST() {
  const session = await auth();
  if (session?.user?.role !== 'SUPERADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const startedAt = Date.now();
  try {
    const result = await runPurgeAnonymized();
    // Touch the same "last cron run" key the scheduled path writes, so
    // /admin/health's "Last run" indicator reflects manual triggers too
    // (and the operator can confirm the cron infrastructure works even
    // if Vercel hasn't fired the monthly schedule).
    await markCronRun('purge-anonymized');
    await logAction({
      userId: session.user.id,
      action: 'RGPD_PURGE_MANUAL_TRIGGER',
      entityType: 'System',
      entityId: 'purge-anonymized',
      details: {
        purged: result.purged,
        smsLogsDeleted: result.smsLogsDeleted,
        errors: result.errors?.length ?? 0,
      },
    });
    return NextResponse.json({
      ...result,
      durationMs: Date.now() - startedAt,
      triggeredManually: true,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logServerError('admin-cron-trigger', 'purge-anonymized error', err);
    return NextResponse.json(
      { ok: false, error: message, durationMs: Date.now() - startedAt },
      { status: 500 },
    );
  }
}
