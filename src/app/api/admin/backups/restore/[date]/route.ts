// POST /api/admin/backups/restore/[date] — SUPERADMIN only.
//
// Additive restore: reads the gzipped JSON dump from Supabase Storage and
// re-inserts rows in FK dependency order. `createMany({ skipDuplicates: true })`
// is tried per table; if it throws (one bad row poisons the whole batch),
// we fall back to per-row inserts so the rest of the table can still recover.
//
// Per-row fallback distinguishes 3 outcomes:
//   - inserted : row didn't exist, now does
//   - skipped  : Prisma P2002 (unique violation) — already exists, that's fine
//   - failed   : any other error (FK violation, type mismatch…) — surfaced to UI
//
// Optional `?dryRun=1` query param skips all writes and returns the per-table
// row counts that WOULD be processed, so the admin can preview the impact.
import { NextRequest, NextResponse } from 'next/server';
import { gunzipSync } from 'node:zlib';
import { createClient } from '@supabase/supabase-js';
import { Prisma } from '@prisma/client';
import { auth } from '../../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { env } from '@/lib/env';
import { logServerError } from '@/lib/observability';
import { getBackupBucket, BACKUP_PREFIX } from '@/lib/db-backup';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Tables in FK dependency order (parents before children).
const RESTORE_ORDER = [
  ['user',               'User'],
  ['pet',                'Pet'],
  ['product',            'Product'],
  ['invoiceSequence',    'InvoiceSequence'],
  ['booking',            'Booking'],
  ['bookingPet',         'BookingPet'],
  ['bookingItem',        'BookingItem'],
  ['boardingDetail',     'BoardingDetail'],
  ['taxiDetail',         'TaxiDetail'],
  ['invoice',            'Invoice'],
  ['invoiceItem',        'InvoiceItem'],
  ['payment',            'Payment'],
  ['clientContract',     'ClientContract'],
  ['loyaltyGrade',       'LoyaltyGrade'],
  ['loyaltyBenefitClaim','LoyaltyBenefitClaim'],
  ['vaccination',        'Vaccination'],
  ['notification',       'Notification'],
  ['adminNote',          'AdminNote'],
  ['actionLog',          'ActionLog'],
  ['review',             'Review'],
  ['addonRequest',       'AddonRequest'],
] as const;

interface TableResult {
  inserted: number;
  skipped: number;
  failed: number;
  errors: string[];
}

type CreateManyDelegate = {
  createMany: (args: { data: unknown[]; skipDuplicates?: boolean }) => Promise<{ count: number }>;
  create: (args: { data: unknown }) => Promise<unknown>;
};

async function restoreTable(
  delegate: CreateManyDelegate,
  rows: unknown[],
): Promise<TableResult> {
  // Fast path: batch insert with skipDuplicates. If Prisma can map every row
  // it returns count = inserted; skipped rows don't surface but we infer them
  // from rows.length - count.
  try {
    const result = await delegate.createMany({ data: rows, skipDuplicates: true });
    return {
      inserted: result.count,
      skipped: rows.length - result.count,
      failed: 0,
      errors: [],
    };
  } catch (batchErr) {
    // Slow path: a single bad row poisoned the batch. Insert row by row so
    // good rows can still land. Cap error sample to 5 to avoid huge responses.
    const out: TableResult = { inserted: 0, skipped: 0, failed: 0, errors: [] };
    for (const row of rows) {
      try {
        await delegate.create({ data: row });
        out.inserted++;
      } catch (rowErr) {
        if (rowErr instanceof Prisma.PrismaClientKnownRequestError && rowErr.code === 'P2002') {
          out.skipped++;
        } else {
          out.failed++;
          if (out.errors.length < 5) {
            out.errors.push(rowErr instanceof Error ? rowErr.message : String(rowErr));
          }
        }
      }
    }
    if (out.failed === 0 && out.inserted === 0 && out.skipped === rows.length) {
      // All rows already existed and the original batch threw — recoverable.
      return out;
    }
    if (out.errors.length === 0) {
      out.errors.push(batchErr instanceof Error ? batchErr.message : String(batchErr));
    }
    return out;
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ date: string }> },
) {
  const { date } = await params;

  const session = await auth();
  if (session?.user?.role !== 'SUPERADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
  }

  const dryRun = request.nextUrl.searchParams.get('dryRun') === '1';

  const supabaseUrl = env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = getBackupBucket();

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Storage not configured' }, { status: 503 });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
    const objectKey = `${BACKUP_PREFIX}${date}.json.gz`;

    const { data, error } = await supabase.storage.from(bucket).download(objectKey);
    if (error || !data) {
      return NextResponse.json({ error: 'Backup not found' }, { status: 404 });
    }

    const buf = Buffer.from(await data.arrayBuffer());
    const json = gunzipSync(buf).toString('utf-8');
    const dump = JSON.parse(json) as { version: number; tables: Record<string, unknown[]> };

    if (!dump?.tables) {
      return NextResponse.json({ error: 'Invalid backup format' }, { status: 422 });
    }

    // Dry-run: count rows per table without writing anything.
    if (dryRun) {
      const preview: Record<string, number> = {};
      let total = 0;
      for (const [, tableName] of RESTORE_ORDER) {
        const rows = dump.tables[tableName];
        const n = Array.isArray(rows) ? rows.length : 0;
        if (n > 0) preview[tableName] = n;
        total += n;
      }
      return NextResponse.json({ ok: true, dryRun: true, date, preview, total });
    }

    const results: Record<string, TableResult> = {};
    const prismaAny = prisma as unknown as Record<string, CreateManyDelegate>;

    for (const [prismaModel, tableName] of RESTORE_ORDER) {
      const rows = dump.tables[tableName];
      if (!rows?.length) continue;
      const delegate = prismaAny[prismaModel];
      if (!delegate) continue;
      results[tableName] = await restoreTable(delegate, rows);
    }

    const totalInserted = Object.values(results).reduce((s, r) => s + r.inserted, 0);
    const totalSkipped = Object.values(results).reduce((s, r) => s + r.skipped, 0);
    const totalFailed = Object.values(results).reduce((s, r) => s + r.failed, 0);
    const hasFailures = totalFailed > 0;

    return NextResponse.json({
      ok: !hasFailures,
      date,
      results,
      totals: { inserted: totalInserted, skipped: totalSkipped, failed: totalFailed },
      // Back-compat for the original UI:
      totalRestored: totalInserted,
      errors: hasFailures
        ? Object.fromEntries(
            Object.entries(results)
              .filter(([, r]) => r.failed > 0)
              .map(([t, r]) => [t, r.errors.join('; ')]),
          )
        : undefined,
    });
  } catch (err) {
    logServerError('backup-restore', 'restore error', err, { date });
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
