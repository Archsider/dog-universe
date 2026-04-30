import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { checkRedisHealth } from '@/lib/cache';
import { checkStorageHealth } from '@/lib/supabase';

export async function GET() {
  const [dbResult, redisResult, storageResult] = await Promise.allSettled([
    prisma.$queryRaw`SELECT 1`,
    checkRedisHealth(),
    checkStorageHealth(),
  ]);

  const db = dbResult.status === 'fulfilled' ? 'ok' : 'error';
  const redis = redisResult.status === 'fulfilled' && redisResult.value ? 'ok' : 'degraded';
  const storage = storageResult.status === 'fulfilled' && storageResult.value ? 'ok' : 'degraded';

  const overall =
    db === 'error' ? 'error' :
    redis !== 'ok' || storage !== 'ok' ? 'degraded' :
    'ok';

  return NextResponse.json(
    {
      status: overall,
      db,
      redis,
      storage,
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local',
      uptime: Math.floor(process.uptime()),
    },
    { status: overall === 'error' ? 503 : 200 },
  );
}
