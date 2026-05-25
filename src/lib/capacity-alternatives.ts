// "Nearest available dates" engine — when a BOARDING window is full, find the
// closest alternative windows (same duration) that DO fit the requested pets.
//
// Pure + dependency-injected: the occupancy lookup is passed in, so the core
// search is unit-testable without Prisma. `findBoardingAlternatives` binds it
// to the live `countOverlappingPets` for callers.
//
// Morocco runs on a fixed UTC+1 (no DST), so date-only math adds whole days as
// 86_400_000 ms safely (same convention as src/lib/dates-casablanca.ts).

import { countOverlappingPets, type CapacityLimits } from '@/lib/capacity';
import { casablancaYMD, startOfTodayCasa } from '@/lib/dates-casablanca';

const DAY_MS = 86_400_000;

export interface AlternativeWindow {
  /** Casa calendar start date, YYYY-MM-DD. */
  startYmd: string;
  /** Casa calendar end date, YYYY-MM-DD. */
  endYmd: string;
  /** Signed shift vs the requested start: negative = earlier, positive = later. */
  offsetDays: number;
}

export interface FindAlternativesArgs {
  newDogs: number;
  newCats: number;
  /** Requested (closed-range) window. */
  startDate: Date;
  endDate: Date;
  limits: CapacityLimits;
  /** How many alternatives to return (default 3). */
  count?: number;
  /** How many days before/after the requested start to scan (default 14). */
  searchRadiusDays?: number;
  /** Earliest allowed start (Casa midnight). Defaults to today (Casa) — we
   *  never suggest a window starting in the past. */
  earliestStart?: Date;
}

/** Occupancy lookup: pets of `species` already booked over `window`. */
export type OccupancyLookup = (
  species: 'DOG' | 'CAT',
  window: { startDate: Date; endDate: Date },
) => Promise<number>;

function ymd(date: Date): string {
  const { year, month, day } = casablancaYMD(date);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Candidate offsets ordered by proximity to the requested dates. Within the
 * same distance we surface the LATER window first (`+k` before `-k`):
 * delaying a stay is usually more feasible for an owner than bringing it
 * forward, and an earlier window is more likely to fall before `earliestStart`.
 */
function orderedOffsets(radius: number): number[] {
  const out: number[] = [];
  for (let k = 1; k <= radius; k++) {
    out.push(k, -k);
  }
  return out;
}

/**
 * Core search (pure). Scans windows of the SAME duration shifted ±radius days
 * and returns up to `count` that fit both species, nearest-first.
 */
export async function searchAlternativeWindows(
  args: FindAlternativesArgs,
  lookup: OccupancyLookup,
): Promise<AlternativeWindow[]> {
  const count = args.count ?? 3;
  const radius = args.searchRadiusDays ?? 14;
  const earliest = args.earliestStart ?? startOfTodayCasa();
  const durationMs = args.endDate.getTime() - args.startDate.getTime();

  // Nothing to place, or a degenerate window → no suggestions.
  if (count <= 0 || durationMs <= 0 || (args.newDogs <= 0 && args.newCats <= 0)) {
    return [];
  }

  const results: AlternativeWindow[] = [];

  for (const offset of orderedOffsets(radius)) {
    const candidateStart = new Date(args.startDate.getTime() + offset * DAY_MS);
    if (candidateStart.getTime() < earliest.getTime()) continue; // never suggest the past
    const candidateEnd = new Date(candidateStart.getTime() + durationMs);
    const window = { startDate: candidateStart, endDate: candidateEnd };

    if (args.newDogs > 0) {
      const dogsThere = await lookup('DOG', window);
      if (args.newDogs > args.limits.dogs - dogsThere) continue;
    }
    if (args.newCats > 0) {
      const catsThere = await lookup('CAT', window);
      if (args.newCats > args.limits.cats - catsThere) continue;
    }

    results.push({ startYmd: ymd(candidateStart), endYmd: ymd(candidateEnd), offsetDays: offset });
    if (results.length >= count) break;
  }

  return results;
}

/**
 * Live binding: searches alternatives using the real overlap counter.
 * Safe to call on the rejection path (outside any transaction).
 */
export function findBoardingAlternatives(
  args: FindAlternativesArgs,
): Promise<AlternativeWindow[]> {
  return searchAlternativeWindows(args, (species, window) =>
    countOverlappingPets(species, window),
  );
}
