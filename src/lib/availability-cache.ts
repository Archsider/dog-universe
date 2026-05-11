// Invalidation helper for the `availability:{species}:{month}` Redis cache
// populated by GET /api/availability (TTL 5 min). Every booking mutation
// whose status is — or was — in {PENDING, CONFIRMED, IN_PROGRESS,
// PENDING_EXTENSION} or whose dates moved must call this so the public
// availability calendar reflects the new occupancy before the TTL expires.
//
// Fail-open: `cacheDel` already swallows Redis errors; the wrapper adds a
// final try/catch so a malformed Date can never break the caller mutation.
//
// We don't carry the species cheaply at every call-site, so we delete both
// DOG and CAT keys for every YYYY-MM month covered by
// [startDate, endDate || startDate].

import { cacheDel } from '@/lib/cache';

function monthKey(d: Date): string {
  // YYYY-MM in UTC. GET /api/availability builds the cache key from a
  // querystring `YYYY-MM` (no timezone) so we keep the same UTC frame here.
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

function monthsCovered(start: Date, end: Date): string[] {
  const months = new Set<string>();
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const stop = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  // Safety guard against pathological input: max 240 iterations = 20 years.
  let safety = 240;
  while (cursor.getTime() <= stop.getTime() && safety-- > 0) {
    months.add(monthKey(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return [...months];
}

/**
 * Invalidate `availability:DOG:{month}` and `availability:CAT:{month}` for
 * every month covered by [startDate, endDate]. Best-effort, fail-open.
 */
export async function invalidateAvailabilityCache(
  startDate: Date,
  endDate: Date | null,
): Promise<void> {
  try {
    if (!startDate || Number.isNaN(startDate.getTime())) return;
    const end = endDate && !Number.isNaN(endDate.getTime()) ? endDate : startDate;
    const lo = startDate;
    const hi = end.getTime() < startDate.getTime() ? startDate : end;

    const months = monthsCovered(lo, hi);
    await Promise.all(
      months.flatMap((m) => [
        cacheDel(`availability:DOG:${m}`),
        cacheDel(`availability:CAT:${m}`),
      ]),
    );
  } catch {
    // Cache invalidation must never break a booking mutation.
  }
}
