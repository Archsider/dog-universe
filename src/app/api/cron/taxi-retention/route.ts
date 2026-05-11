import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { acquireCronLock } from '@/lib/cron-lock';
import { markCronRun } from '@/lib/observability';
import { logger } from '@/lib/logger';

export const maxDuration = 60;

/**
 * GET /api/cron/taxi-retention
 *
 * Daily retention sweep for taxi GPS data. Deletes TaxiLocation rows older
 * than 90 days that belong to trips in a terminal status (COMPLETED,
 * CANCELLED, ARRIVED_AT_PENSION, ARRIVED_AT_CLIENT, ARRIVED_AT_DESTINATION).
 *
 * Active trips are never touched — defensive safety net for any edge case
 * where a trip stayed open >90 days (e.g. forgotten by an admin).
 *
 * Batch DELETE limited to 5000 rows per run to keep the Lambda under 60 s.
 * If more than 5000 rows are eligible, the next run will pick them up.
 */

const TERMINAL_STATUSES = ['COMPLETED', 'CANCELLED', 'ARRIVED_AT_PENSION', 'ARRIVED_AT_CLIENT', 'ARRIVED_AT_DESTINATION'];
const RETENTION_DAYS = 90;
const BATCH_LIMIT = 5000;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    logger.error('cron-taxi-retention', 'CRON_SECRET is not configured — cron endpoint is unprotected');
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }
  const { timingSafeEqual } = await import('crypto');
  const providedBuf = Buffer.from(authHeader ?? '');
  const expectedBuf = Buffer.from(`Bearer ${cronSecret}`);
  const authorized = providedBuf.length === expectedBuf.length && timingSafeEqual(providedBuf, expectedBuf);
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Idempotency: short-circuit if we already ran today.
  const acquired = await acquireCronLock('taxi-retention', 23 * 3600, 'daily');
  if (!acquired) {
    return NextResponse.json({ skipped: true, reason: 'already_run' }, { status: 200 });
  }

  await markCronRun('taxi-retention');

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 3600 * 1000);
  const errors: string[] = [];
  let deleted = 0;

  try {
    // Find candidate location ids: createdAt < cutoff AND parent trip has
    // terminal status. We select ids first then delete by id list — keeps
    // the DELETE row count predictable (<= BATCH_LIMIT) regardless of how
    // many qualify globally.
    const candidates = await prisma.taxiLocation.findMany({
      where: {
        createdAt: { lt: cutoff },
        taxiTrip: { status: { in: TERMINAL_STATUSES } },
      },
      select: { id: true },
      take: BATCH_LIMIT,
      orderBy: { createdAt: 'asc' },
    });

    if (candidates.length > 0) {
      const ids = candidates.map(c => c.id);
      const result = await prisma.taxiLocation.deleteMany({
        where: { id: { in: ids } },
      });
      deleted = result.count;
    }

    logger.error('cron-taxi-retention', 'retention sweep complete', { deleted, cutoff: cutoff.toISOString(), batchLimit: BATCH_LIMIT });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(msg);
    logger.error('cron-taxi-retention', 'retention sweep failed', { error: msg });
  }

  return NextResponse.json({
    ok: errors.length === 0,
    deleted,
    locked: false,
    errors: errors.length ? errors : undefined,
  });
}
