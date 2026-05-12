// RGPD purge cron — hard-deletes residual personal data for users who were
// anonymized more than 3 years ago (loi 09-08 / GDPR art. 17 retention cap).
//
// What is deleted (PII or user-linked data):
//   - Notifications (in-app messages)
//   - AdminNotes targeting the anonymized client
//   - StayPhotos linked to the client's bookings
//   - ClientContracts (DB row + Supabase private storage file)
//   - Pets (already soft-deleted by anonymization — now hard-deleted)
//
// What is KEPT (accounting obligation ≥ 10 years, French/Moroccan law):
//   - Bookings
//   - Invoices
//   - ActionLogs
//
// Idempotent: skips users already fully purged (no rows to delete = no-op).
// Redis lock prevents double-run within the same monthly period.

import { prisma } from '@/lib/prisma';
import { logAction, LOG_ACTIONS } from '@/lib/log';
import { deleteFromPrivateStorage } from '@/lib/supabase';
import { defineCron } from '@/lib/cron-runner';

const THREE_YEARS_MS = 3 * 365 * 24 * 60 * 60 * 1000;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export const GET = defineCron({
  name: 'purge-anonymized',
  period: 'monthly',
  fn: async ({ logger }) => {
    // Purge SmsLog rows older than 90 days (retention cap, independent of user data).
    const smsLogCutoff = new Date(Date.now() - NINETY_DAYS_MS);
    const { count: smsLogsDeleted } = await prisma.smsLog.deleteMany({
      where: { sentAt: { lt: smsLogCutoff } },
    }).catch((err) => {
      logger.error('cron-purge', 'smsLog purge failed', { error: err instanceof Error ? err.message : String(err) });
      return { count: 0 };
    });

    const cutoff = new Date(Date.now() - THREE_YEARS_MS);

    const users = await prisma.user.findMany({
      where: {
        anonymizedAt: { not: null, lte: cutoff },
        deletedAt: null, // soft-delete: required — no global extension (Edge Runtime incompatible)
      },
      select: { id: true },
      take: 200,
    });

    if (users.length === 0) {
      return { purged: 0 };
    }

    let purged = 0;
    const errors: string[] = [];

    for (const user of users) {
      const userId = user.id;
      try {
        // Collect data needed before deletion
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
            logger.error('cron-purge', 'storage delete failed', { userId, error: storageErr instanceof Error ? storageErr.message : String(storageErr) });
            // Continue — DB row will still be deleted; orphaned storage key is acceptable
          }
        }

        // Hard-delete all PII-containing or user-linked rows in a single transaction
        await prisma.$transaction([
          // In-app notifications
          prisma.notification.deleteMany({ where: { userId } }),

          // Admin notes targeting this client
          prisma.adminNote.deleteMany({ where: { entityType: 'CLIENT', entityId: userId } }),

          // Stay photos linked to the client's bookings
          ...(bookingIds.length > 0
            ? [prisma.stayPhoto.deleteMany({ where: { bookingId: { in: bookingIds } } })]
            : []),

          // Contract DB row (storage already cleaned above)
          prisma.clientContract.deleteMany({ where: { clientId: userId } }),

          // Pets — already soft-deleted by anonymization, now hard-deleted
          prisma.pet.deleteMany({ where: { ownerId: userId } }),
        ]);

        await logAction({
          action: LOG_ACTIONS.RGPD_PURGE,
          entityType: 'User',
          entityId: userId,
          details: {
            bookingCount: bookingIds.length,
            contractPurged: Boolean(contract),
            cutoff: cutoff.toISOString(),
          },
        });

        purged += 1;
      } catch (err) {
        logger.error('cron-purge', 'purge failed for user', { userId, error: err instanceof Error ? err.message : String(err) });
        errors.push(userId);
      }
    }

    return {
      ok: errors.length === 0,
      purged,
      smsLogsDeleted,
      errors: errors.length > 0 ? errors : undefined,
    };
  },
});
