// POST /api/admin/backups/restore/[date] — SUPERADMIN only.
// Restores a backup by reading the gzipped JSON dump from Supabase Storage
// and re-inserting rows using createMany({ skipDuplicates: true }).
// This is additive-only: existing rows are NOT overwritten.
// Tables are restored in FK dependency order.
import { NextResponse } from 'next/server';
import { gunzipSync } from 'node:zlib';
import { createClient } from '@supabase/supabase-js';
import { auth } from '../../../../../../../auth';
import { prisma } from '@/lib/prisma';
import { logServerError } from '@/lib/observability';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const BACKUP_PREFIX = 'backups/';

// Tables in FK dependency order (parents before children)
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

export async function POST(
  _request: Request,
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

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_PRIVATE_STORAGE_BUCKET ?? 'uploads-private';

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

    const restored: Record<string, number> = {};
    const errors: Record<string, string> = {};

    for (const [prismaModel, tableName] of RESTORE_ORDER) {
      const rows = dump.tables[tableName];
      if (!rows?.length) continue;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await (prisma[prismaModel] as any).createMany({
          data: rows,
          skipDuplicates: true,
        });
        restored[tableName] = result.count;
      } catch (err) {
        errors[tableName] = err instanceof Error ? err.message : String(err);
        logServerError('backup-restore', `failed to restore ${tableName}`, err, { date });
      }
    }

    return NextResponse.json({
      ok: Object.keys(errors).length === 0,
      date,
      restored,
      errors: Object.keys(errors).length > 0 ? errors : undefined,
      totalRestored: Object.values(restored).reduce((s, n) => s + n, 0),
    });
  } catch (err) {
    logServerError('backup-restore', 'restore error', err, { date });
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
