/**
 * defineCron — wrapper unifié pour les routes cron.
 *
 * Centralise :
 *  - vérification du `CRON_SECRET` via `timingSafeEqual` (header `Authorization: Bearer …`)
 *  - acquisition du lock Redis (`acquireCronLock`) avec TTL adapté à la période
 *  - `markCronRun` (timestamp + Sentry breadcrumb)
 *  - capture des erreurs avec log structuré
 *
 * Le handler reçoit `{ now, logger }` et renvoie un payload JSON.
 * Le wrapper s'occupe d'emballer le résultat dans `NextResponse.json({ ok: true, ...payload })`.
 *
 * Pour les crons non encore migrés, le code existant reste valide — la migration
 * est progressive (POC sur 3 crons à courte durée d'exécution).
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
  /** Override du TTL Redis (défaut = quasi-période). */
  ttlSeconds?: number;
  /** Pour info — la valeur Vercel `maxDuration` doit être exportée séparément. */
  maxDuration?: number;
  fn: (ctx: CronContext) => Promise<Record<string, unknown>>;
}

function defaultTtl(period: CronPeriod): number {
  switch (period) {
    case 'daily':
      return 23 * 3600;
    case 'weekly':
      return 6 * 86400;
    case 'monthly':
      return 28 * 86400;
    case '5min':
      return 4 * 60;
  }
}

export function defineCron({ name, period, ttlSeconds, fn }: DefineCronArgs) {
  return async function GET(request: Request) {
    // ── Auth : timingSafeEqual sur Authorization Bearer ────────────────
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      logger.error('cron-runner', `${name}: CRON_SECRET missing`, {});
      return NextResponse.json({ error: 'misconfig' }, { status: 500 });
    }
    const { timingSafeEqual } = await import('crypto');
    const providedRaw = request.headers.get('authorization') ?? '';
    const provided = Buffer.from(providedRaw);
    const expected = Buffer.from(`Bearer ${cronSecret}`);
    if (
      provided.length !== expected.length ||
      !timingSafeEqual(provided, expected)
    ) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    // ── Lock Redis ─────────────────────────────────────────────────────
    const ttl = ttlSeconds ?? defaultTtl(period);
    const acquired = await acquireCronLock(name, ttl, period);
    if (!acquired) {
      return NextResponse.json({ ok: true, skipped: 'duplicate' });
    }

    // ── Run ────────────────────────────────────────────────────────────
    const startedAt = Date.now();
    try {
      await markCronRun(name);
      const result = await fn({ now: new Date(), logger });
      return NextResponse.json({
        ok: true,
        durationMs: Date.now() - startedAt,
        ...result,
      });
    } catch (err) {
      logger.error('cron-runner', `${name} failed`, {
        error: err instanceof Error ? err.message : String(err),
      });
      return NextResponse.json(
        { error: err instanceof Error ? err.message : String(err) },
        { status: 500 },
      );
    }
  };
}
