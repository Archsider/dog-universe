import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { checkRedisHealth } from '@/lib/cache';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DB_TIMEOUT_MS = 5000;
const REDIS_TIMEOUT_MS = 5000;
const VERSION = process.env.npm_package_version ?? '1.0.0';

/**
 * GET /api/health/ping
 *
 * Public liveness/readiness probe. No auth, no rate-limit.
 *
 * Severity ladder:
 *   - DB down (query throws or times out) → 503 `down` — app cannot serve.
 *   - Redis down → 200 `degraded` — caches fail open, app still works.
 *   - Both up                     → 200 `ok`.
 *
 * Note: a slow but successful DB query is still "ok". Latency is reported but
 * not used to flip status — that's the role of /status's chart, not this probe.
 */
export async function GET() {
  const startedAt = Date.now();

  // ─── DB ─────────────────────────────────────────────────────────────────
  let dbStatus: 'ok' | 'down' = 'down';
  let dbLatencyMs = -1;
  try {
    const dbStart = Date.now();
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('DB_TIMEOUT')), DB_TIMEOUT_MS),
      ),
    ]);
    dbLatencyMs = Date.now() - dbStart;
    dbStatus = 'ok';
  } catch {
    dbStatus = 'down';
  }

  // ─── Redis (fail-open) ─────────────────────────────────────────────────
  let redisStatus: 'ok' | 'degraded' = 'degraded';
  try {
    const ok = await Promise.race([
      checkRedisHealth(),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), REDIS_TIMEOUT_MS)),
    ]);
    redisStatus = ok ? 'ok' : 'degraded';
  } catch {
    redisStatus = 'degraded';
  }

  const status: 'ok' | 'degraded' | 'down' =
    dbStatus === 'down' ? 'down' : redisStatus === 'degraded' ? 'degraded' : 'ok';

  const body = {
    status,
    timestamp: new Date().toISOString(),
    version: VERSION,
    db: dbStatus,
    redis: redisStatus,
    dbLatencyMs,
    totalLatencyMs: Date.now() - startedAt,
  };

  return NextResponse.json(body, { status: status === 'down' ? 503 : 200 });
}
