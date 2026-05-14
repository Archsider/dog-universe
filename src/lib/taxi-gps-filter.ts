// GPS noise filter — the source of truth for "should this fix count toward
// the trip's distance?" Used by:
//   - POST /api/admin/taxi-trips/[id]/tracking (live ingestion)
//   - POST /api/admin/taxi-trips/[id]/recompute-distance (retroactive
//     correction for trips that grew fake distance before this filter
//     was tightened)
//
// Why a separate module:
//   1. Same code path live + replay → guaranteed identical behaviour
//   2. Pure functions, easy to unit test
//   3. The thresholds are tuned together; changing one without the others
//      shifts what counts as "movement" silently. Putting them in one
//      file forces co-evolution.
//
// ── The problem this solves ───────────────────────────────────────────────
// On 2026-05-14 a real ~5 km ride logged 64.4 km because the previous
// filter ("ignore if dist < 10 m") was too loose:
//
//   - Browser watchPosition fires ~1/second (the `distanceFilter: 5` we
//     had was an option from React Native, not Web Geolocation — silently
//     ignored).
//   - At standstill the GPS drift is 8-15 m between consecutive fixes.
//   - 10-15 m drift × 60 fixes/min × 30 min of stops ≈ 60 km of fake.
//
// The filter below stops this on five orthogonal axes (a fix must pass
// ALL of them to count toward distance — but it's still STORED so the
// map can show the marker, just not counted).

export const GPS_FILTER = {
  /** Reject GPS fixes where the device reports horizontal accuracy worse
   *  than this. 50 m matches what an open-sky urban smartphone GPS gives. */
  MAX_ACCURACY_METERS: 50,

  /** Reject "teleport" fixes (likely GPS firmware glitches). 200 km/h
   *  catches everything realistic in a taxi context. */
  MAX_SPEED_KMH: 200,

  /** Below this delta the noise dominates the signal. 30 m ≈ 2 s of
   *  driving at 50 km/h, well above urban GPS drift. */
  MIN_DELTA_KM: 0.030,

  /** Below this computed speed the taxi is standing still / crawling;
   *  the GPS drift dominates and any "distance" measured is fake.
   *  3 km/h = slow walking pace. */
  MIN_SPEED_KMH: 3,

  /** Above this delta in a single fix it's almost certainly a GPS jump
   *  (tunnel exit, urban canyon). 2 km in 3 s would be 2400 km/h — both
   *  speed and delta caps catch it, this one is defence-in-depth. */
  MAX_DELTA_KM: 2.0,

  /** Below this time interval consecutive fixes are unreliable for delta
   *  calculation — the GPS hasn't actually moved meaningfully, the noise
   *  ratio is too high. */
  MIN_TIME_DELTA_SECONDS: 1.5,
} as const;

/** Reasons a fix can be rejected/filtered. Useful for per-trip stats
 *  and structured Sentry breadcrumbs. */
export type FilterReason =
  | 'low_accuracy'
  | 'speed_outlier'
  | 'time_too_close'
  | 'delta_too_small'
  | 'speed_too_low'
  | 'delta_too_large';

export interface FilterInput {
  /** Distance to the previous accepted fix, in kilometres. */
  deltaKm: number;
  /** Seconds elapsed since the previous accepted fix. */
  dtSec: number;
  /** Device-reported accuracy in metres (null = unknown — DO NOT reject). */
  accuracyMeters: number | null;
}

export interface FilterDecision {
  /** Should the delta be added to the trip's cumulative distance? */
  countTowardDistance: boolean;
  /** Should the position itself be persisted (TaxiLocation row)? Always
   *  true unless the fix is clearly broken (low accuracy, teleport). */
  store: boolean;
  /** When the fix is filtered out, why. null = passed through. */
  reason: FilterReason | null;
  /** Speed implied by the delta (km/h). 0 when dtSec invalid. */
  speedKmh: number;
}

/**
 * Decide whether a single GPS fix should count toward the trip's
 * distance. Pure function — no side effects, easy to unit test.
 *
 * The two outputs (`countTowardDistance` and `store`) are independent:
 *
 *   - A fix can be STORED but not counted (e.g. taxi crawling at a red
 *     light → we want the marker on the map, but the 12 m of drift
 *     should not inflate distance).
 *   - A fix can be REJECTED entirely (e.g. accuracy = 500 m or GPS
 *     teleport — these are noise, drop them everywhere).
 */
export function shouldCountFix(input: FilterInput): FilterDecision {
  const { deltaKm, dtSec, accuracyMeters } = input;
  const speedKmh = dtSec > 0 ? (deltaKm / dtSec) * 3600 : 0;

  // ── Hard rejects (do not store either) ──────────────────────────────
  if (accuracyMeters !== null && accuracyMeters > GPS_FILTER.MAX_ACCURACY_METERS) {
    return { countTowardDistance: false, store: false, reason: 'low_accuracy', speedKmh };
  }
  if (speedKmh > GPS_FILTER.MAX_SPEED_KMH) {
    return { countTowardDistance: false, store: false, reason: 'speed_outlier', speedKmh };
  }

  // ── Soft rejects (store the position, don't count the delta) ────────
  if (dtSec < GPS_FILTER.MIN_TIME_DELTA_SECONDS) {
    return { countTowardDistance: false, store: true, reason: 'time_too_close', speedKmh };
  }
  if (deltaKm > GPS_FILTER.MAX_DELTA_KM) {
    return { countTowardDistance: false, store: true, reason: 'delta_too_large', speedKmh };
  }
  if (deltaKm < GPS_FILTER.MIN_DELTA_KM) {
    return { countTowardDistance: false, store: true, reason: 'delta_too_small', speedKmh };
  }
  if (speedKmh < GPS_FILTER.MIN_SPEED_KMH) {
    return { countTowardDistance: false, store: true, reason: 'speed_too_low', speedKmh };
  }

  // Passed all gates — count it.
  return { countTowardDistance: true, store: true, reason: null, speedKmh };
}

/**
 * Replay a list of TaxiLocation rows through the same filter to compute
 * the corrected distance. Used by the admin "Recompute distance" action
 * to fix trips that accumulated fake distance under the old loose filter.
 *
 * `points` MUST be in chronological order (oldest first). The function
 * walks pairwise and accumulates only deltas where `shouldCountFix`
 * returns `countTowardDistance: true`.
 */
export interface ReplayPoint {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  createdAt: Date | string;
}

export interface ReplayResult {
  distanceKm: number;
  /** Total pairs evaluated. */
  pairsEvaluated: number;
  /** Pairs where the delta was counted (vs filtered out). */
  pairsCounted: number;
  /** Reasons distribution — useful to surface in the admin UI. */
  rejectedByReason: Record<FilterReason, number>;
}

import { haversineKm } from '@/lib/taxi-location';

export function recomputeDistance(points: ReplayPoint[]): ReplayResult {
  const stats: ReplayResult = {
    distanceKm: 0,
    pairsEvaluated: 0,
    pairsCounted: 0,
    rejectedByReason: {
      low_accuracy: 0,
      speed_outlier: 0,
      time_too_close: 0,
      delta_too_small: 0,
      speed_too_low: 0,
      delta_too_large: 0,
    },
  };

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    stats.pairsEvaluated++;

    const deltaKm = haversineKm(
      prev.latitude,
      prev.longitude,
      curr.latitude,
      curr.longitude,
    );
    const prevTs = typeof prev.createdAt === 'string' ? Date.parse(prev.createdAt) : prev.createdAt.getTime();
    const currTs = typeof curr.createdAt === 'string' ? Date.parse(curr.createdAt) : curr.createdAt.getTime();
    const dtSec = Math.max(0.001, (currTs - prevTs) / 1000);

    const decision = shouldCountFix({
      deltaKm,
      dtSec,
      accuracyMeters: curr.accuracy,
    });

    if (decision.reason) {
      stats.rejectedByReason[decision.reason]++;
    }
    if (decision.countTowardDistance) {
      stats.distanceKm += deltaKm;
      stats.pairsCounted++;
    }
  }

  // Round to 3 decimals for storage friendliness (no need for more than 1 m precision).
  stats.distanceKm = Math.round(stats.distanceKm * 1000) / 1000;
  return stats;
}
