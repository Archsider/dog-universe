import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { checkRedisHealth } from '@/lib/cache';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DB_LATENCY_BUDGET_MS = 500;
const VERSION = process.env.npm_package_version ?? '1.0.0';

/**
 * GET /api/health/ping
 *
 * Public liveness/readiness probe. No auth, no rate-limit (used by internal
 * cron + external uptime monitors). Returns:
 *   {
 *     status: 'ok' | 'degraded' | 'down',
 *     timestamp,
 *     version,
 *     db: 'ok' | 'down',
 *     redis: 'ok' | 'down',
 *     dbLatencyMs,
 *   }
 *
 * - DB ok if `SELECT 1` returns under 500 ms.
 * - Redis ok if write+read round-trip succeeds.
 * - Status: 'ok' both up, 'degraded' if redis down (app survives), 'down' if
 *   DB down (app cannot serve requests).
 *
 * HTTP status mirrors the JSON status: 200 for ok/degraded, 503 for down.
 */
export async function GET() {
  const startedAt = Date.now();
  let dbStatus: 'ok' | 'down' = 'down';
  let dbLatencyMs = -1;

  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    dbLatencyMs = Date.now() - dbStart;
    dbStatus = dbLatencyMs <= DB_LATENCY_BUDGET_MS ? 'ok' : 'down';
  } catch {
    dbStatus = 'down';
  }

  let redisStatus: 'ok' | 'down' = 'down';
  try {
    redisStatus = (await checkRedisHealth()) ? 'ok' : 'down';
  } catch {
    redisStatus = 'down';
  }

  const status: 'ok' | 'degraded' | 'down' =
    dbStatus === 'down' ? 'down' : redisStatus === 'down' ? 'degraded' : 'ok';

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
