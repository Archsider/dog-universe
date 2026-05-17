// POST /api/admin/guardian/refresh — SUPERADMIN-triggered manual invariants run.
//
// Mirrors `/api/cron/invariants-check` minus the SMS and ActionLog side
// effects. Use case : after a data fix or migration, Mehdi wants the
// dashboard to refresh immediately instead of waiting up to 1h for the
// next cron tick. The page reads Redis `invariant:last:<key>` snapshots
// — this route re-runs the checks and overwrites them.
//
// Why no SMS : a manual trigger is a no-incident path. SMS dedup is
// 24h-keyed and would either be redundant (if same key already alerted)
// or wake superadmin phones at midnight for a known/in-progress fix.
//
// Why no ActionLog : ditto. Logs come from the cron, which is the
// authoritative recurring audit trail. Manual triggers are exploratory.

import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';
import { runAllInvariantChecks } from '@/lib/health-invariants';
import { cacheSet } from '@/lib/cache';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const RESULT_TTL_SECONDS = 7 * 24 * 3600;

export async function POST() {
  const guard = await requireRole(['SUPERADMIN']);
  if (guard.error) return guard.error;

  const startedAt = Date.now();
  const results = await runAllInvariantChecks();
  const checkedAt = new Date().toISOString();

  // Persist every result (green ones too) so the dashboard knows the
  // check ran. Same payload shape as the cron writer.
  let persisted = 0;
  for (const r of results) {
    try {
      await cacheSet(
        `invariant:last:${r.key}`,
        JSON.stringify({
          key: r.key,
          label: r.label,
          severity: r.severity,
          count: r.count,
          sample: r.sample,
          checkedAt,
        }),
        RESULT_TTL_SECONDS,
      );
      persisted++;
    } catch {
      // Redis down → skip silently. The cron is the authoritative writer ;
      // a missed manual refresh is a no-op.
    }
  }

  const violations = results.filter((r) => r.count > 0).length;
  const critical = results.filter((r) => r.count > 0 && r.severity === 'critical').length;

  return NextResponse.json({
    ok: true,
    checkedAt,
    durationMs: Date.now() - startedAt,
    totalChecks: results.length,
    persisted,
    violations,
    critical,
  });
}
