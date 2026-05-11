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
  /** Override the Redis lock key name. Defaults to `name`. Useful when the lock
   *  key is dynamic (e.g. hourly crons that embed the current hour in the key). */
  lockName?: string | (() => string);
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

export function defineCron({ name, period, lockName, ttlSeconds, fn }: DefineCronArgs) {
  return async function GET(request: Request) {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      logger.error('cron-runner', name + ': CRON_SECRET missing', {});
      return NextResponse.json({ error: 'misconfig' }, { status: 500 });
    }
    const { timingSafeEqual } = await import('crypto');
    // Accept both Vercel-injected Authorization: Bearer header and legacy
    // x-cron-secret header (kept for backward compat with older test infra).
    const authHeader = request.headers.get('authorization') ?? '';
    const legacyHeader = request.headers.get('x-cron-secret') ?? '';
    const bearerExpected = Buffer.from('Bearer ' + cronSecret);
    const legacyExpected = Buffer.from(cronSecret);
    const bearerBuf = Buffer.from(authHeader);
    const legacyBuf = Buffer.from(legacyHeader);
    const bearerOk = bearerBuf.length === bearerExpected.length && timingSafeEqual(bearerBuf, bearerExpected);
    const legacyOk = legacyBuf.length === legacyExpected.length && timingSafeEqual(legacyBuf, legacyExpected);
    if (!bearerOk && !legacyOk) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const ttl = ttlSeconds ?? defaultTtl(period);
    const resolvedLockName = lockName === undefined ? name : typeof lockName === 'function' ? lockName() : lockName;
    const acquired = await acquireCronLock(resolvedLockName, ttl, period);
    if (!acquired) return NextResponse.json({ ok: true, skipped: true, reason: 'already_run' });
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
