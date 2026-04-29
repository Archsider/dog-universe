// Redis-backed heartbeat for the driver GPS ping. The key TTL (310 s) is ~10×
// the normal ping interval (30 s), giving a generous buffer before a cron
// declares the driver unreachable. Fail-open everywhere.
import { Redis } from '@upstash/redis';

let cached: Redis | null | undefined;

function getRedis(): Redis | null {
  if (cached !== undefined) return cached;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) { cached = null; return null; }
  cached = new Redis({ url, token });
  return cached;
}

const TTL_SECONDS = 310;
const heartbeatKey = (bookingId: string) => `taxi:heartbeat:${bookingId}`;

/** Refreshes the heartbeat TTL. Never throws. */
export async function recordHeartbeat(bookingId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(heartbeatKey(bookingId), '1', { ex: TTL_SECONDS });
  } catch (err) {
    console.error('[taxi-heartbeat] recordHeartbeat failed:', err);
  }
}

/** Returns true if the driver's heartbeat is still alive. */
export async function isHeartbeatAlive(bookingId: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return true; // fail-open
  try {
    const val = await redis.get(heartbeatKey(bookingId));
    return val != null;
  } catch {
    return true; // fail-open
  }
}

/** Best-effort cleanup after a trip ends. */
export async function clearHeartbeat(bookingId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(heartbeatKey(bookingId));
  } catch (err) {
    console.error('[taxi-heartbeat] clearHeartbeat failed:', err);
  }
}
