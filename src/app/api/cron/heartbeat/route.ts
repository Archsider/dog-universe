import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendSMS } from '@/lib/sms';
import { tryAcquireFlag } from '@/lib/cache';
import { countConsecutiveFailures } from '@/lib/heartbeat';

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
export async function GET(request: Request) {
  // Cron auth: timing-safe compare against CRON_SECRET.
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }
  const { timingSafeEqual } = await import('crypto');
  const providedBuf = Buffer.from(authHeader ?? '');
  const expectedBuf = Buffer.from(`Bearer ${cronSecret}`);
  const authorized =
    providedBuf.length === expectedBuf.length && timingSafeEqual(providedBuf, expectedBuf);
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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
    console.error(JSON.stringify({
      level: 'error',
      service: 'cron-heartbeat',
      message: 'ping fetch failed',
      error: err instanceof Error ? err.message : String(err),
      timestamp: new Date().toISOString(),
    }));
  }

  // Persist the row (best-effort — if DB is down we can't insert, but the
  // page will show the gap as a missing heartbeat).
  try {
    await prisma.heartbeat.create({
      data: { status, latencyMs, dbStatus, redisStatus },
    });
  } catch (err) {
    console.error(JSON.stringify({
      level: 'error',
      service: 'cron-heartbeat',
      message: 'heartbeat insert failed',
      error: err instanceof Error ? err.message : String(err),
      timestamp: new Date().toISOString(),
    }));
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
        const acquired = await tryAcquireFlag('heartbeat:alerted', ALERT_FLAG_TTL);
        if (acquired) {
          const superadmins = await prisma.user.findMany({
            where: { role: 'SUPERADMIN', deletedAt: null, phone: { not: null } },
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
      console.error(JSON.stringify({
        level: 'error',
        service: 'cron-heartbeat',
        message: 'downtime alert failed',
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      }));
    }
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
    console.error(JSON.stringify({
      level: 'error',
      service: 'cron-heartbeat',
      message: 'retention sweep failed',
      error: err instanceof Error ? err.message : String(err),
      timestamp: new Date().toISOString(),
    }));
  }

  return NextResponse.json({
    ok: true,
    status,
    latencyMs,
    dbStatus,
    redisStatus,
    alerted,
    pruned: deleted,
  });
}
