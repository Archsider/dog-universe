# ADR-0006 — GPS distance filter for Pet Taxi tracking

**Status:** Accepted
**Date:** 2026-05-14
**Deciders:** solo founder

## Context

The Pet Taxi feature lets the driver share live GPS so the client can
watch the ride on a map. Each fix is also accumulated into
`TaxiTrip.distanceKm`, which we display on the trip detail and use for
post-trip reporting.

On 2026-05-14, a real ~5 km city ride logged **64.4 km**. Investigation
identified three independent root causes that combine to inflate the
total by ~13×:

1. **Web Geolocation has no built-in distance filter.** The browser
   `watchPosition` API fires whenever it has a new fix — roughly once a
   second on modern phones. We had passed `{ distanceFilter: 5 }`, which
   only exists in the React Native API; web silently ignores unknown
   options. We were getting ~60 fixes per minute regardless.
2. **GPS drift at standstill is 8–15 m.** At a red light or during the
   pickup/dropoff procedure, consecutive fixes can sit 12 m apart even
   though the vehicle hasn't moved. With 60 fixes per minute, that's
   720 m of fake "movement" per minute of standstill.
3. **The server threshold was too loose.** The previous filter was
   `if (deltaKm >= 0.010) accumulate` — 10 m, well below the drift
   amplitude. Every drift jitter passed through.

A 5 km trip with 30 min of total standing-still time (pickup + traffic
+ dropoff): `30 × 720 m = 21.6 km` of pure noise. Add a few GPS jumps
(urban canyon, tunnel exit) and you reach 60+ km. **The number was
~13× the real distance, not a percentage drift.**

## Decision

**We will run every GPS fix through a single dedicated filter
(`src/lib/taxi-gps-filter.ts`) used by both live ingestion and
retroactive replay.**

```ts
shouldCountFix({ deltaKm, dtSec, accuracyMeters })
  → { countTowardDistance, store, reason, speedKmh }
```

The function checks 6 gates, in this order:

| Gate                       | Threshold                  | Behaviour       |
| -------------------------- | -------------------------- | --------------- |
| `low_accuracy`             | accuracy > 50 m            | drop (no store) |
| `speed_outlier`            | implied speed > 200 km/h   | drop (no store) |
| `time_too_close`           | dtSec < 1.5 s              | store, don't count |
| `delta_too_large`          | delta > 2 km in one fix    | store, don't count |
| `delta_too_small`          | delta < 30 m               | store, don't count |
| `speed_too_low`            | implied speed < 3 km/h     | store, don't count |

Two outputs (`countTowardDistance` and `store`) on purpose. A fix at a
red light still goes into `TaxiLocation` so the map shows the marker;
it just doesn't inflate `distanceKm`.

The client throttles network pushes at one POST per 3 seconds
(`PUSH_MIN_INTERVAL_MS`). The 30 s forced-ping (server keepalive) and
the initial fix bypass the throttle via a `force=true` flag.

For trips logged before this filter shipped, we expose `POST
/api/admin/taxi-trips/[id]/recompute-distance`, which replays every
stored `TaxiLocation` row through the same `shouldCountFix()` and
writes back the corrected `distanceKm`. Admin-only, idempotent.

## Consequences

**Easier:**
- One source of truth — same code path live and retroactively, so
  "how did the GPS decide this?" has exactly one answer.
- The constants (`GPS_FILTER`) are tuned together. Changing one in
  isolation is now visibly suspicious (in the same file, beside its
  neighbours) instead of buried 5 levels deep in a route handler.
- Per-trip rejection stats (`rejectedByReason`) are surfaced to logs
  and the recompute response, so anomalies are diagnosable from the
  Sentry breadcrumbs of one trip rather than a forensic dive.
- Throttling on the client cuts Lambda invocations by ~3× during
  active driving (60/min → 20/min on the network).

**Harder:**
- The thresholds are tuned for urban Moroccan driving (slow walking
  pace as the noise floor, 30 m as the smallest "real" movement). A
  different environment (rural highway with no GPS canyon) might want
  a tighter `MIN_DELTA_KM` and a higher `MIN_SPEED_KMH`. We accept this
  trade-off because the entire taxi product is currently
  city-of-Casablanca.
- Fixes that should geometrically count (slow lane-change at 4 km/h)
  are dropped. We accept this because the alternative (counting drift)
  is materially worse for the headline metric.

**Trade-off accepted:** under-reporting by 1–2% of real movement is
infinitely better than over-reporting by 1000% of drift.

## Alternatives considered

- **Use the device's reported `coords.speed` instead of computing
  speed from `deltaKm/dtSec`** — rejected. `GeolocationCoordinates.speed`
  is unreliable on Android and frequently `null` on iOS Safari. The
  Haversine-derived speed is consistent across platforms.
- **Kalman filter** — rejected for now. Proper Kalman implementation
  for GPS is its own project (state vectors, process/measurement noise
  matrices, tuning). The 6-gate filter solves the actual symptom
  (drift accumulating as distance) without the maintenance cost. If we
  ever need to draw a smooth track polyline instead of a marker per
  fix, we'll revisit.
- **Server-side per-trip rate limiting only, no movement filter** —
  rejected. Throttling alone doesn't help: 1 push every 5 s during 30
  min of standstill still accumulates 360 fixes × 12 m drift = 4.3 km
  of fake distance. The drift problem is geometric, not frequency.
- **Run the filter only on read (compute distance on demand)** —
  rejected. We display `distanceKm` in real time on the admin
  dashboard during the ride; computing on every render across all
  stored points is wasteful. Accumulating at write-time with the
  filter is O(1) per fix.

## Constants reference

Defined in `src/lib/taxi-gps-filter.ts`:

```ts
GPS_FILTER = {
  MAX_ACCURACY_METERS: 50,    // urban-smartphone open-sky horizontal error
  MAX_SPEED_KMH: 200,         // sanity ceiling for a taxi
  MIN_DELTA_KM: 0.030,        // 30 m — above urban drift jitter
  MIN_SPEED_KMH: 3,           // slow walking pace
  MAX_DELTA_KM: 2.0,          // tunnel-exit / urban-canyon jump
  MIN_TIME_DELTA_SECONDS: 1.5,// consecutive fixes too close are unreliable
}
```

Changing any of these requires updating the tests in
`src/lib/__tests__/taxi-gps-filter.test.ts` and, if the change is
material, a follow-up note in this ADR.
