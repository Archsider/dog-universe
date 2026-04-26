/**
 * Client-side pricing utilities — no Prisma / DB access.
 * Same business rules as src/lib/pricing.ts but usable in 'use client' components.
 */

export const PRICING_DEFAULTS = {
  boarding_dog_per_night: 120,
  boarding_cat_per_night: 70,
  boarding_dog_long_stay: 100,
  boarding_dog_multi: 100,
  long_stay_threshold: 32,
  grooming_small_dog: 100,
  grooming_large_dog: 150,
  taxi_standard: 150,
  taxi_vet: 300,
  taxi_airport: 300,
} as const;

export type PricingSettings = typeof PRICING_DEFAULTS;

export interface BillingLine {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface PetInfo {
  id: string;
  name: string;
  species: string; // 'DOG' | 'CAT'
}

export type GroomingSize = 'SMALL' | 'LARGE';
export type TaxiType = 'STANDARD' | 'VET' | 'AIRPORT';

export interface BoardingOptions {
  groomingEnabled: boolean;
  groomingSize: GroomingSize;
  taxiGoEnabled: boolean;
  taxiReturnEnabled: boolean;
}

/** Parse string-valued settings from GET /api/admin/settings into numeric PricingSettings. */
export function parsePricingSettings(raw: Record<string, string>): typeof PRICING_DEFAULTS & Record<string, number> {
  const p: Record<string, number> = { ...PRICING_DEFAULTS };
  for (const [key, val] of Object.entries(raw)) {
    if (key in p) {
      const num = parseFloat(val);
      if (!isNaN(num) && num > 0) p[key] = num;
    }
  }
  return p as typeof PRICING_DEFAULTS & Record<string, number>;
}

/** Number of whole nights between two ISO date strings (departure day not billed). */
export function calcNights(startDate: string, endDate: string): number {
  if (!startDate || !endDate) return 0;
  // Use midday to avoid DST edge cases
  const s = new Date(startDate + 'T12:00:00');
  const e = new Date(endDate + 'T12:00:00');
  return Math.max(0, Math.floor((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)));
}

/**
 * Generate billing lines for a boarding reservation.
 *
 * Rules:
 *  - 1 chien ≤32 nuits → boarding_dog_per_night (120 MAD)
 *  - 1 chien >32 nuits → boarding_dog_long_stay  (100 MAD)
 *  - 2+ chiens         → boarding_dog_multi/chien/nuit (100 MAD)
 *  - Chat              → boarding_cat_per_night (70 MAD), peu importe le nombre
 *  - Toilettage        → grooming_small_dog / grooming_large_dog × nombre de chiens
 *  - Taxi addon aller  → taxi_standard (150 MAD)
 *  - Taxi addon retour → taxi_standard (150 MAD)
 */
export function calcBoardingLines(
  nights: number,
  pets: PetInfo[],
  opts: BoardingOptions,
  p: Record<string, number> = PRICING_DEFAULTS,
): BillingLine[] {
  const lines: BillingLine[] = [];
  if (nights <= 0 || pets.length === 0) return lines;

  const dogs = pets.filter(x => x.species === 'DOG');
  const cats = pets.filter(x => x.species === 'CAT');

  // Pension chiens
  if (dogs.length === 1) {
    const rate = nights > p.long_stay_threshold ? p.boarding_dog_long_stay : p.boarding_dog_per_night;
    lines.push({
      description: `Pension ${dogs[0].name} (chien)`,
      quantity: nights,
      unitPrice: rate,
      total: nights * rate,
    });
  } else if (dogs.length > 1) {
    dogs.forEach(dog => {
      const rate = p.boarding_dog_multi;
      lines.push({
        description: `Pension ${dog.name} (chien)`,
        quantity: nights,
        unitPrice: rate,
        total: nights * rate,
      });
    });
  }

  // Pension chats
  cats.forEach(cat => {
    const rate = p.boarding_cat_per_night;
    lines.push({
      description: `Pension ${cat.name} (chat)`,
      quantity: nights,
      unitPrice: rate,
      total: nights * rate,
    });
  });

  // Toilettage (chiens uniquement)
  if (opts.groomingEnabled && dogs.length > 0) {
    const rate = opts.groomingSize === 'SMALL' ? p.grooming_small_dog : p.grooming_large_dog;
    const sizeLabel = opts.groomingSize === 'SMALL' ? 'petit' : 'grand';
    dogs.forEach(dog => {
      lines.push({
        description: `Toilettage ${dog.name} (${sizeLabel})`,
        quantity: 1,
        unitPrice: rate,
        total: rate,
      });
    });
  }

  // Taxi addon
  if (opts.taxiGoEnabled) {
    lines.push({
      description: 'Pet Taxi — Aller',
      quantity: 1,
      unitPrice: p.taxi_standard,
      total: p.taxi_standard,
    });
  }
  if (opts.taxiReturnEnabled) {
    lines.push({
      description: 'Pet Taxi — Retour',
      quantity: 1,
      unitPrice: p.taxi_standard,
      total: p.taxi_standard,
    });
  }

  return lines;
}

/** Single billing line for a standalone Pet Taxi. */
export function calcTaxiLine(taxiType: TaxiType, p: Record<string, number> = PRICING_DEFAULTS): BillingLine {
  const priceMap: Record<TaxiType, number> = {
    STANDARD: p.taxi_standard,
    VET: p.taxi_vet,
    AIRPORT: p.taxi_airport,
  };
  const descMap: Record<TaxiType, string> = {
    STANDARD: 'Pet Taxi — Course standard',
    VET: 'Pet Taxi — Transport vétérinaire',
    AIRPORT: 'Pet Taxi — Navette aéroport',
  };
  const price = priceMap[taxiType];
  return { description: descMap[taxiType], quantity: 1, unitPrice: price, total: price };
}

/** Total grooming cost for all dogs at booking time (for BoardingDetail.groomingPrice). */
export function calcGroomingTotal(
  dogs: PetInfo[],
  size: GroomingSize,
  p: Record<string, number> = PRICING_DEFAULTS,
): number {
  const rate = size === 'SMALL' ? p.grooming_small_dog : p.grooming_large_dog;
  return dogs.length * rate;
}
