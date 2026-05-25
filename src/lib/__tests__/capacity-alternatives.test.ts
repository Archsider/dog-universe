import { describe, it, expect } from 'vitest';
import {
  searchAlternativeWindows,
  type OccupancyLookup,
  type FindAlternativesArgs,
} from '@/lib/capacity-alternatives';

// Requested window: 2026-06-10 → 2026-06-13 (3 nights). Noon-UTC anchors keep
// every shifted window comfortably mid-day in Casa (UTC+1), so casablancaYMD
// never crosses a day boundary.
const REQ_START = new Date('2026-06-10T11:00:00Z');
const REQ_END = new Date('2026-06-13T11:00:00Z');
const FAR_PAST = new Date('2026-01-01T00:00:00Z'); // never skips on the "past" rule

function baseArgs(over: Partial<FindAlternativesArgs> = {}): FindAlternativesArgs {
  return {
    newDogs: 2,
    newCats: 0,
    startDate: REQ_START,
    endDate: REQ_END,
    limits: { dogs: 5, cats: 3 },
    earliestStart: FAR_PAST,
    ...over,
  };
}

/** Occupancy keyed by `${species}:${startYmd}`; missing → 0 (empty). */
function lookupFrom(map: Record<string, number>): OccupancyLookup {
  return async (species, window) => {
    const d = window.startDate;
    const ymd = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    return map[`${species}:${ymd}`] ?? 0;
  };
}

describe('searchAlternativeWindows', () => {
  it('returns the nearest fitting window and preserves the stay duration', async () => {
    // +1 and -1 are full for dogs; +2 is the first that fits.
    const lookup = lookupFrom({
      'DOG:2026-06-11': 4, // avail 1 < 2 needed
      'DOG:2026-06-09': 4,
      'DOG:2026-06-12': 0, // avail 5 ≥ 2 → fits
    });
    const out = await searchAlternativeWindows(baseArgs(), lookup);
    expect(out[0]).toEqual({ startYmd: '2026-06-12', endYmd: '2026-06-15', offsetDays: 2 });
  });

  it('orders by proximity, preferring the later window on ties (+k before -k)', async () => {
    // Everything is empty → both +1 and -1 fit; +1 must come first.
    const out = await searchAlternativeWindows(baseArgs({ count: 2 }), lookupFrom({}));
    expect(out.map((w) => w.offsetDays)).toEqual([1, -1]);
  });

  it('respects the requested count', async () => {
    const out = await searchAlternativeWindows(baseArgs({ count: 3 }), lookupFrom({}));
    expect(out).toHaveLength(3);
    expect(out.map((w) => w.offsetDays)).toEqual([1, -1, 2]);
  });

  it('never suggests a window starting before earliestStart', async () => {
    // earliest = requested start → all negative offsets are in the past.
    const out = await searchAlternativeWindows(
      baseArgs({ count: 3, earliestStart: REQ_START }),
      lookupFrom({}),
    );
    expect(out.every((w) => w.offsetDays > 0)).toBe(true);
    expect(out.map((w) => w.offsetDays)).toEqual([1, 2, 3]);
  });

  it('requires BOTH species to fit in the same window', async () => {
    // +1: dogs fit but cats full → skip. +2: both fit.
    const lookup = lookupFrom({
      'CAT:2026-06-11': 3, // cats full (limit 3) → +1 rejected
    });
    const out = await searchAlternativeWindows(
      baseArgs({ newDogs: 1, newCats: 1, count: 1 }),
      lookup,
    );
    expect(out).toHaveLength(1);
    expect(out[0].offsetDays).not.toBe(1);
  });

  it('returns nothing when no window within the radius fits', async () => {
    // Dogs full everywhere.
    const alwaysFull: OccupancyLookup = async () => 5;
    const out = await searchAlternativeWindows(baseArgs({ searchRadiusDays: 5 }), alwaysFull);
    expect(out).toEqual([]);
  });

  it('short-circuits on degenerate input', async () => {
    const lookup = lookupFrom({});
    expect(await searchAlternativeWindows(baseArgs({ count: 0 }), lookup)).toEqual([]);
    expect(await searchAlternativeWindows(baseArgs({ endDate: REQ_START }), lookup)).toEqual([]);
    expect(await searchAlternativeWindows(baseArgs({ newDogs: 0, newCats: 0 }), lookup)).toEqual([]);
  });

  it('only queries the species that are actually requested', async () => {
    const seen: string[] = [];
    const lookup: OccupancyLookup = async (species) => {
      seen.push(species);
      return 0;
    };
    await searchAlternativeWindows(baseArgs({ newDogs: 2, newCats: 0, count: 1 }), lookup);
    expect(seen).toContain('DOG');
    expect(seen).not.toContain('CAT');
  });
});
