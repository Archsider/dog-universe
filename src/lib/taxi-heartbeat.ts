// Lightweight heartbeat tracking for STANDALONE PET_TAXI trips, backed by
// Upstash Redis (REST). The driver app pings every ~30s; if no ping arrives
// within 5 min on an active trip, the cron worker fans out an alert to admins.
//
// Fail-open everywhere: if Redis is missing/down, we never throw — the feature
// silently degrades (no heartbeat tracking, no alert), but the rest of the app
// keeps working.
import { Redis } from '@upstash/redis';

let cached: Redis | null | undefined;

function getRedis(): Redis | null {
  if (cached !== undefined) return cached;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    cached = null;
    return null;
  }
  cached = new Redis({ url, token });
  return cached;
}

const HEARTBEAT_TTL_SECONDS = 310;     // 5 min + 10 s safety margin
const ALERT_DEDUP_TTL_SECONDS = 3600;  // suppress repeat alerts for 1 h

const heartbeatKey = (bookingId: string) => `taxi:heartbeat:${bookingId}`;
const alertKey     = (bookingId: string) => `taxi:alert:${bookingId}`;

/** Record a fresh heartbeat for a booking. Stores the epoch ms so the admin UI
 *  can render "last seen X minutes ago". Never throws. */
export async function recordHeartbeat(bookingId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(heartbeatKey(bookingId), String(Date.now()), { ex: HEARTBEAT_TTL_SECONDS });
  } catch (err) {
    console.error('[taxi-heartbeat] recordHeartbeat failed:', err);
  }
}

/** Returns the last heartbeat timestamp (epoch ms) or null if absent/expired. */
export async function getLastHeartbeat(bookingId: string): Promise<number | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get<string | number>(heartbeatKey(bookingId));
    if (raw == null) return null;
    const ts = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
    return Number.isFinite(ts) ? ts : null;
  } catch (err) {
    console.error('[taxi-heartbeat] getLastHeartbeat failed:', err);
    return null;
  }
}

/** Atomic alert-dedup latch: returns true exactly once per ALERT_DEDUP_TTL_SECONDS
 *  window. Subsequent callers within the window get false. Fail-open returns
 *  false (better to skip an alert than to spam after a Redis outage). */
export async function tryClaimAlertSlot(bookingId: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  try {
    const result = await redis.set(alertKey(bookingId), '1', { nx: true, ex: ALERT_DEDUP_TTL_SECONDS });
    return result === 'OK';
  } catch (err) {
    console.error('[taxi-heartbeat] tryClaimAlertSlot failed:', err);
    return false;
  }
}

/** Best-effort cleanup. Safe to call after a trip transitions to a terminal
 *  status — never throws. Not strictly required (TTL handles it) but explicit
 *  cleanup avoids a stale alert latch outliving a fast resume on the same
 *  booking id (booking ids are CUIDs so this is mostly defensive). */
export async function clearHeartbeat(bookingId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(heartbeatKey(bookingId), alertKey(bookingId));
  } catch (err) {
    console.error('[taxi-heartbeat] clearHeartbeat failed:', err);
  }
}
