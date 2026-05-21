// Pure derivation helper for the walk-in invoice "smart line" UX.
//
// When the operator picks a service category (Pension / Pet Taxi /
// Grooming) we capture light pet context (species, name, nights, size)
// and DERIVE the line's description + unit price from the canonical
// business rules — instead of making Mehdi type free text and compute
// the price in his head.
//
// The output is a SUGGESTION : it lands in the editable description /
// unitPrice fields, the operator can still override. The money path is
// unchanged — the server receives the same {category, description,
// quantity, unitPrice} contract and validates it.
//
// Pension price uses `getPensionPriceNumber` (the canonical pure helper,
// safe in client components) with built-in business defaults. Taxi /
// grooming use the same reference constants as the booking wizard.

import { getPensionPriceNumber } from '@/lib/pricing-rules';

// Reference suggestion prices — mirror the booking wizard
// (src/app/[locale]/client/bookings/new/_lib/types.ts). Kept local to
// avoid cross-route coupling ; these are editable suggestions, not the
// authoritative money figure (that's whatever ends up in the field).
export const WALKIN_TAXI_PRICES = { STANDARD: 150, VET: 300, AIRPORT: 300 } as const;
export const WALKIN_GROOMING_PRICES = { SMALL: 100, LARGE: 150 } as const;

export type WalkinSpecies = 'DOG' | 'CAT';
export type WalkinGroomingSize = 'SMALL' | 'LARGE';
export type WalkinTaxiType = 'STANDARD' | 'VET' | 'AIRPORT';
export type WalkinBillingUnit = 'NIGHT' | 'MONTH';

export interface WalkinLineContext {
  species?: WalkinSpecies;
  petName?: string;
  /** Count of nights OR months depending on billingUnit. */
  nights?: number;
  billingUnit?: WalkinBillingUnit;
  groomingSize?: WalkinGroomingSize;
  taxiType?: WalkinTaxiType;
}

export interface DerivedLine {
  description: string;
  /** null = keep the operator's manual price (no canonical rate exists,
   *  e.g. monthly boarding) — the component must NOT overwrite the field. */
  unitPrice: number | null;
  quantity: number;
}

const SPECIES_LABEL: Record<WalkinSpecies, { fr: string; en: string; emoji: string }> = {
  DOG: { fr: 'chien', en: 'dog', emoji: '🐕' },
  CAT: { fr: 'chat', en: 'cat', emoji: '🐈' },
};

const TAXI_LABEL: Record<WalkinTaxiType, { fr: string; en: string }> = {
  STANDARD: { fr: 'ville', en: 'city' },
  VET: { fr: 'vétérinaire', en: 'vet' },
  AIRPORT: { fr: 'aéroport', en: 'airport' },
};

function namePart(petName: string | undefined): string {
  const n = (petName ?? '').trim();
  return n ? ` ${n}` : '';
}

/**
 * Derive {description, unitPrice, quantity} for a service category from
 * the captured pet context. Returns null when the category isn't a
 * derivable service (PRODUCT / OTHER / DISCOUNT keep manual entry) or
 * when required context is missing.
 *
 * - BOARDING : unitPrice = per-night rate (species + nights aware),
 *   quantity = nights → line total = nights × rate. Mirrors how the
 *   checkout flow builds boarding lines.
 * - GROOMING : unitPrice = size rate, quantity = 1.
 * - PET_TAXI : unitPrice = trip-type rate, quantity = 1.
 */
export function deriveWalkinLine(
  category: string,
  ctx: WalkinLineContext,
  locale: 'fr' | 'en' = 'fr',
): DerivedLine | null {
  const fr = locale === 'fr';

  if (category === 'BOARDING') {
    if (!ctx.species) return null;
    const count = Math.max(1, Math.floor(ctx.nights ?? 1));
    const sp = SPECIES_LABEL[ctx.species];

    // Monthly boarding : no canonical monthly rate exists (the pricing
    // helper is per-night), so the operator sets the price manually. We
    // still derive the description + quantity (= number of months) and
    // signal "keep manual price" with unitPrice: null.
    if (ctx.billingUnit === 'MONTH') {
      const desc = fr
        ? `Pension${namePart(ctx.petName)} (${sp.fr}) · ${count} mois`
        : `Boarding${namePart(ctx.petName)} (${sp.en}) · ${count} month${count > 1 ? 's' : ''}`;
      return { description: desc, unitPrice: null, quantity: count };
    }

    // Per-night : species + duration aware rate (canonical helper).
    // totalDogsInBooking = 1 for a single-pet walk-in line.
    const perNight = getPensionPriceNumber({ species: ctx.species }, 1, count);
    const desc = fr
      ? `Pension${namePart(ctx.petName)} (${sp.fr}) · ${count} nuit${count > 1 ? 's' : ''}`
      : `Boarding${namePart(ctx.petName)} (${sp.en}) · ${count} night${count > 1 ? 's' : ''}`;
    return { description: desc, unitPrice: perNight, quantity: count };
  }

  if (category === 'GROOMING') {
    const size = ctx.groomingSize ?? 'SMALL';
    const price = WALKIN_GROOMING_PRICES[size];
    const sizeLabel = size === 'SMALL' ? (fr ? 'petit' : 'small') : (fr ? 'grand' : 'large');
    const desc = fr
      ? `Toilettage${namePart(ctx.petName)} (${sizeLabel})`
      : `Grooming${namePart(ctx.petName)} (${sizeLabel})`;
    return { description: desc, unitPrice: price, quantity: 1 };
  }

  if (category === 'PET_TAXI') {
    const type = ctx.taxiType ?? 'STANDARD';
    const price = WALKIN_TAXI_PRICES[type];
    const t = TAXI_LABEL[type];
    const desc = fr
      ? `Pet Taxi ${t.fr}${namePart(ctx.petName)}`
      : `Pet Taxi ${t.en}${namePart(ctx.petName)}`;
    return { description: desc, unitPrice: price, quantity: 1 };
  }

  return null;
}

/** Categories that expose the smart pet-context editor. */
export function isServiceCategory(category: string): boolean {
  return category === 'BOARDING' || category === 'GROOMING' || category === 'PET_TAXI';
}
