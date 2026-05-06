// OSRM (Open Source Routing Machine) helper — public demo server.
//
// Returns a routed driving ETA + encoded polyline geometry between two
// GPS points. Used by the taxi tracking SSE stream and the public
// tracking REST endpoint to display a route preview and an ETA banner.
//
// IMPORTANT: this helper uses fetch + setTimeout, both available in Node
// AND Edge runtimes. However the SSE stream and tracking endpoints run on
// Node (`maxDuration` set), so we don't gate runtime here.
//
// Fail-mode: any error (network, OSRM down, timeout, malformed JSON) →
// returns null. Callers should treat null as "no ETA available" and not
// surface an error to the end user.
//
// Caching: a 30s in-memory Map<key, { data, expiresAt }> avoids hammering
// OSRM on near-identical positions (the SSE stream calls every 30s while
// the heartbeat updates every few seconds). Key = rounded coords (4 dec
// ≈ 11 m precision).

const OSRM_BASE = 'https://router.project-osrm.org';
const TIMEOUT_MS = 4_000;
const CACHE_TTL_MS = 30_000;

export interface EtaResult {
  durationSec: number;
  distanceM: number;
  /** Encoded polyline (precision 5) describing the suggested driving route. */
  geometry: string;
}

interface CacheEntry {
  data: EtaResult | null;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function cacheKey(lat1: number, lng1: number, lat2: number, lng2: number): string {
  const r = (n: number) => n.toFixed(4);
  return `${r(lat1)},${r(lng1)}|${r(lat2)},${r(lng2)}`;
}

/**
 * Fetch a driving ETA + route geometry between two GPS points. Returns
 * null on any failure (network, timeout, OSRM down, parse error, no
 * route). Results cached in-memory for 30 s.
 */
export async function getEta(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): Promise<EtaResult | null> {
  const key = cacheKey(lat1, lng1, lat2, lng2);
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) {
    return hit.data;
  }

  const url = `${OSRM_BASE}/route/v1/driving/${lng1},${lat1};${lng2},${lat2}?overview=full&geometries=polyline`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      cache.set(key, { data: null, expiresAt: now + CACHE_TTL_MS });
      return null;
    }
    const json = (await res.json()) as {
      code?: string;
      routes?: Array<{ duration?: number; distance?: number; geometry?: string }>;
    };
    if (json.code !== 'Ok' || !json.routes || json.routes.length === 0) {
      cache.set(key, { data: null, expiresAt: now + CACHE_TTL_MS });
      return null;
    }
    const r = json.routes[0];
    if (
      typeof r.duration !== 'number' ||
      typeof r.distance !== 'number' ||
      typeof r.geometry !== 'string'
    ) {
      cache.set(key, { data: null, expiresAt: now + CACHE_TTL_MS });
      return null;
    }
    const data: EtaResult = {
      durationSec: Math.round(r.duration),
      distanceM: Math.round(r.distance),
      geometry: r.geometry,
    };
    cache.set(key, { data, expiresAt: now + CACHE_TTL_MS });
    return data;
  } catch (err) {
    console.error(JSON.stringify({
      level: 'error',
      service: 'osrm',
      message: 'getEta failed',
      error: err instanceof Error ? err.message : String(err),
      timestamp: new Date().toISOString(),
    }));
    cache.set(key, { data: null, expiresAt: now + CACHE_TTL_MS });
    return null;
  } finally {
    clearTimeout(timer);
  }
}
