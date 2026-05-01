// BullMQ requires ioredis (standard TCP Redis protocol), NOT @upstash/redis (REST/HTTP).
// @upstash/redis is used for the cron-lock because it only needs simple GET/SET.
// BullMQ uses Lua scripts, MULTI/EXEC, and blocking pops — all require a real TCP connection.
//
// Upstash compatibility:
//   - REST endpoint (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN) → @upstash/redis only
//   - TCP endpoint (UPSTASH_REDIS_HOST / UPSTASH_REDIS_PORT / UPSTASH_REDIS_PASSWORD) → ioredis ✓
//
// Required ioredis settings for BullMQ:
//   maxRetriesPerRequest: null  — BullMQ owns its own retry loop; the default ioredis retry
//                                 would conflict with BullMQ's job retry semantics.
//   enableReadyCheck: false     — Avoids READONLY/ping errors on Upstash TLS cold starts.
//   enableOfflineQueue: false   — Fail fast when Redis is unreachable instead of buffering
//                                 indefinitely (keeps Vercel function timeouts short).
import IORedis from 'ioredis';
import { env } from '@/lib/env';

let _connection: IORedis | null = null;

export function getBullMQConnection(): IORedis {
  if (_connection) return _connection;

  const host = env.UPSTASH_REDIS_HOST;
  const port = env.UPSTASH_REDIS_PORT ?? 6379;
  const password = env.UPSTASH_REDIS_PASSWORD;

  if (!host || !password) {
    throw new Error(
      'BullMQ requires UPSTASH_REDIS_HOST and UPSTASH_REDIS_PASSWORD. ' +
      'These are the TCP credentials from your Upstash dashboard (not the REST URL/token).',
    );
  }

  _connection = new IORedis({
    host,
    port,
    password,
    tls: { rejectUnauthorized: false },
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    enableOfflineQueue: false,
    lazyConnect: true,
  });

  _connection.on('error', (err) => {
    console.error(JSON.stringify({ level: 'error', service: 'bullmq-redis', message: err.message, timestamp: new Date().toISOString() }));
  });

  return _connection;
}

export function isBullMQConfigured(): boolean {
  return Boolean(env.UPSTASH_REDIS_HOST && env.UPSTASH_REDIS_PASSWORD);
}
