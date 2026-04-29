// Last-known driver position cached in Upstash Redis. Used by the SSE
// streaming endpoint at /api/taxi/[token]/stream to push positions to
// the public tracking page without hitting Postgres on every poll.
//
// Source of truth (TaxiLocation table) is still written by the admin
// tracking endpoint when the driver POSTs through it; this Redis cache
// is the hot read path. Fail-open everywhere — if Redis is missing or
// down, callers get null and fall back to DB / polling.
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

const TTL_SECONDS = 3600;
const locationKey = (bookingId: string) => `taxi:location:${bookingId}`;

export interface TaxiLocationSnapshot {
  lat: number;
  lng: number;
  /** epoch ms — driver's reported time, or server time at write if absent */
  timestamp: number;
  heading?: number | null;
  speed?: number | null;
}

/** Persist a fresh position. Never throws. */
export async function recordLocation(bookingId: string, snap: TaxiLocationSnapshot): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(locationKey(bookingId), JSON.stringify(snap), { ex: TTL_SECONDS });
  } catch (err) {
    console.error('[taxi-location] recordLocation failed:', err);
  }
}

/** Reads the last-known position. Returns null on miss / Redis down / parse error. */
export async function getLocation(bookingId: string): Promise<TaxiLocationSnapshot | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get<string | TaxiLocationSnapshot>(locationKey(bookingId));
    if (raw == null) return null;
    // Upstash sometimes returns the value already parsed when the JSON was
    // round-tripped through their REST encoder — handle both shapes.
    const parsed = typeof raw === 'string' ? (JSON.parse(raw) as TaxiLocationSnapshot) : raw;
    if (typeof parsed?.lat !== 'number' || typeof parsed?.lng !== 'number') return null;
    return parsed;
  } catch (err) {
    console.error('[taxi-location] getLocation failed:', err);
    return null;
  }
}

/** Best-effort cleanup. Safe after a trip transitions to a terminal status. */
export async function clearLocation(bookingId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(locationKey(bookingId));
  } catch (err) {
    console.error('[taxi-location] clearLocation failed:', err);
  }
}
