import { describe, it, expect } from 'vitest';
import {
  shouldCountFix,
  recomputeDistance,
  GPS_FILTER,
  type ReplayPoint,
} from '../taxi-gps-filter';

// Helper: build a baseline "good" fix that passes every gate. Tests then
// flip ONE field to assert that gate (and only that gate) rejects.
function baseline() {
  return {
    deltaKm: 0.1, // 100 m
    dtSec: 3,
    accuracyMeters: 10,
  };
}

describe('shouldCountFix — hard rejects (not stored)', () => {
  it('rejects fixes with accuracy > 50 m', () => {
    const d = shouldCountFix({ ...baseline(), accuracyMeters: 100 });
    expect(d.countTowardDistance).toBe(false);
    expect(d.store).toBe(false);
    expect(d.reason).toBe('low_accuracy');
  });

  it('rejects teleports > 200 km/h', () => {
    // 10 km in 1 s = 36 000 km/h
    const d = shouldCountFix({ deltaKm: 10, dtSec: 1, accuracyMeters: 10 });
    expect(d.store).toBe(false);
    expect(d.reason).toBe('speed_outlier');
  });

  it('accepts null accuracy (unknown — do not reject)', () => {
    const d = shouldCountFix({ ...baseline(), accuracyMeters: null });
    expect(d.countTowardDistance).toBe(true);
    expect(d.reason).toBeNull();
  });
});

describe('shouldCountFix — soft rejects (stored, not counted)', () => {
  it('rejects when dtSec < MIN_TIME_DELTA_SECONDS', () => {
    // Use a small delta so the implied speed stays under the 200 km/h cap
    // (we want the time gate to fire, not the speed_outlier hard reject).
    const d = shouldCountFix({ deltaKm: 0.020, dtSec: 0.5, accuracyMeters: 10 });
    expect(d.countTowardDistance).toBe(false);
    expect(d.store).toBe(true);
    expect(d.reason).toBe('time_too_close');
  });

  it('rejects when delta < MIN_DELTA_KM (drift jitter)', () => {
    // 15 m of drift while stopped at a red light
    const d = shouldCountFix({ deltaKm: 0.015, dtSec: 3, accuracyMeters: 10 });
    expect(d.store).toBe(true);
    expect(d.countTowardDistance).toBe(false);
    expect(d.reason).toBe('delta_too_small');
  });

  it('rejects when computed speed < MIN_SPEED_KMH (crawling)', () => {
    // 40 m in 60 s = 2.4 km/h (below 3 km/h threshold)
    const d = shouldCountFix({ deltaKm: 0.04, dtSec: 60, accuracyMeters: 10 });
    expect(d.store).toBe(true);
    expect(d.reason).toBe('speed_too_low');
  });

  it('rejects when delta > MAX_DELTA_KM (urban canyon jump)', () => {
    // 2.5 km in 60 s — under the speed cap but a single fix this big
    // is almost certainly a GPS jump. dtSec=60 → speed = 150 km/h (below
    // MAX_SPEED_KMH=200), so this exercises the delta-cap defence.
    const d = shouldCountFix({ deltaKm: 2.5, dtSec: 60, accuracyMeters: 10 });
    expect(d.store).toBe(true);
    expect(d.reason).toBe('delta_too_large');
  });
});

describe('shouldCountFix — happy path', () => {
  it('counts a normal city driving fix', () => {
    // 100 m in 10 s = 36 km/h
    const d = shouldCountFix({ deltaKm: 0.1, dtSec: 10, accuracyMeters: 8 });
    expect(d.countTowardDistance).toBe(true);
    expect(d.store).toBe(true);
    expect(d.reason).toBeNull();
    expect(d.speedKmh).toBeCloseTo(36, 0);
  });

  it('counts a fix at exactly the MIN_DELTA_KM threshold', () => {
    const d = shouldCountFix({
      deltaKm: GPS_FILTER.MIN_DELTA_KM,
      dtSec: 3,
      accuracyMeters: 10,
    });
    expect(d.countTowardDistance).toBe(true);
  });
});

describe('shouldCountFix — gate ordering', () => {
  // The order matters: low_accuracy beats speed_outlier beats time gates.
  // If a fix would fail multiple gates, the first one in the cascade wins.
  it('low_accuracy beats speed_outlier', () => {
    const d = shouldCountFix({ deltaKm: 10, dtSec: 1, accuracyMeters: 1000 });
    expect(d.reason).toBe('low_accuracy');
  });

  it('speed_outlier beats time_too_close', () => {
    const d = shouldCountFix({ deltaKm: 10, dtSec: 0.5, accuracyMeters: 10 });
    expect(d.reason).toBe('speed_outlier');
  });
});

describe('recomputeDistance — replay', () => {
  // Generates a sequence of points along a straight line. `metersPerStep`
  // controls how far each consecutive pair moves (in meters).
  function lineOfPoints(count: number, metersPerStep: number, secPerStep = 3): ReplayPoint[] {
    const points: ReplayPoint[] = [];
    const latPerMeter = 1 / 111_320; // ≈ degrees per meter at the equator
    const startTime = Date.now();
    for (let i = 0; i < count; i++) {
      points.push({
        latitude: i * metersPerStep * latPerMeter,
        longitude: 0,
        accuracy: 10,
        createdAt: new Date(startTime + i * secPerStep * 1000),
      });
    }
    return points;
  }

  it('returns 0 km for an empty or single-point trip', () => {
    expect(recomputeDistance([]).distanceKm).toBe(0);
    expect(recomputeDistance(lineOfPoints(1, 100)).distanceKm).toBe(0);
  });

  it('accumulates clean 100 m steps', () => {
    // 10 points × 100 m = 900 m (9 deltas)
    const points = lineOfPoints(10, 100, 10); // 10 s/step → 36 km/h
    const result = recomputeDistance(points);
    expect(result.pairsEvaluated).toBe(9);
    expect(result.pairsCounted).toBe(9);
    expect(result.distanceKm).toBeCloseTo(0.9, 2);
  });

  it('rejects drift (10 m / 3 s) but counts movement', () => {
    // Simulate a real ride: 5 clean 100 m steps, then 5 drift steps of 10 m
    // (below MIN_DELTA_KM). Expected: 0.4 km, not 0.5 km — the drift is
    // filtered out exactly the way the live ingestion would do it.
    const clean = lineOfPoints(5, 100, 10);
    // Append drift starting from the last clean point
    const drift: ReplayPoint[] = [];
    const lastClean = clean[clean.length - 1];
    const latPerMeter = 1 / 111_320;
    const driftStart = lastClean.latitude;
    const baseTime = (lastClean.createdAt as Date).getTime();
    for (let i = 1; i <= 5; i++) {
      drift.push({
        latitude: driftStart + i * 10 * latPerMeter,
        longitude: 0,
        accuracy: 10,
        createdAt: new Date(baseTime + i * 3_000),
      });
    }
    const points = [...clean, ...drift];
    const result = recomputeDistance(points);
    expect(result.distanceKm).toBeCloseTo(0.4, 2);
    expect(result.rejectedByReason.delta_too_small).toBe(5);
    expect(result.pairsCounted).toBe(4);
  });

  it('rejects low-accuracy fixes entirely', () => {
    const points = lineOfPoints(3, 100, 10);
    points[1].accuracy = 500; // middle fix is garbage
    const result = recomputeDistance(points);
    expect(result.rejectedByReason.low_accuracy).toBe(1);
    // First→bad pair rejected (low_accuracy on `curr`), bad→last pair counted
    // because `curr.accuracy` is what we check.
    expect(result.pairsCounted).toBe(1);
  });

  it('rounds to 3 decimals (1 m precision)', () => {
    const points = lineOfPoints(3, 100, 10);
    const result = recomputeDistance(points);
    // Just assert it doesn't have spurious trailing digits
    expect(Number.isFinite(result.distanceKm)).toBe(true);
    expect(result.distanceKm.toString().split('.')[1]?.length ?? 0).toBeLessThanOrEqual(3);
  });

  it('reproduces the bug it was built to fix — 30 min of drift inflates fake distance', () => {
    // Before the filter: 30 min × 1 fix/s × 12 m drift = 21.6 km of pure
    // noise. After the filter (delta_too_small dominates): 0 km.
    const points: ReplayPoint[] = [];
    const latPerMeter = 1 / 111_320;
    const startTime = Date.now();
    for (let i = 0; i < 60 * 30; i++) {
      // Random-ish ±12 m jitter around a single point
      const jitter = ((i * 7) % 25) - 12;
      points.push({
        latitude: jitter * latPerMeter,
        longitude: 0,
        accuracy: 10,
        createdAt: new Date(startTime + i * 1_000),
      });
    }
    const result = recomputeDistance(points);
    expect(result.distanceKm).toBe(0);
    expect(result.pairsCounted).toBe(0);
  });
});
