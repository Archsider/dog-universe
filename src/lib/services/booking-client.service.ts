/**
 * Pure service helpers for client-facing booking creation.
 *
 * Extracted from `src/app/api/bookings/route.ts` POST handler. The HTTP layer
 * still owns request parsing, idempotency, pricing computation, auto-merge,
 * and post-commit notification fan-out — those are deeply coupled to
 * NextResponse / session / Sentry spans and don't translate cleanly to a
 * pure-function shape. This file owns the parts that DO translate cleanly:
 *
 *  - `validateTaxiSlot` / `validateBoardingTaxiAddons` — pure validators
 *    that throw `BookingError('SUNDAY_NOT_ALLOWED' | 'INVALID_TIME_SLOT')`.
 *  - `createBookingTx` — atomic Serializable transaction (capacity check +
 *    booking + service-detail + items). Throws `BookingError('CAPACITY_EXCEEDED')`
 *    when full and `waitlistFallback === false`.
 *  - `runWithSerializableRetry` — P2034 retry wrapper.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { checkBoardingCapacity, type CapacityCheckExceeded } from '@/lib/capacity';
import { BookingError } from './booking-errors';

// ────────────────────────────────────────────────────────────────────────────
// Pet Taxi slot validation
// ────────────────────────────────────────────────────────────────────────────

/**
 * Reject Sunday + slots outside 10h–17h. Throws BookingError.
 * Mirrors the inline validation in POST /api/bookings (PET_TAXI branch).
 */
export function validateTaxiSlot(args: {
  startDate: string | Date;
  arrivalTime?: string | null;
}): void {
  const taxiDate = new Date(args.startDate);
  if (taxiDate.getDay() === 0) {
    throw new BookingError('SUNDAY_NOT_ALLOWED');
  }
  let taxiHour: number | null = null;
  let taxiMinute = 0;
  if (args.arrivalTime && typeof args.arrivalTime === 'string') {
    const parts = args.arrivalTime.split(':').map(Number);
    taxiHour = parts[0] ?? null;
    taxiMinute = parts[1] ?? 0;
  } else {
    taxiHour = taxiDate.getHours();
    taxiMinute = taxiDate.getMinutes();
  }
  if (taxiHour !== null) {
    if (isNaN(taxiHour) || isNaN(taxiMinute)) {
      throw new BookingError('INVALID_TIME_SLOT');
    }
    const totalMinutes = taxiHour * 60 + taxiMinute;
    if (totalMinutes < 10 * 60 || totalMinutes > 17 * 60) {
      throw new BookingError('INVALID_TIME_SLOT');
    }
  }
}

/**
 * Validate go/return taxi addons attached to a BOARDING booking. Same Sunday
 * + 10h–17h rules as the standalone Pet Taxi service. Throws BookingError.
 */
export function validateBoardingTaxiAddons(args: {
  taxiGoEnabled?: boolean;
  taxiGoDate?: string | null;
  taxiGoTime?: string | null;
  taxiReturnEnabled?: boolean;
  taxiReturnDate?: string | null;
  taxiReturnTime?: string | null;
}): void {
  const checks = [
    { enabled: args.taxiGoEnabled, date: args.taxiGoDate, time: args.taxiGoTime },
    {
      enabled: args.taxiReturnEnabled,
      date: args.taxiReturnDate,
      time: args.taxiReturnTime,
    },
  ];
  for (const addon of checks) {
    if (!addon.enabled) continue;
    if (addon.date) {
      const d = new Date(addon.date + 'T12:00:00');
      if (d.getDay() === 0) {
        throw new BookingError('SUNDAY_NOT_ALLOWED');
      }
    }
    if (addon.time && typeof addon.time === 'string') {
      const [h, m] = addon.time.split(':').map(Number);
      const total = (h ?? 0) * 60 + (m ?? 0);
      if (total < 10 * 60 || total > 17 * 60) {
        throw new BookingError('INVALID_TIME_SLOT');
      }
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Atomic booking creation transaction
// ────────────────────────────────────────────────────────────────────────────

export interface CreateBookingTxArgs {
  clientId: string;
  serviceType: 'BOARDING' | 'PET_TAXI';
  isAdmin: boolean;
  /**
   * When capacity is full and `waitlistFallback === true`, the booking is
   * created with status='WAITLIST' instead of throwing CAPACITY_EXCEEDED.
   * Used for client self-service. Admins keep the explicit error.
   */
  waitlistFallback: boolean;
  startDate: Date;
  endDate: Date | null;
  arrivalTime: string | null;
  notes: string | null;
  totalPrice: number;
  source: string;
  petIds: string[];
  // Boarding-specific
  includeGrooming: boolean;
  groomingSize: string | null;
  groomingPrice: number;
  pricePerNight: number;
  taxiGoEnabled: boolean;
  taxiGoDate: string | null;
  taxiGoTime: string | null;
  taxiGoAddress: string | null;
  taxiReturnEnabled: boolean;
  taxiReturnDate: string | null;
  taxiReturnTime: string | null;
  taxiReturnAddress: string | null;
  taxiAddonPrice: number;
  // Taxi standalone
  taxiType: string;
  // Admin-only billing extras
  bookingItems: { description: string; quantity: number; unitPrice: number }[];
}

/**
 * Atomic booking creation. Reads (capacity check) and writes execute under
 * Serializable isolation so PostgreSQL aborts (P2034) any concurrent
 * transaction that would violate the capacity invariant.
 *
 * On capacity full: throws BookingError('CAPACITY_EXCEEDED', { payload }).
 * The payload includes { species, available, requested, limit }.
 */
export async function createBookingTx(args: CreateBookingTxArgs) {
  return prisma.$transaction(
    async (tx) => {
      let waitlisted = false;
      if (args.serviceType === 'BOARDING') {
        const capacity = await checkBoardingCapacity(
          { petIds: args.petIds, startDate: args.startDate, endDate: args.endDate },
          tx,
        );
        if (!capacity.ok) {
          if (args.waitlistFallback) {
            waitlisted = true;
          } else {
            const c = capacity as CapacityCheckExceeded;
            throw new BookingError('CAPACITY_EXCEEDED', {
              payload: {
                species: c.species,
                available: c.available,
                requested: c.requested,
                limit: c.limit,
              },
            });
          }
        }
      }

      const resolvedStatus = waitlisted
        ? 'WAITLIST'
        : args.isAdmin
          ? 'CONFIRMED'
          : 'PENDING';

      const booking = await tx.booking.create({
        data: {
          clientId: args.clientId,
          serviceType: args.serviceType,
          status: resolvedStatus,
          startDate: args.startDate,
          endDate: args.endDate,
          arrivalTime: args.arrivalTime,
          notes: args.notes,
          totalPrice: args.totalPrice,
          source: args.source,
          bookingPets: { create: args.petIds.map((petId) => ({ petId })) },
        },
        include: {
          bookingPets: { include: { pet: true } },
          client: true,
        },
      });

      if (args.serviceType === 'BOARDING') {
        await tx.boardingDetail.create({
          data: {
            bookingId: booking.id,
            includeGrooming: args.includeGrooming,
            groomingSize: args.groomingSize,
            groomingPrice: args.groomingPrice,
            pricePerNight: args.pricePerNight,
            taxiGoEnabled: args.taxiGoEnabled,
            taxiGoDate: args.taxiGoDate,
            taxiGoTime: args.taxiGoTime,
            taxiGoAddress: args.taxiGoAddress,
            taxiReturnEnabled: args.taxiReturnEnabled,
            taxiReturnDate: args.taxiReturnDate,
            taxiReturnTime: args.taxiReturnTime,
            taxiReturnAddress: args.taxiReturnAddress,
            taxiAddonPrice: args.taxiAddonPrice,
          },
        });
      } else if (args.serviceType === 'PET_TAXI') {
        await tx.taxiDetail.create({
          data: {
            bookingId: booking.id,
            taxiType: args.taxiType,
            price: args.totalPrice > 0 ? args.totalPrice : 150,
          },
        });
      }

      if (args.bookingItems.length > 0) {
        await tx.bookingItem.createMany({
          data: args.bookingItems.map((item) => ({
            bookingId: booking.id,
            description: item.description.trim(),
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            total: item.quantity * item.unitPrice,
          })),
        });
      }

      return booking;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 },
  );
}

/**
 * Wraps an interactive Prisma transaction with retry logic for P2034
 * (PostgreSQL "could not serialize access due to concurrent update").
 * Up to 3 attempts, linear backoff 50ms × attempt. After exhaustion, throws
 * Error('CONFLICT_RETRY_EXCEEDED') for the caller to map to a 503.
 *
 * BookingError is treated as a final, non-retryable error (e.g. CAPACITY_EXCEEDED).
 */
export async function runWithSerializableRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const isConflict =
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034';
      if (!isConflict) throw err;
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 50 * attempt));
      }
    }
  }
  console.error(
    JSON.stringify({
      level: 'error',
      service: 'booking',
      message: 'serializable retry exhausted',
      error: lastErr instanceof Error ? lastErr.message : String(lastErr),
      timestamp: new Date().toISOString(),
    }),
  );
  throw new Error('CONFLICT_RETRY_EXCEEDED');
}
