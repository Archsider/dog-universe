// Live "open-ended" total — computed each render for walk-in stays
// without a known endDate. Mirrors the checkout pricing logic so the
// banner shown above the booking detail matches what the operator will
// see when they click "Clôturer".
//
// Returns null when:
//   - the booking has a known endDate (no banner needed),
//   - the booking is in a terminal state (CANCELLED / REJECTED / COMPLETED),
//   - the pricing settings lookup throws (fail-open: hide the banner).

import { differenceInCalendarDays } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { getPensionPrice, getPricingSettings } from '@/lib/pricing';
import { toNumber } from '@/lib/decimal';

const CASA_TZ = 'Africa/Casablanca';
const TERMINAL_STATUSES = new Set(['CANCELLED', 'REJECTED', 'COMPLETED']);

interface PetSlice {
  species: string;
}

interface BookingSlice {
  isOpenEnded: boolean;
  status: string;
  startDate: Date;
}

interface BookingPetSlice {
  pet: PetSlice & { name: string };
}

export interface LiveOpenEnded {
  nights: number;
  total: number;
  perPet: { name: string; price: number }[];
}

export async function computeLiveOpenEndedTotal(
  booking: BookingSlice,
  bookingPets: BookingPetSlice[],
): Promise<LiveOpenEnded | null> {
  if (!booking.isOpenEnded) return null;
  if (TERMINAL_STATUSES.has(booking.status)) return null;
  try {
    const pricingSettings = await getPricingSettings();
    const liveNights = Math.max(
      1,
      differenceInCalendarDays(
        toZonedTime(new Date(), CASA_TZ),
        toZonedTime(booking.startDate, CASA_TZ),
      ),
    );
    const dogsCount = bookingPets.filter((bp) => bp.pet.species === 'DOG').length;
    const perPet = bookingPets.map((bp) => {
      const unitPrice = getPensionPrice(bp.pet, dogsCount, liveNights, pricingSettings);
      return { name: bp.pet.name, price: toNumber(unitPrice.times(liveNights)) };
    });
    return {
      nights: liveNights,
      total: perPet.reduce((s, p) => s + p.price, 0),
      perPet,
    };
  } catch {
    // fail-open: pricing settings lookup failed → no banner.
    return null;
  }
}
