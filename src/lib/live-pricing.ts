// Live (provisional) pension total — shared helper for open-ended bookings.
//
// Open-ended walk-ins or extensions have totalPrice=0 in DB until the admin
// closes the stay via CloseStayDialog. Until then, every view that displays
// the "Total" column shows 0 MAD which is misleading.
//
// This helper computes the running total using the same rules as the final
// checkout (see `getPensionPriceNumber` in `pricing-rules.ts`):
//   - nights elapsed (Casablanca TZ, calendar-day floor, min 1)
//   - pension rate per pet (CAT / long-stay / multi / single-dog)
//   - optional add-ons: one-way / round-trip taxi, grooming
//
// Pure: takes a `PricingSettings` snapshot — caller fetches via
// `getPricingSettings()` once and reuses for an array of bookings.
import { differenceInCalendarDays } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { getPensionPriceNumber, type PricingSettings } from '@/lib/pricing-rules';

export const CASA_TZ = 'Africa/Casablanca';

export type LivePet = { species: 'DOG' | 'CAT' };

export type LiveAddons = {
  taxiGoEnabled?: boolean;
  taxiReturnEnabled?: boolean;
  /** Pre-resolved grooming amount in MAD (admin-saved override on the booking). */
  groomingPrice?: number;
};

export type LiveTotalResult = {
  nights: number;
  /** Pension + add-ons + booking items (unbilled). */
  total: number;
  /** Pension only — useful when callers want to display add-ons separately. */
  pensionTotal: number;
  addonTotal: number;
  /** Sum of unbilled BookingItem.total — products, extras, discounts. */
  itemsTotal: number;
};

export function liveNightsSince(startDate: Date, now: Date = new Date()): number {
  return Math.max(
    1,
    differenceInCalendarDays(toZonedTime(now, CASA_TZ), toZonedTime(startDate, CASA_TZ)),
  );
}

export function computeLiveTotal(
  input: {
    startDate: Date;
    pets: LivePet[];
    addons?: LiveAddons;
    /** Sum of BookingItem.total for unbilled items (invoiceItemId IS NULL). */
    unbilledItemsTotal?: number;
  },
  pricing: PricingSettings,
  now: Date = new Date(),
): LiveTotalResult {
  const nights = liveNightsSince(input.startDate, now);
  const dogsCount = input.pets.filter((p) => p.species === 'DOG').length;

  let pensionTotal = 0;
  for (const pet of input.pets) {
    const unit = getPensionPriceNumber(pet, dogsCount, nights, pricing);
    pensionTotal += unit * nights;
  }

  let addonTotal = 0;
  if (input.addons) {
    if (input.addons.taxiGoEnabled) addonTotal += pricing.taxi_standard;
    if (input.addons.taxiReturnEnabled) addonTotal += pricing.taxi_standard;
    if (input.addons.groomingPrice && input.addons.groomingPrice > 0) {
      addonTotal += input.addons.groomingPrice;
    }
  }

  const itemsTotal = input.unbilledItemsTotal ?? 0;

  return {
    nights,
    pensionTotal,
    addonTotal,
    itemsTotal,
    total: pensionTotal + addonTotal + itemsTotal,
  };
}
