// Capacity management — prevents over-bookings beyond physical pension limits.
// Counts active boarding bookings overlapping a date range, by species.
// Accepts an optional Prisma client/tx so reads stay consistent inside a
// $transaction({ isolationLevel: Serializable }) block.
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { Redis } from '@upstash/redis';
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

// ── Redis cache helpers ───────────────────────────────────────────────────────

let _redis: Redis | null | undefined;

function getRedis(): Redis | null {
  if (_redis !== undefined) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) { _redis = null; return null; }
  _redis = new Redis({ url, token });
  return _redis;
}

const CACHE_KEY = 'cache:capacity:limits';
const CACHE_TTL = 300; // 5 minutes

/** Invalidates the capacity limits cache. Call after admin saves capacity settings. */
export async function invalidateCapacityCache(): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(CACHE_KEY);
  } catch {
    // Non-critical — cache will expire naturally
  }
}

// ── Core functions ────────────────────────────────────────────────────────────

export async function getCapacityLimits(client: PrismaClientLike = prisma): Promise<CapacityLimits> {
  // Only cache when using the default singleton (not inside a transaction snapshot)
  if (client === prisma) {
    const redis = getRedis();
    if (redis) {
      try {
        const cached = await redis.get<CapacityLimits | string>(CACHE_KEY);
        if (cached != null) {
          const parsed = typeof cached === 'string'
            ? (JSON.parse(cached) as CapacityLimits)
            : cached;
          if (typeof parsed?.dogs === 'number' && typeof parsed?.cats === 'number') {
            return parsed;
          }
        }
      } catch {
        // Redis down — fall through to DB
      }
    }
  }

  try {
    const limits = await Sentry.startSpan(
      { name: 'capacity.getCapacityLimits', op: 'db' },
      async () => {
        const rows = await client.setting.findMany({
          where: { key: { in: ['capacity_dog', 'capacity_cat'] } },
        });
        const map = Object.fromEntries(rows.map((r) => [r.key, parseInt(r.value, 10)]));
        return {
          dogs: Number.isFinite(map.capacity_dog) ? map.capacity_dog : DEFAULT_LIMITS.dogs,
          cats: Number.isFinite(map.capacity_cat) ? map.capacity_cat : DEFAULT_LIMITS.cats,
        };
      },
    );

    // Warm cache (best-effort, only outside transactions)
    if (client === prisma) {
      const redis = getRedis();
      if (redis) {
        redis.set(CACHE_KEY, JSON.stringify(limits), { ex: CACHE_TTL }).catch(() => {});
      }
    }

    return limits;
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
