import { prisma } from '@/lib/prisma';
import { notDeleted } from '@/lib/prisma-soft';
import { sendSMS } from '@/lib/sms';
import { tryAcquireFlag } from '@/lib/cache';
import { countConsecutiveFailures } from '@/lib/heartbeat';
import { defineCron } from '@/lib/cron-runner';
import { getBackupFreshness, notifyBackupStale } from '@/lib/backup-health';
import { classifyCronFreshness, STALENESS_THRESHOLD_HOURS } from '@/lib/cron-freshness';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const RETENTION_DAYS = 30;
const DOWN_ALERT_THRESHOLD = 3;
const ALERT_FLAG_TTL = 3600; // 1h dedup on the SMS storm

/**
 * GET /api/cron/heartbeat
 *
 * Every 5 min: pings /api/health/ping, stores a `Heartbeat` row, then
 * prunes rows older than 30 days. Triggers an SMS to all SUPERADMIN users
 * when 3 consecutive heartbeats are non-ok (Redis-flag-deduped 1h).
 */
export const GET = defineCron({
  name: 'heartbeat',
  period: '5min',
  ttlSeconds: 300,
  fn: async ({ logger }) => {
    // Build the internal ping URL — prefer NEXTAUTH_URL (canonical), fall back
    // to VERCEL_URL (preview deploys), else localhost (dev).
    const base =
      process.env.NEXTAUTH_URL ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

    const startedAt = Date.now();
    let status: 'ok' | 'degraded' | 'down' = 'down';
    let dbStatus = 'down';
    let redisStatus = 'down';
    let latencyMs = 0;

    try {
      const res = await fetch(`${base}/api/health/ping`, {
        cache: 'no-store',
        // Don't let a stuck endpoint hold the worker forever
        signal: AbortSignal.timeout(15_000),
      });
      latencyMs = Date.now() - startedAt;
      const json = (await res.json().catch(() => null)) as
        | { status?: string; db?: string; redis?: string }
        | null;
      if (json && (json.status === 'ok' || json.status === 'degraded' || json.status === 'down')) {
        status = json.status;
        dbStatus = json.db ?? 'down';
        redisStatus = json.redis ?? 'down';
      } else {
        // Non-JSON response or unknown status — treat as down regardless of HTTP code
        status = 'down';
      }
    } catch (err) {
      latencyMs = Date.now() - startedAt;
      status = 'down';
      logger.error('cron-heartbeat', 'ping fetch failed', { error: err instanceof Error ? err.message : String(err) });
    }

    // Persist the row (best-effort — if DB is down we can't insert, but the
    // page will show the gap as a missing heartbeat).
    try {
      await prisma.heartbeat.create({
        data: { status, latencyMs, dbStatus, redisStatus },
      });
    } catch (err) {
      logger.error('cron-heartbeat', 'heartbeat insert failed', { error: err instanceof Error ? err.message : String(err) });
    }

    // Downtime detection: 3 consecutive non-ok → alert.
    let alerted = false;
    if (status !== 'ok') {
      try {
        const recent = await prisma.heartbeat.findMany({
          select: { timestamp: true, status: true, latencyMs: true, dbStatus: true, redisStatus: true },
          orderBy: { timestamp: 'desc' },
          take: DOWN_ALERT_THRESHOLD,
        });
        const consecutive = countConsecutiveFailures(recent);
        if (consecutive >= DOWN_ALERT_THRESHOLD) {
          // Redis-flag dedup: one alert per hour, even if downtime continues.
          const flagAcquired = await tryAcquireFlag('heartbeat:alerted', ALERT_FLAG_TTL);
          if (flagAcquired) {
            const superadmins = await prisma.user.findMany({
              where: notDeleted({ role: 'SUPERADMIN', phone: { not: null } }),
              select: { phone: true },
            });
            const message =
              '🚨 Dog Universe: 3 heartbeats KO consécutifs. Vérifier prod immédiatement.';
            await Promise.all(
              superadmins
                .filter((u): u is { phone: string } => Boolean(u.phone))
                .map((u) => sendSMS(u.phone, message).catch(() => false)),
            );
            alerted = true;
          }
        }
      } catch (err) {
        logger.error('cron-heartbeat', 'downtime alert failed', { error: err instanceof Error ? err.message : String(err) });
      }
    }

    // Backup staleness — independent of the heartbeat outcome itself. If no
    // successful backup landed in the last 25h we broadcast one SMS per UTC
    // day to every SUPERADMIN (dedup inside notifyBackupStale). Wrapped so a
    // Redis/Prisma hiccup here can never poison the heartbeat row already
    // inserted above.
    let backupStaleAlerted = false;
    let backupFreshnessHours: number | null = null;
    try {
      const freshness = await getBackupFreshness();
      backupFreshnessHours = freshness.hoursSinceLast;
      backupStaleAlerted = await notifyBackupStale(freshness);
    } catch (err) {
      logger.error('cron-heartbeat', 'backup staleness check failed', { error: err instanceof Error ? err.message : String(err) });
    }

    // Cron freshness watchdog — detects crons that were declared in
    // vercel.json but Vercel's scheduler never fired (typical cause: the
    // deploy that added the cron entry didn't re-sync the schedule list).
    // The classifier stamps a "first-seen" anchor in Redis the first time
    // it observes lastRun=null, then alerts once >48h elapsed since that
    // anchor (24h dedup on the SMS). See docs/CRON_RECOVERY.md.
    let staleCrons: string[] = [];
    try {
      const rows = await classifyCronFreshness();
      const stale = rows.filter((r) => r.stale);
      if (stale.length > 0) {
        staleCrons = stale.map((r) => r.name);
        // Dedup flag with the staleCrons signature as part of the key —
        // mirrors the heartbeat-down alert pattern (line 87).  Without this
        // we'd SMS every 5 min for the same stale set : 288 SMS/day to each
        // SUPERADMIN, which is the canonical "wake-up engineer at 3am for
        // nothing" failure mode.  24h TTL = one nag per day until fixed.
        const signature = [...staleCrons].sort().join('|');
        const dedupKey = `cron-freshness:alerted:${signature}`;
        const allowed = await tryAcquireFlag(dedupKey, 24 * 3600);
        if (allowed) {
          const superadmins = await prisma.user.findMany({
            where: notDeleted({ role: 'SUPERADMIN', phone: { not: null } }),
            select: { phone: true },
          });
          const message =
            `🚨 Dog Universe: cron(s) jamais exécuté(s) depuis ≥${STALENESS_THRESHOLD_HOURS}h : ${staleCrons.join(', ')}. Voir docs/CRON_RECOVERY.md.`;
          await Promise.all(
            superadmins
              .filter((u): u is { phone: string } => Boolean(u.phone))
              .map((u) => sendSMS(u.phone, message).catch(() => false)),
          );
        }
      }
    } catch (err) {
      logger.error('cron-heartbeat', 'cron freshness check failed', { error: err instanceof Error ? err.message : String(err) });
    }

    // Retention sweep — drop heartbeats older than 30 days.
    let deleted = 0;
    try {
      const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 3600 * 1000);
      const result = await prisma.heartbeat.deleteMany({
        where: { timestamp: { lt: cutoff } },
      });
      deleted = result.count;
    } catch (err) {
      logger.error('cron-heartbeat', 'retention sweep failed', { error: err instanceof Error ? err.message : String(err) });
    }

    return {
      status,
      latencyMs,
      dbStatus,
      redisStatus,
      alerted,
      pruned: deleted,
      backupStaleAlerted,
      backupFreshnessHours,
      staleCrons,
    };
  },
});
