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

// ── GPS validation ────────────────────────────────────────────────────────────

const EARTH_RADIUS_KM = 6371;

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const aVal =
    sinDLat * sinDLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinDLng * sinDLng;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(aVal));
}

type FilterReason =
  | 'invalid_bounds'
  | 'retrograde_timestamp'
  | 'below_min_distance'
  | 'jump_detected'
  | 'speed_exceeded';

/** Validates a GPS point against physical plausibility rules.
 *  Returns { valid: true } or { valid: false, reason } — never throws. */
export function validateGPSPoint(
  current: TaxiLocationSnapshot,
  previous?: TaxiLocationSnapshot | null,
): { valid: true } | { valid: false; reason: FilterReason } {
  // Hard bounds
  if (
    current.lat < -90 || current.lat > 90 ||
    current.lng < -180 || current.lng > 180
  ) {
    return { valid: false, reason: 'invalid_bounds' };
  }

  if (!previous) return { valid: true };

  // Retrograde / duplicate timestamp
  if (current.timestamp <= previous.timestamp) {
    return { valid: false, reason: 'retrograde_timestamp' };
  }

  const distKm = haversineKm(previous, current);
  const deltaSec = (current.timestamp - previous.timestamp) / 1000;

  // Ignore sub-5m movement (GPS drift while stationary)
  if (distKm < 0.005) {
    return { valid: false, reason: 'below_min_distance' };
  }

  // Hard jump: > 50 km in < 60 s — almost certainly a GPS glitch
  if (distKm > 50 && deltaSec < 60) {
    return { valid: false, reason: 'jump_detected' };
  }

  // Speed cap: 120 km/h (Marrakech urban/periurban limit)
  const speedKmh = (distKm / deltaSec) * 3600;
  if (speedKmh > 120) {
    return { valid: false, reason: 'speed_exceeded' };
  }

  return { valid: true };
}

// ── CRUD helpers ──────────────────────────────────────────────────────────────

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
