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

let _connection: IORedis | null = null;

export function getBullMQConnection(): IORedis {
  if (_connection) return _connection;

  const host = process.env.UPSTASH_REDIS_HOST;
  const port = parseInt(process.env.UPSTASH_REDIS_PORT ?? '6379', 10);
  const password = process.env.UPSTASH_REDIS_PASSWORD;

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
  });

  _connection.on('error', (err) => {
    console.error('[bullmq-redis] connection error:', err.message);
  });

  return _connection;
}

export function isBullMQConfigured(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_HOST && process.env.UPSTASH_REDIS_PASSWORD);
}
