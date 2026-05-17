/**
 * Server-side price resolution for booking creation.
 *
 * CLIENT role: always recalculate — the client-supplied totalPrice is never
 * trusted (price manipulation vector).
 * ADMIN role: accept provided value as-is, fall back to server calculation
 * when 0 or absent.
 */
import { prisma } from '@/lib/prisma';
import { notDeleted } from '@/lib/prisma-soft';
import { getPricingSettings, calculateBoardingBreakdown, calculateTaxiPrice } from '@/lib/pricing';
import type { TaxiType } from '@/lib/pricing-rules';
import { log } from '@/lib/logger';

export interface ResolvePriceArgs {
  serviceType: 'BOARDING' | 'PET_TAXI';
  petIds: string[];
  startDate: string;
  endDate?: string | null;
  isAdmin: boolean;
  providedTotalPrice?: number;
  providedPricePerNight?: number;
  includeGrooming?: boolean;
  groomingSize?: string | null;
  taxiGoEnabled?: boolean;
  taxiReturnEnabled?: boolean;
  taxiType?: TaxiType | string | null;
  bookingItems?: { quantity?: unknown; unitPrice?: unknown }[];
}

export interface ResolvePriceResult {
  resolvedTotalPrice: number;
  resolvedPricePerNight: number;
  nights: number;
  error?: 'PRICE_CALCULATION_FAILED';
}

export async function resolveBookingPrice(args: ResolvePriceArgs): Promise<ResolvePriceResult> {
  const nights = args.endDate
    ? Math.max(
        0,
        Math.floor(
          (new Date(args.endDate).getTime() - new Date(args.startDate).getTime()) /
            (1000 * 60 * 60 * 24),
        ),
      )
    : 0;

  let resolvedTotalPrice: number =
    args.isAdmin && typeof args.providedTotalPrice === 'number' && args.providedTotalPrice > 0
      ? args.providedTotalPrice
      : 0;
  let resolvedPricePerNight =
    typeof args.providedPricePerNight === 'number' && args.providedPricePerNight > 0
      ? args.providedPricePerNight
      : 0;

  if (resolvedTotalPrice === 0) {
    try {
      const pricing = await getPricingSettings();
      const petsForCalc = await prisma.pet.findMany({
        where: notDeleted({ id: { in: args.petIds } }), // soft-delete: required — no global extension (Edge Runtime incompatible)
        select: { id: true, name: true, species: true },
      });

      if (args.serviceType === 'BOARDING') {
        const groomingMap: Record<string, 'SMALL' | 'LARGE'> = {};
        if (args.includeGrooming && args.groomingSize) {
          petsForCalc.filter((p) => p.species === 'DOG').forEach((dog) => {
            groomingMap[dog.id] = args.groomingSize as 'SMALL' | 'LARGE';
          });
        }
        const breakdown = calculateBoardingBreakdown(
          nights,
          petsForCalc,
          args.includeGrooming ? groomingMap : undefined,
          args.taxiGoEnabled ?? false,
          args.taxiReturnEnabled ?? false,
          pricing,
        );
        resolvedTotalPrice = breakdown.total;

        if (!resolvedPricePerNight) {
          const dogs = petsForCalc.filter((p) => p.species === 'DOG');
          const cats = petsForCalc.filter((p) => p.species === 'CAT');
          if (dogs.length === 1 && cats.length === 0) {
            resolvedPricePerNight =
              nights > pricing.long_stay_threshold
                ? pricing.boarding_dog_long_stay
                : pricing.boarding_dog_per_night;
          } else if (dogs.length > 1) {
            resolvedPricePerNight = pricing.boarding_dog_multi;
          } else if (cats.length > 0 && dogs.length === 0) {
            resolvedPricePerNight = pricing.boarding_cat_per_night;
          }
        }
      } else if (args.serviceType === 'PET_TAXI') {
        const breakdown = calculateTaxiPrice((args.taxiType ?? 'STANDARD') as TaxiType, pricing);
        resolvedTotalPrice = breakdown.total;
      }

      // Add custom booking items to the total
      if (Array.isArray(args.bookingItems)) {
        for (const item of args.bookingItems) {
          const qty = typeof item.quantity === 'number' ? item.quantity : 0;
          const up = typeof item.unitPrice === 'number' ? item.unitPrice : 0;
          resolvedTotalPrice += qty * up;
        }
      }
    } catch (err) {
      await log('error', 'bookings', 'Pricing calculation failed', { error: String(err) });
      return { resolvedTotalPrice: 0, resolvedPricePerNight: 0, nights, error: 'PRICE_CALCULATION_FAILED' };
    }
  }

  return { resolvedTotalPrice, resolvedPricePerNight, nights };
}
