// Database backup runner — extracted from the daily cron so it can be invoked
// both:
//   1. From `/api/cron/db-backup` (Vercel daily 03:00 UTC, idempotent via
//      cron-lock so two ticks in the same UTC day are no-ops).
//   2. From `/api/admin/backups/trigger` (SUPERADMIN-initiated, MUST bypass
//      the daily lock — the historic bug was that pressing "Backup now"
//      after the cron had already run silently returned `skipped: true`
//      because the lock had already been claimed for the day).
//
// Behavior:
//   - Reads ~22 tables in parallel with hard `take` caps.
//   - Gzips the JSON dump and uploads to the private Supabase bucket
//     under `backups/YYYY-MM-DD.json.gz`. `upsert: true` so manual reruns
//     overwrite the day's file.
//   - Optionally rotates dumps older than `RETENTION_DAYS`.
//   - Returns structured stats so the caller can surface them in the UI.

import { gzipSync } from 'node:zlib';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { prisma } from '@/lib/prisma';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

export const BACKUP_PREFIX = 'backups/';
const RETENTION_DAYS = 30;

export interface BackupRunResult {
  key: string;
  bytes: number;
  rotated: number;
  generatedAt: string;
  tableCounts: Record<string, number>;
  /** Total milliseconds spent reading the DB, gzipping, and uploading. */
  durationMs: number;
}

export class BackupError extends Error {
  constructor(message: string, public code: 'NOT_CONFIGURED' | 'UPLOAD_FAILED' | 'READ_FAILED') {
    super(message);
    this.name = 'BackupError';
  }
}

function getSupabaseClient(): SupabaseClient {
  const supabaseUrl = env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new BackupError('Supabase env vars not configured', 'NOT_CONFIGURED');
  }
  return createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
}

/**
 * Runs a full backup and uploads it to Supabase. Throws `BackupError` for
 * structured failures (caller decides whether to log + propagate or surface
 * a user-facing message).
 *
 * `options.rotate` defaults to `true` — set to `false` to skip the rotation
 * pass when the caller only wants a quick on-demand snapshot.
 */
export async function runDbBackup(options: { rotate?: boolean } = {}): Promise<BackupRunResult> {
  const rotate = options.rotate !== false;
  const startedAt = Date.now();
  const supabase = getSupabaseClient();
  const bucket = env.SUPABASE_PRIVATE_STORAGE_BUCKET;

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const objectKey = `${BACKUP_PREFIX}${today}.json.gz`;

  // Read critical tables in parallel. Caps avoid loading pathological amounts
  // of data into a Lambda; bump if a table grows beyond.
  let rows;
  try {
    rows = await Promise.all([
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
      // Notification croissance non bornée — cap à 10k.
      prisma.notification.findMany({ take: 10_000, orderBy: { createdAt: 'desc' } }),
      prisma.adminNote.findMany({ take: 50_000 }),
      prisma.actionLog.findMany({ take: 50_000, orderBy: { createdAt: 'desc' } }),
      prisma.bookingItem.findMany({ take: 200_000 }),
      prisma.bookingPet.findMany({ take: 200_000 }),
      prisma.boardingDetail.findMany({ take: 100_000 }),
      prisma.taxiDetail.findMany({ take: 100_000 }),
      prisma.vaccination.findMany({ take: 100_000 }),
      prisma.review.findMany({ take: 50_000 }),
      prisma.addonRequest.findMany({ take: 50_000 }),
      prisma.heartbeat.findMany({ take: 20_000, orderBy: { timestamp: 'desc' } }),
      prisma.$queryRawUnsafe<unknown[]>(
        'SELECT * FROM "_app_migrations" ORDER BY "appliedAt" DESC LIMIT 1000',
      ).catch(() => [] as unknown[]),
    ]);
  } catch (err) {
    throw new BackupError(
      `Database read failed: ${err instanceof Error ? err.message : String(err)}`,
      'READ_FAILED',
    );
  }

  const [
    users, pets, bookings, invoices, invoiceItems, payments, products, contracts,
    invoiceSequences, loyaltyGrades, loyaltyBenefitClaims, notifications, adminNotes,
    actionLogs, bookingItems, bookingPets, boardingDetails, taxiDetails, vaccinations,
    reviews, addonRequests, heartbeats, appMigrations,
  ] = rows;

  const tables = {
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
  };

  const tableCounts: Record<string, number> = {};
  for (const [name, arr] of Object.entries(tables)) {
    tableCounts[name] = Array.isArray(arr) ? arr.length : 0;
  }

  const generatedAt = new Date().toISOString();
  const dump = {
    version: 1,
    generatedAt,
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local',
    tables,
  };

  const json = JSON.stringify(dump);
  const gz = gzipSync(json, { level: 9 });

  const { error: uploadErr } = await supabase.storage
    .from(bucket)
    .upload(objectKey, gz, {
      contentType: 'application/gzip',
      upsert: true,
    });
  if (uploadErr) {
    throw new BackupError(`Upload failed: ${uploadErr.message}`, 'UPLOAD_FAILED');
  }

  // Rotation — list and delete dumps older than RETENTION_DAYS. Non-fatal:
  // a failed rotation never undoes the successful upload above.
  let deleted = 0;
  if (rotate) {
    try {
      const { data: files, error: listErr } = await supabase.storage
        .from(bucket)
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
          const { error: delErr } = await supabase.storage.from(bucket).remove(stale);
          if (!delErr) deleted = stale.length;
        }
      }
    } catch (err) {
      logger.warn('db-backup', 'rotation failed (non-fatal)', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    key: objectKey,
    bytes: gz.length,
    rotated: deleted,
    generatedAt,
    tableCounts,
    durationMs: Date.now() - startedAt,
  };
}

/**
 * Lists existing backups in the Supabase bucket — used by the diagnostics
 * endpoint and the UI to surface "last successful backup" without depending
 * on Vercel logs.
 */
export interface BackupListItem {
  date: string;
  key: string;
  bytes: number | null;
  createdAt: string | null;
}

export async function listBackups(limit = 90): Promise<BackupListItem[]> {
  const supabase = getSupabaseClient();
  const bucket = env.SUPABASE_PRIVATE_STORAGE_BUCKET;
  const { data: files, error } = await supabase.storage
    .from(bucket)
    .list(BACKUP_PREFIX.replace(/\/$/, ''), { limit, sortBy: { column: 'name', order: 'desc' } });
  if (error) throw error;
  return (files ?? [])
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json\.gz$/.test(f.name))
    .map((f) => ({
      date: f.name.slice(0, 10),
      key: `${BACKUP_PREFIX}${f.name}`,
      bytes: f.metadata?.size ?? null,
      createdAt: f.created_at ?? null,
    }));
}
