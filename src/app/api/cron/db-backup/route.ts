import { timingSafeEqual } from 'crypto';
import { gzipSync } from 'node:zlib';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { prisma } from '@/lib/prisma';
import { acquireCronLock } from '@/lib/cron-lock';
import { markCronRun } from '@/lib/observability';
import { env } from '@/lib/env';
import { log, logger } from '@/lib/logger';

export const maxDuration = 300;

const BACKUP_BUCKET = env.SUPABASE_PRIVATE_STORAGE_BUCKET;
const RETENTION_DAYS = 30;
const BACKUP_PREFIX = 'backups/';

/**
 * GET /api/cron/db-backup
 * Daily 03:00 UTC (vercel.json) — exports critical tables to a gzipped JSON
 * dump uploaded to the private Supabase bucket under `backups/YYYY-MM-DD.json.gz`.
 *
 * Vercel Lambda has no `pg_dump` binary, so we read each table via Prisma
 * and serialise to JSON. Decimal/Date values become strings — restore
 * scripts must coerce back. See docs/BACKUP_RESTORE.md for details.
 *
 * Retention: dumps older than 30 days are deleted on the same run.
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
    ?? req.headers.get('authorization')?.replace('Bearer ', '');

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    await log('error', 'cron-db-backup', 'CRON_SECRET not configured');
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }
  const secretBuf = Buffer.from(secret ?? '');
  const expectedBuf = Buffer.from(cronSecret);
  const authorized =
    secretBuf.length === expectedBuf.length && timingSafeEqual(secretBuf, expectedBuf);
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const acquired = await acquireCronLock('db-backup', 23 * 3600, 'daily');
  if (!acquired) {
    return NextResponse.json({ skipped: true, reason: 'already_run' }, { status: 200 });
  }

  await markCronRun('db-backup');

  const supabaseUrl = env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    await log('error', 'cron-db-backup', 'Supabase env vars not configured');
    return NextResponse.json({ error: 'Storage not configured' }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const objectKey = `${BACKUP_PREFIX}${today}.json.gz`;

  try {
    // Read critical tables in parallel. Caps avoid loading pathological
    // amounts of data into a Lambda; bump if the table grows beyond.
    const [
      users,
      pets,
      bookings,
      invoices,
      invoiceItems,
      payments,
      products,
      contracts,
      invoiceSequences,
      loyaltyGrades,
      loyaltyBenefitClaims,
      notifications,
      adminNotes,
      actionLogs,
      bookingItems,
      bookingPets,
      boardingDetails,
      taxiDetails,
      vaccinations,
      reviews,
      addonRequests,
      heartbeats,
      appMigrations,
    ] = await Promise.all([
      prisma.user.findMany({ take: 50_000 }),
      prisma.pet.findMany({ take: 50_000 }),
      prisma.booking.findMany({ take: 100_000 }),
      prisma.invoice.findMany({ take: 100_000 }),
      prisma.invoiceItem.findMany({ take: 200_000 }),
      prisma.payment.findMany({ take: 100_000 }),
      prisma.product.findMany({ take: 5_000 }),
      // Contracts: metadata only — never the PDF binary (lives in storage).
      prisma.clientContract.findMany({
        select: {
          id: true,
          clientId: true,
          version: true,
          signedAt: true,
          ipAddress: true,
          storageKey: true,
          createdAt: true,
        },
        take: 50_000,
      }),
      prisma.invoiceSequence.findMany({ take: 1_000 }),
      prisma.loyaltyGrade.findMany({ take: 50_000 }),
      prisma.loyaltyBenefitClaim.findMany({ take: 100_000 }),
      // Notification : croissance non bornée — cap à 10k (entrées récentes
      // suffisent à reconstruire le contexte récent ; le reste est journal historique).
      prisma.notification.findMany({
        take: 10_000,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.adminNote.findMany({ take: 50_000 }),
      // ActionLog : journal, cap large mais pas illimité.
      prisma.actionLog.findMany({
        take: 50_000,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.bookingItem.findMany({ take: 200_000 }),
      prisma.bookingPet.findMany({ take: 200_000 }),
      prisma.boardingDetail.findMany({ take: 100_000 }),
      prisma.taxiDetail.findMany({ take: 100_000 }),
      prisma.vaccination.findMany({ take: 100_000 }),
      prisma.review.findMany({ take: 50_000 }),
      prisma.addonRequest.findMany({ take: 50_000 }),
      // Heartbeat : rétention 30j en DB, cap à 20k pour garder le contexte récent.
      prisma.heartbeat.findMany({
        take: 20_000,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.$queryRawUnsafe<unknown[]>(
        'SELECT * FROM "_app_migrations" ORDER BY "appliedAt" DESC LIMIT 1000',
      ).catch(() => [] as unknown[]),
    ]);

    const dump = {
      version: 1,
      generatedAt: new Date().toISOString(),
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local',
      tables: {
        User: users,
        Pet: pets,
        Booking: bookings,
        Invoice: invoices,
        InvoiceItem: invoiceItems,
        Payment: payments,
        Product: products,
        ClientContract: contracts,
        InvoiceSequence: invoiceSequences,
        LoyaltyGrade: loyaltyGrades,
        LoyaltyBenefitClaim: loyaltyBenefitClaims,
        Notification: notifications,
        AdminNote: adminNotes,
        ActionLog: actionLogs,
        BookingItem: bookingItems,
        BookingPet: bookingPets,
        BoardingDetail: boardingDetails,
        TaxiDetail: taxiDetails,
        Vaccination: vaccinations,
        Review: reviews,
        AddonRequest: addonRequests,
        Heartbeat: heartbeats,
        _app_migrations: appMigrations,
      },
    };

    const json = JSON.stringify(dump);
    const gz = gzipSync(json, { level: 9 });

    const { error: uploadErr } = await supabase.storage
      .from(BACKUP_BUCKET)
      .upload(objectKey, gz, {
        contentType: 'application/gzip',
        upsert: true,
      });
    if (uploadErr) {
      await log('error', 'cron-db-backup', 'upload failed', { error: uploadErr.message });
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }

    // Rotation — list and delete dumps older than RETENTION_DAYS.
    let deleted = 0;
    try {
      const { data: files, error: listErr } = await supabase.storage
        .from(BACKUP_BUCKET)
        .list(BACKUP_PREFIX.replace(/\/$/, ''), { limit: 1000 });
      if (!listErr && files) {
        const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 3600 * 1000);
        const stale = files
          .filter((f) => /^\d{4}-\d{2}-\d{2}\.json\.gz$/.test(f.name))
          .filter((f) => {
            const day = f.name.slice(0, 10);
            return new Date(day) < cutoff;
          })
          .map((f) => `${BACKUP_PREFIX}${f.name}`);
        if (stale.length > 0) {
          const { error: delErr } = await supabase.storage
            .from(BACKUP_BUCKET)
            .remove(stale);
          if (!delErr) deleted = stale.length;
        }
      }
    } catch (err) {
      // Non-fatal — the new dump is already saved.
      await log('warn', 'cron-db-backup', 'rotation failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    await log('info', 'cron-db-backup', 'backup completed', {
      key: objectKey,
      bytes: gz.length,
      rotated: deleted,
    });

    return NextResponse.json({
      ok: true,
      key: objectKey,
      bytes: gz.length,
      rotated: deleted,
    });
  } catch (err) {
    await log('error', 'cron-db-backup', 'backup failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Backup failed' }, { status: 500 });
  }
}
