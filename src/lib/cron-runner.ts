/**
 * defineCron — wrapper unifié pour les routes cron.
 *
 * Centralise CRON_SECRET timing-safe check, lock Redis (acquireCronLock),
 * markCronRun timestamp + log structuré des erreurs.
 *
 * Migration progressive — POC sur 3 crons (birthday, contract-reminders,
 * review-requests). Les autres restent sur le pattern manuel pour l'instant.
 */
import { NextResponse } from 'next/server';
import { acquireCronLock, type CronPeriod } from '@/lib/cron-lock';
import { markCronRun } from '@/lib/observability';
import { logger } from '@/lib/logger';

interface CronContext {
  now: Date;
  logger: typeof logger;
}

interface DefineCronArgs {
  name: string;
  period: CronPeriod;
  ttlSeconds?: number;
  maxDuration?: number;
  fn: (ctx: CronContext) => Promise<Record<string, unknown>>;
}

function defaultTtl(period: CronPeriod): number {
  switch (period) {
    case 'daily': return 23 * 3600;
    case 'weekly': return 6 * 86400;
    case 'monthly': return 28 * 86400;
    case '5min': return 4 * 60;
  }
}

export function defineCron({ name, period, ttlSeconds, fn }: DefineCronArgs) {
  return async function GET(request: Request) {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      logger.error('cron-runner', name + ': CRON_SECRET missing', {});
      return NextResponse.json({ error: 'misconfig' }, { status: 500 });
    }
    const { timingSafeEqual } = await import('crypto');
    const provided = Buffer.from(request.headers.get('authorization') ?? '');
    const expected = Buffer.from('Bearer ' + cronSecret);
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const ttl = ttlSeconds ?? defaultTtl(period);
    const acquired = await acquireCronLock(name, ttl, period);
    if (!acquired) return NextResponse.json({ ok: true, skipped: 'duplicate' });
    const startedAt = Date.now();
    try {
      await markCronRun(name);
      const result = await fn({ now: new Date(), logger });
      return NextResponse.json({ ok: true, durationMs: Date.now() - startedAt, ...result });
    } catch (err) {
      logger.error('cron-runner', name + ' failed', { error: err instanceof Error ? err.message : String(err) });
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
  };
}
