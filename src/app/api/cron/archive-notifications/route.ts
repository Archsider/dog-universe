import { prisma } from '@/lib/prisma';
import { notDeleted } from '@/lib/prisma-soft';
import { defineCron } from '@/lib/cron-runner';

export const maxDuration = 60;

/**
 * GET /api/cron/archive-notifications
 *
 * Daily archival sweep for stale Notification rows. Soft-deletes
 * notifications older than 90 days that belong to non-SUPERADMIN users.
 *
 *  - SUPERADMINs are excluded: their inbox doubles as an audit feed
 *    (cron failures, invariants, etc.), so historical alerts stay
 *    reachable indefinitely on that account.
 *  - We soft-delete (set `deletedAt`) rather than hard-DELETE because the
 *    Notification schema already carries that column (originally for
 *    ADMIN_MESSAGE / END_STAY_REPORT moderation — see CLIENT_MESSAGES.md).
 *    Audit logs + admin views can still surface the trace if needed.
 *  - Batch limited to 5000 rows per tick to stay well under the 60s
 *    Lambda budget. Subsequent ticks pick up the next 5000 — the first
 *    catch-up run becomes eventually consistent over a few days, which
 *    is fine for archival.
 *  - One ActionLog row per batch tracks the sweep for audit purposes.
 *
 * Schedule: daily 04h UTC (see vercel.json) — outside the morning cron
 * burst (06h-10h UTC) and the nightly backup (03h UTC).
 *
 * Part of the May 17 10x-scale-prep PR.
 */

const RETENTION_DAYS = 90;
const BATCH_LIMIT = 5000;

export const GET = defineCron({
  name: 'archive-notifications',
  period: 'daily',
  fn: async ({ logger }) => {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 3600 * 1000);
    const errors: string[] = [];
    let archived = 0;

    try {
      // Select id list first so the UPDATE row count is bounded and we
      // can audit-log the exact batch size without trusting a count
      // returned across a relation filter.
      const candidates = await prisma.notification.findMany({
        where: notDeleted({
          createdAt: { lt: cutoff },
          user: { role: { not: 'SUPERADMIN' } },
        }),
        select: { id: true },
        take: BATCH_LIMIT,
        orderBy: { createdAt: 'asc' },
      });

      if (candidates.length > 0) {
        const ids = candidates.map((c) => c.id);
        const result = await prisma.notification.updateMany({
          where: notDeleted({ id: { in: ids } }),
          data: { deletedAt: new Date(), deletedBy: 'cron:archive-notifications' },
        });
        archived = result.count;

        // Audit trail — one row per batch is enough; cutoff + batch count
        // are all we need to reconstruct what happened.
        await prisma.actionLog.create({
          data: {
            action: 'NOTIFICATION_ARCHIVED_BATCH',
            entityType: 'Notification',
            details: JSON.stringify({
              archived,
              cutoff: cutoff.toISOString(),
              batchLimit: BATCH_LIMIT,
              retentionDays: RETENTION_DAYS,
            }),
          },
        });
      }

      logger.error('cron-archive-notifications', 'archive sweep complete', {
        archived,
        cutoff: cutoff.toISOString(),
        batchLimit: BATCH_LIMIT,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(msg);
      logger.error('cron-archive-notifications', 'archive sweep failed', { error: msg });
    }

    return {
      ok: errors.length === 0,
      archived,
      errors: errors.length ? errors : undefined,
    };
  },
});
