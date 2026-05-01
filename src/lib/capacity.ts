// Capacity management — prevents over-bookings beyond physical pension limits.
// Counts active boarding bookings overlapping a date range, by species.
// Accepts an optional Prisma client/tx so reads stay consistent inside a
// $transaction({ isolationLevel: Serializable }) block.
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { cacheReadThrough, cacheDel, CacheKeys, CacheTTL } from '@/lib/cache';
import * as Sentry from '@sentry/nextjs';

type PrismaClientLike = typeof prisma | Prisma.TransactionClient;

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
// WAITLIST is intentionally NOT included — waitlisted bookings are reservations
// of *intent*, not of a slot.
const ACTIVE_STATUSES = ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] as const;

async function readLimitsFromDb(client: PrismaClientLike): Promise<CapacityLimits> {
  return Sentry.startSpan(
    { name: 'capacity.getCapacityLimits', op: 'db' },
    async () => {
      try {
        const rows = await client.setting.findMany({
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
    },
  );
}

// When called inside a $transaction (client !== prisma), MUST read from DB so
// the limits participate in the same Serializable snapshot as the booking
// insert. Outside a tx, reads go through the 5-min Redis cache.
export async function getCapacityLimits(client: PrismaClientLike = prisma): Promise<CapacityLimits> {
  if (client !== prisma) return readLimitsFromDb(client);
  return cacheReadThrough<CapacityLimits>(
    CacheKeys.capacityLimits(),
    CacheTTL.capacityLimits,
    () => readLimitsFromDb(prisma),
  );
}

/** Invalidate after any update to `capacity_dog` / `capacity_cat` settings. */
export async function invalidateCapacityCache(): Promise<void> {
  await cacheDel(CacheKeys.capacityLimits());
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
  options: { excludeBookingId?: string; client?: PrismaClientLike } = {},
): Promise<number> {
  if (!window.endDate) return 0;
  const client = options.client ?? prisma;

  return Sentry.startSpan(
    { name: 'capacity.countOverlappingPets', op: 'db' },
    async () => {
      const overlapping = await client.booking.findMany({
        where: {
          serviceType: 'BOARDING',
          status: { in: [...ACTIVE_STATUSES] },
          deletedAt: null, // soft-delete: required — no global extension (Edge Runtime incompatible)
          startDate: { lte: window.endDate! },
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
    },
  );
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
// Pass `client` (a Prisma TX) when calling from inside $transaction so reads
// participate in the same serializable snapshot as the booking insert.
export async function checkBoardingCapacity(
  args: CapacityCheckArgs,
  client: PrismaClientLike = prisma,
): Promise<CapacityCheckResult> {
  if (!args.endDate) return { ok: true };

  return Sentry.startSpan(
    { name: 'capacity.checkBoardingCapacity', op: 'db' },
    async () => {
      const pets = await client.pet.findMany({
        where: { id: { in: args.petIds } },
        select: { species: true },
      });
      const newDogs = pets.filter((p) => p.species === 'DOG').length;
      const newCats = pets.filter((p) => p.species === 'CAT').length;

      if (newDogs === 0 && newCats === 0) return { ok: true };

      const limits = await getCapacityLimits(client);

      if (newDogs > 0) {
        const currentDogs = await countOverlappingPets(
          'DOG',
          { startDate: args.startDate, endDate: args.endDate },
          { excludeBookingId: args.excludeBookingId, client },
        );
        const available = Math.max(0, limits.dogs - currentDogs);
        if (newDogs > available) {
          return { ok: false, species: 'DOG', available, requested: newDogs, limit: limits.dogs };
        }
      }

      if (newCats > 0) {
        const currentCats = await countOverlappingPets(
          'CAT',
          { startDate: args.startDate, endDate: args.endDate },
          { excludeBookingId: args.excludeBookingId, client },
        );
        const available = Math.max(0, limits.cats - currentCats);
        if (newCats > available) {
          return { ok: false, species: 'CAT', available, requested: newCats, limit: limits.cats };
        }
      }

      return { ok: true };
    },
  );
}
