/**
 * invoice-descriptions.ts
 *
 * Pure helpers that build clear, human-readable invoice line descriptions.
 * No Prisma import — safe to use in both server routes and client components.
 *
 * Invariants:
 *   - All strings are bilingual (fr / en).
 *   - No PII beyond pet name and city is included.
 *   - Output is at most 200 characters (enforced by addBookingItems validator).
 */

export type DescriptionLocale = 'fr' | 'en';
export type TaxiDirection = 'one-way' | 'return' | 'round-trip';

/**
 * Builds a boarding line description for a single pet.
 *
 * Examples (fr):
 *   "Pension Max (chien) — 9 nuits × 120 MAD/nuit"
 *   "Pension Luna (chat) — 1 nuit × 70 MAD/nuit"
 *
 * Examples (en):
 *   "Boarding Max (dog) — 9 nights × 120 MAD/night"
 *   "Boarding Luna (cat) — 1 night × 70 MAD/night"
 */
export function boardingDescription(
  petName: string,
  species: 'DOG' | 'CAT',
  nights: number,
  pricePerNight: number,
  locale: DescriptionLocale,
): string {
  if (locale === 'fr') {
    const speciesLabel = species === 'DOG' ? 'chien' : 'chat';
    const nightLabel = nights > 1 ? 'nuits' : 'nuit';
    return `Pension ${petName} (${speciesLabel}) — ${nights} ${nightLabel} × ${pricePerNight} MAD/nuit`;
  } else {
    const speciesLabel = species === 'DOG' ? 'dog' : 'cat';
    const nightLabel = nights > 1 ? 'nights' : 'night';
    return `Boarding ${petName} (${speciesLabel}) — ${nights} ${nightLabel} × ${pricePerNight} MAD/night`;
  }
}

/**
 * Builds a pet taxi line description.
 *
 * Examples (fr):
 *   "Pet Taxi aller-retour — Marrakech (2 trajets × 150 MAD)"
 *   "Pet Taxi aller — Marrakech (1 trajet × 150 MAD)"
 *   "Pet Taxi retour — 1 trajet × 150 MAD"
 *
 * Examples (en):
 *   "Pet Taxi round-trip — Marrakech (2 trips × 150 MAD)"
 *   "Pet Taxi one-way — Marrakech (1 trip × 150 MAD)"
 */
export function taxiDescription(
  direction: TaxiDirection,
  city: string | null,
  trips: number,
  pricePerTrip: number,
  locale: DescriptionLocale,
): string {
  const cityPart = city ? ` — ${city}` : '';

  if (locale === 'fr') {
    const dirLabel = direction === 'one-way'
      ? 'aller'
      : direction === 'return'
        ? 'retour'
        : 'aller-retour';
    const tripLabel = trips > 1 ? 'trajets' : 'trajet';
    return `Pet Taxi ${dirLabel}${cityPart} (${trips} ${tripLabel} × ${pricePerTrip} MAD)`;
  } else {
    const dirLabel = direction === 'one-way'
      ? 'one-way'
      : direction === 'return'
        ? 'return'
        : 'round-trip';
    const tripLabel = trips > 1 ? 'trips' : 'trip';
    return `Pet Taxi ${dirLabel}${cityPart} (${trips} ${tripLabel} × ${pricePerTrip} MAD)`;
  }
}

/**
 * Builds a grooming line description for a single pet.
 *
 * Examples (fr):
 *   "Toilettage Max (petit chien)"
 *   "Toilettage Rex (grand chien)"
 *
 * Examples (en):
 *   "Grooming Max (small dog)"
 *   "Grooming Rex (large dog)"
 */
export function groomingDescription(
  petName: string,
  size: 'SMALL' | 'LARGE',
  locale: DescriptionLocale,
): string {
  if (locale === 'fr') {
    const sizeLabel = size === 'SMALL' ? 'petit' : 'grand';
    return `Toilettage ${petName} (${sizeLabel} chien)`;
  } else {
    const sizeLabel = size === 'SMALL' ? 'small' : 'large';
    return `Grooming ${petName} (${sizeLabel} dog)`;
  }
}
