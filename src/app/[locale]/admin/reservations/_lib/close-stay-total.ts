// Pure pricing helper for CloseStayDialog. Lives outside the `.tsx`
// component so it's testable without a JSX transformer in the test runner.
//
// The single rule encoded here:
//   - open-ended stay → recompute live from dates × pets × pricing
//   - fixed dates + invoice exists → use invoice.amount (post-discount)
//   - fixed dates + no invoice yet → fall back to booking.totalPrice
//
// See the JSDoc on `selectCloseStayTotal` for the full rationale.

import { getPensionPriceNumber, type PricingSettings } from '@/lib/pricing-rules';

export type CloseStayPet = { id: string; name: string; species: 'DOG' | 'CAT' };

export function computeOpenEndedTotal(
  pets: CloseStayPet[],
  nights: number,
  pricing: PricingSettings,
): number {
  const dogs = pets.filter((x) => x.species === 'DOG').length;
  return pets.reduce(
    (acc, pet) =>
      acc + getPensionPriceNumber({ species: pet.species }, dogs, nights, pricing) * nights,
    0,
  );
}

/** Pick the "Total final" displayed on the close-stay modal.
 *
 *  Priority:
 *    1. Open-ended stay → recompute live from dates × pets × pricing
 *       (the dates are still moving, so neither the invoice nor the
 *       booking total can be trusted as final).
 *    2. Fixed dates + invoice exists → use `invoice.amount`. The invoice
 *       is the source of truth once issued; it reflects DISCOUNT items
 *       added by the admin via the invoice editor (which never write
 *       back to Booking.totalPrice).
 *    3. Fixed dates + no invoice yet → fall back to `booking.totalPrice`
 *       (the gross at creation time). Legacy path: walk-ins and very
 *       early bookings hit this.
 *
 *  Note: `??` (not `||`) on the invoiceAmount fallback so that a fully
 *  discounted invoice (amount=0) is preserved instead of falling back to
 *  the gross.
 */
export function selectCloseStayTotal(args: {
  isOpenEnded: boolean;
  pets: CloseStayPet[];
  nights: number;
  pricing: PricingSettings;
  invoiceAmount: number | null | undefined;
  totalPrice: number;
}): number {
  if (args.isOpenEnded) return computeOpenEndedTotal(args.pets, args.nights, args.pricing);
  return args.invoiceAmount ?? args.totalPrice;
}
