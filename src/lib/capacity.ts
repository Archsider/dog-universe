// Capacity management — prevents over-bookings beyond physical pension limits.
// Counts active boarding bookings overlapping a date range, by species.
import { prisma } from '@/lib/prisma';

export interface CapacityLimits {
  dogs: number;
  cats: number;
}

const DEFAULT_LIMITS: CapacityLimits = {
  dogs: 20,
  cats: 10,
};

// Statuses that consume capacity. PENDING included on purpose: even unconfirmed
// requests must reserve a slot to avoid the race where two clients book the
// same window before the admin validates either one.
const ACTIVE_STATUSES = ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] as const;

export async function getCapacityLimits(): Promise<CapacityLimits> {
  try {
    const rows = await prisma.setting.findMany({
      where: { key: { in: ['capacity_dog', 'capacity_cat'] } },
    });
    const map = Object.fromEntries(rows.map((r) => [r.key, parseInt(r.value, 10)]));
    return {
      dogs: Number.isFinite(map.capacity_dog) ? map.capacity_dog : DEFAULT_LIMITS.dogs,
      cats: Number.isFinite(map.capacity_cat) ? map.capacity_cat : DEFAULT_LIMITS.cats,
    };
  } catch {
    return { ...DEFAULT_LIMITS };
  }
}

export interface OccupancyWindow {
  startDate: Date;
  endDate: Date | null;
}

// Counts pets of a given species that are booked in BOARDING and overlap the
// requested window. Two bookings overlap when start <= other.end AND end >= other.start.
// A booking with no endDate (e.g. taxi) is excluded from boarding occupancy.
export async function countOverlappingPets(
  species: 'DOG' | 'CAT',
  window: OccupancyWindow,
  options: { excludeBookingId?: string } = {},
): Promise<number> {
  if (!window.endDate) return 0;

  const overlapping = await prisma.booking.findMany({
    where: {
      serviceType: 'BOARDING',
      status: { in: [...ACTIVE_STATUSES] },
      startDate: { lte: window.endDate },
      endDate: { gte: window.startDate, not: null },
      ...(options.excludeBookingId ? { id: { not: options.excludeBookingId } } : {}),
    },
    select: {
      bookingPets: {
        select: { pet: { select: { species: true } } },
      },
    },
  });

  let count = 0;
  for (const booking of overlapping) {
    for (const bp of booking.bookingPets) {
      if (bp.pet.species === species) count += 1;
    }
  }
  return count;
}

export type CapacityCheckOk = { ok: true };
export type CapacityCheckExceeded = {
  ok: false;
  species: 'DOG' | 'CAT';
  available: number;
  requested: number;
  limit: number;
};
export type CapacityCheckResult = CapacityCheckOk | CapacityCheckExceeded;

export interface CapacityCheckArgs {
  petIds: string[];
  startDate: Date;
  endDate: Date | null;
  excludeBookingId?: string;
}

// Returns ok or the first species that would be exceeded. Skips taxi-only
// bookings (no endDate) since they don't consume boarding capacity.
export async function checkBoardingCapacity(args: CapacityCheckArgs): Promise<CapacityCheckResult> {
  if (!args.endDate) return { ok: true };

  const pets = await prisma.pet.findMany({
    where: { id: { in: args.petIds } },
    select: { species: true },
  });
  const newDogs = pets.filter((p) => p.species === 'DOG').length;
  const newCats = pets.filter((p) => p.species === 'CAT').length;

  if (newDogs === 0 && newCats === 0) return { ok: true };

  const limits = await getCapacityLimits();

  if (newDogs > 0) {
    const currentDogs = await countOverlappingPets('DOG', { startDate: args.startDate, endDate: args.endDate }, { excludeBookingId: args.excludeBookingId });
    const available = Math.max(0, limits.dogs - currentDogs);
    if (newDogs > available) {
      return { ok: false, species: 'DOG', available, requested: newDogs, limit: limits.dogs };
    }
  }

  if (newCats > 0) {
    const currentCats = await countOverlappingPets('CAT', { startDate: args.startDate, endDate: args.endDate }, { excludeBookingId: args.excludeBookingId });
    const available = Math.max(0, limits.cats - currentCats);
    if (newCats > available) {
      return { ok: false, species: 'CAT', available, requested: newCats, limit: limits.cats };
    }
  }

  return { ok: true };
}
