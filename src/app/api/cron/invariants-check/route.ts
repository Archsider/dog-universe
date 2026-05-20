// GET /api/cron/invariants-check — hourly accounting invariants watchdog.
//
// Runs every full hour (vercel.json schedule `0 * * * *`). For each
// invariant violation :
//   - persists the snapshot in Redis (`invariant:last:<key>` JSON, TTL 7d)
//     so /admin/guardian/invariants reads in O(1) without re-running the
//     SQL checks
//   - if severity === 'critical' AND count > 0, broadcasts a single SMS
//     to all SUPERADMIN users (dedup 24h per key via Redis flag — same
//     pattern as the backup-health alerter)
//   - logs an ActionLog entry `INVARIANT_VIOLATION_DETECTED` with the
//     sample rows so even if Redis is wiped we keep the audit trail
//
// Warning-severity violations are NOT SMS'd here — the existing daily
// `health-reconciliation` cron still emails the digest. We don't want to
// spam at 03h in the morning over a stock drift.
//
// Cron-lock via `defineCron({ period: 'hourly' })` prevents double-run
// within the same hour. Fail-open : if Redis is unreachable, the cron
// still completes ; the dashboard will show "no data" for that tick.

import { defineCron } from '@/lib/cron-runner';
import { runAllInvariantChecks } from '@/lib/health-invariants';
import { notDeleted } from '@/lib/prisma-soft';
import { cacheSet, tryAcquireFlag } from '@/lib/cache';
import { prisma } from '@/lib/prisma';
import { sendSMS } from '@/lib/sms';
import { logAction } from '@/lib/log';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const RESULT_TTL_SECONDS = 7 * 24 * 3600;
const ALERT_DEDUP_TTL_SECONDS = 24 * 3600;

export const GET = defineCron({
  name: 'invariants-check',
  period: 'hourly',
  fn: async ({ logger }) => {
    const startedAt = Date.now();
    const results = await runAllInvariantChecks();
    const checkedAt = new Date().toISOString();

    // ── Persist every result (even the green ones) so the dashboard
    //    knows the check ran. Sample is capped at 5 rows by the helpers
    //    themselves — payload stays small.
    const persisted: string[] = [];
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
        persisted.push(r.key);
      } catch (err) {
        logger.error('cron-invariants-check', 'persist failed', {
          key: r.key,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // ── SMS alert path : critical + count > 0, deduped 24h per key.
    const violations = results.filter((r) => r.count > 0);
    const critical = violations.filter((r) => r.severity === 'critical');
    let smsRecipients = 0;
    const smsedKeys: string[] = [];

    if (critical.length > 0) {
      const superadmins = await prisma.user.findMany({
        where: notDeleted({ role: 'SUPERADMIN', phone: { not: null } }),
        select: { phone: true },
        take: 20, // defensive cap
      });
      const phones = superadmins
        .map((u) => u.phone)
        .filter((p): p is string => Boolean(p));

      for (const r of critical) {
        const flagAcquired = await tryAcquireFlag(
          `invariant:alert:${r.key}`,
          ALERT_DEDUP_TTL_SECONDS,
        );
        if (!flagAcquired) continue; // already alerted in the last 24h
        smsedKeys.push(r.key);
        const message =
          `🚨 Dog Universe: invariant comptable cassé — ${r.label} (${r.count} ligne${r.count > 1 ? 's' : ''}). Voir /admin/guardian/invariants.`;
        for (const phone of phones) {
          try {
            await sendSMS(phone, message);
            smsRecipients++;
          } catch (err) {
            logger.error('cron-invariants-check', 'sms failed', {
              key: r.key,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }
    }

    // ── Audit log — every violation (critical or warning) logs an entry
    //    so we keep the historical trail even after Redis TTL expires.
    if (violations.length > 0) {
      try {
        await logAction({
          action: 'INVARIANT_VIOLATION_DETECTED',
          entityType: 'invariant',
          entityId: 'batch',
          details: {
            checkedAt,
            durationMs: Date.now() - startedAt,
            violations: violations.map((r) => ({
              key: r.key,
              severity: r.severity,
              count: r.count,
            })),
            sample: violations.slice(0, 3).map((r) => ({
              key: r.key,
              first: r.sample[0] ?? null,
            })),
          },
        });
      } catch (err) {
        logger.error('cron-invariants-check', 'action log failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return {
      checkedAt,
      durationMs: Date.now() - startedAt,
      totalChecks: results.length,
      violations: violations.length,
      criticalViolations: critical.length,
      smsRecipients,
      smsedKeys,
      persisted: persisted.length,
    };
  },
});
