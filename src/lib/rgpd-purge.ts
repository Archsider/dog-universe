// Pure RGPD purge logic, callable from both the monthly cron and the
// SUPERADMIN manual-trigger endpoint. The cron-runner wrapper handles
// auth + idempotency lock + markCronRun for the scheduled path; the
// trigger endpoint bypasses the lock so the operator can force-run
// after a missed schedule or to validate after a config change.
//
// What is deleted (PII or user-linked data):
//   - Notifications (in-app messages)
//   - AdminNotes targeting the anonymized client
//   - StayPhotos linked to the client's bookings
//   - ClientContracts (DB row + Supabase private storage file)
//   - Pets (already soft-deleted by anonymization — now hard-deleted)
//
// What is KEPT (accounting obligation ≥ 10 years, French/Moroccan law):
//   - Bookings, Invoices, ActionLogs (incl. the RGPD_PURGE entries below)

import { prisma } from '@/lib/prisma';
import { notDeleted } from '@/lib/prisma-soft';
import { logAction, LOG_ACTIONS } from '@/lib/log';
import { deleteFromPrivateStorage } from '@/lib/supabase';
import { logger } from '@/lib/logger';

const THREE_YEARS_MS = 3 * 365 * 24 * 60 * 60 * 1000;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export interface PurgeResult {
  ok: boolean;
  /** Number of User rows fully purged this run. */
  purged: number;
  /** Number of SmsLog rows older than 90 days deleted. */
  smsLogsDeleted: number;
  /** User IDs whose purge errored (the transaction rolled back, others
   *  continued). */
  errors?: string[];
  /** ISO timestamp of the cutoff used to select users. */
  cutoff: string;
}

export async function runPurgeAnonymized(): Promise<PurgeResult> {
  const smsLogCutoff = new Date(Date.now() - NINETY_DAYS_MS);
  const { count: smsLogsDeleted } = await prisma.smsLog
    .deleteMany({ where: { sentAt: { lt: smsLogCutoff } } })
    .catch((err) => {
      logger.error('cron-purge', 'smsLog purge failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return { count: 0 };
    });

  const cutoff = new Date(Date.now() - THREE_YEARS_MS);
  const cutoffIso = cutoff.toISOString();

  const users = await prisma.user.findMany({
    where: notDeleted({
      anonymizedAt: { not: null, lte: cutoff },
    }),
    select: { id: true },
    take: 200,
  });

  if (users.length === 0) {
    return { ok: true, purged: 0, smsLogsDeleted, cutoff: cutoffIso };
  }

  let purged = 0;
  const errors: string[] = [];

  for (const user of users) {
    const userId = user.id;
    try {
      const [bookingIds, contract] = await Promise.all([
        prisma.booking
          .findMany({ where: { clientId: userId }, select: { id: true }, take: 5000 })
          .then((rows) => rows.map((r) => r.id)),
        prisma.clientContract.findUnique({
          where: { clientId: userId },
          select: { id: true, storageKey: true },
        }),
      ]);

      // Hard-delete contract file from Supabase private storage first
      // (before DB row so we can log if storage fails without losing the key)
      if (contract?.storageKey) {
        try {
          await deleteFromPrivateStorage(contract.storageKey);
        } catch (storageErr) {
          logger.error('cron-purge', 'storage delete failed', {
            userId,
            error: storageErr instanceof Error ? storageErr.message : String(storageErr),
          });
          // Continue — DB row still gets deleted; orphaned storage key is acceptable.
        }
      }

      // Hard-delete all PII-containing or user-linked rows in one transaction.
      await prisma.$transaction([
        prisma.notification.deleteMany({ where: { userId } }),
        prisma.adminNote.deleteMany({ where: { entityType: 'CLIENT', entityId: userId } }),
        ...(bookingIds.length > 0
          ? [prisma.stayPhoto.deleteMany({ where: { bookingId: { in: bookingIds } } })]
          : []),
        prisma.clientContract.deleteMany({ where: { clientId: userId } }),
        prisma.pet.deleteMany({ where: { ownerId: userId } }),
      ]);

      await logAction({
        action: LOG_ACTIONS.RGPD_PURGE,
        entityType: 'User',
        entityId: userId,
        details: {
          bookingCount: bookingIds.length,
          contractPurged: Boolean(contract),
          cutoff: cutoffIso,
        },
      });

      purged += 1;
    } catch (err) {
      logger.error('cron-purge', 'purge failed for user', {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
      errors.push(userId);
    }
  }

  return {
    ok: errors.length === 0,
    purged,
    smsLogsDeleted,
    cutoff: cutoffIso,
    errors: errors.length > 0 ? errors : undefined,
  };
}
