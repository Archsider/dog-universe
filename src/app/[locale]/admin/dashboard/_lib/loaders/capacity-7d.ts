import { getCapacityLimits, countOverlappingPets } from '@/lib/capacity';
import { nextSevenCasaDays } from '../helpers';
import type { SevenDayCapacitySnapshot } from '../shapes';

export async function loadCapacity7d(): Promise<SevenDayCapacitySnapshot> {
  const limits = await getCapacityLimits();
  const days = nextSevenCasaDays();
  // 14 lib calls (7 days × 2 species) in parallel — each hits the same
  // `Booking` index, the DB plan caches the join. Sub-100 ms aggregate
  // in practice on the prod dataset (~3k bookings).
  const counts = await Promise.all(
    days.flatMap((d) => [
      countOverlappingPets('DOG', { startDate: d.startUtc, endDate: d.endUtc }),
      countOverlappingPets('CAT', { startDate: d.startUtc, endDate: d.endUtc }),
    ]),
  );
  return {
    dogsLimit: limits.dogs,
    catsLimit: limits.cats,
    days: days.map((d, i) => ({
      ...d,
      dogsCount: counts[i * 2],
      catsCount: counts[i * 2 + 1],
    })),
  };
}
