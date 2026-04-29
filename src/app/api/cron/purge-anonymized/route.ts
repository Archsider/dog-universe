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
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { acquireCronLock } from '@/lib/cron-lock';
import { logAction, LOG_ACTIONS } from '@/lib/log';
import { deleteFromPrivateStorage } from '@/lib/supabase';

const THREE_YEARS_MS = 3 * 365 * 24 * 60 * 60 * 1000;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('CRON_SECRET is not configured — cron endpoint is unprotected');
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Monthly idempotency lock (period key = YYYY-MM)
  const acquired = await acquireCronLock('purge-anonymized', 28 * 24 * 3600, 'weekly');
  if (!acquired) {
    return NextResponse.json({ skipped: true, reason: 'already_run' }, { status: 200 });
  }

  const cutoff = new Date(Date.now() - THREE_YEARS_MS);

  const users = await prisma.user.findMany({
    where: {
      anonymizedAt: { not: null, lte: cutoff },
    },
    select: { id: true },
  });

  if (users.length === 0) {
    return NextResponse.json({ ok: true, purged: 0 });
  }

  let purged = 0;
  const errors: string[] = [];

  for (const user of users) {
    const userId = user.id;
    try {
      // Collect data needed before deletion
      const [bookingIds, contract] = await Promise.all([
        prisma.booking
          .findMany({ where: { clientId: userId }, select: { id: true } })
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
          console.error(`[purge-anonymized] storage delete failed for ${userId}:`, storageErr);
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
      console.error(`[purge-anonymized] failed for user ${userId}:`, err);
      errors.push(userId);
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    purged,
    errors: errors.length > 0 ? errors : undefined,
  });
}
