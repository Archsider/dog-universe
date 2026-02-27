// Business rules & pricing for Dog Universe
import { prisma } from '@/lib/prisma';

// Hardcoded fallback defaults (used if no DB setting found)
export const TAXI_PRICES = {
  STANDARD: 150,
  VET: 300,
  AIRPORT: 300,
} as const;

export const GROOMING_PRICES = {
  SMALL: 100,
  LARGE: 150,
} as const;

export const BOARDING_DOG_SINGLE = 120;
export const BOARDING_DOG_LONG_STAY = 100;
export const BOARDING_DOG_MULTI = 100;
export const BOARDING_CAT = 70;
export const TAXI_ADDON_PRICE = 150;

export interface PricingSettings {
  boarding_dog_per_night: number;
  boarding_cat_per_night: number;
  boarding_dog_long_stay: number;
  boarding_dog_multi: number;
  long_stay_threshold: number;
  grooming_small_dog: number;
  grooming_large_dog: number;
  taxi_standard: number;
  taxi_vet: number;
  taxi_airport: number;
}

const PRICING_DEFAULTS: PricingSettings = {
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
};

export async function getPricingSettings(): Promise<PricingSettings> {
  try {
    const rows = await prisma.setting.findMany();
    const settings = { ...PRICING_DEFAULTS };
    for (const row of rows) {
      const key = row.key as keyof PricingSettings;
      if (key in settings) {
        settings[key] = parseFloat(row.value) || settings[key];
      }
    }
    return settings;
  } catch {
    return { ...PRICING_DEFAULTS };
  }
}

export type TaxiType = 'STANDARD' | 'VET' | 'AIRPORT';
export type GroomingSize = 'SMALL' | 'LARGE';

export interface PriceLineItem {
  descriptionFr: string;
  descriptionEn: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface PriceBreakdown {
  items: PriceLineItem[];
  total: number;
}

export interface PetForPricing {
  id: string;
  name: string;
  species: string; // 'DOG' | 'CAT'
}

/**
 * Calculate boarding price breakdown based on species, count and duration.
 * Rules:
 * - 1 chien ≤32 nuits : 120 MAD/nuit
 * - 1 chien >32 nuits : 100 MAD/nuit
 * - 2+ chiens : 100 MAD/chien/nuit
 * - Chat : 70 MAD/nuit (peu importe)
 * - Jour de départ non facturé (nights = checkout - checkin en jours entiers)
 */
export function calculateBoardingBreakdown(
  nights: number,
  pets: PetForPricing[],
  groomingMap?: Record<string, GroomingSize>,
  taxiGoEnabled?: boolean,
  taxiReturnEnabled?: boolean,
  pricing?: PricingSettings,
): PriceBreakdown {
  const p = pricing ?? PRICING_DEFAULTS;
  const items: PriceLineItem[] = [];

  const dogs = pets.filter(pet => pet.species === 'DOG');
  const cats = pets.filter(pet => pet.species === 'CAT');

  // Dogs
  if (dogs.length === 1) {
    const pricePerNight = nights > p.long_stay_threshold ? p.boarding_dog_long_stay : p.boarding_dog_per_night;
    items.push({
      descriptionFr: `Pension ${dogs[0].name} (chien)`,
      descriptionEn: `Boarding ${dogs[0].name} (dog)`,
      quantity: nights,
      unitPrice: pricePerNight,
      total: nights * pricePerNight,
    });
  } else if (dogs.length > 1) {
    dogs.forEach(dog => {
      items.push({
        descriptionFr: `Pension ${dog.name} (chien)`,
        descriptionEn: `Boarding ${dog.name} (dog)`,
        quantity: nights,
        unitPrice: p.boarding_dog_multi,
        total: nights * p.boarding_dog_multi,
      });
    });
  }

  // Cats
  cats.forEach(cat => {
    items.push({
      descriptionFr: `Pension ${cat.name} (chat)`,
      descriptionEn: `Boarding ${cat.name} (cat)`,
      quantity: nights,
      unitPrice: p.boarding_cat_per_night,
      total: nights * p.boarding_cat_per_night,
    });
  });

  // Grooming (dogs only)
  if (groomingMap) {
    dogs.forEach(dog => {
      const size = groomingMap[dog.id];
      if (size) {
        const groomPrice = size === 'SMALL' ? p.grooming_small_dog : p.grooming_large_dog;
        const sizeLabelFr = size === 'SMALL' ? 'petit' : 'grand';
        const sizeLabelEn = size === 'SMALL' ? 'small' : 'large';
        items.push({
          descriptionFr: `Toilettage ${dog.name} (${sizeLabelFr})`,
          descriptionEn: `Grooming ${dog.name} (${sizeLabelEn})`,
          quantity: 1,
          unitPrice: groomPrice,
          total: groomPrice,
        });
      }
    });
  }

  // Taxi addon
  if (taxiGoEnabled) {
    items.push({
      descriptionFr: 'Pet Taxi — Aller',
      descriptionEn: 'Pet Taxi — Drop-off',
      quantity: 1,
      unitPrice: p.taxi_standard,
      total: p.taxi_standard,
    });
  }
  if (taxiReturnEnabled) {
    items.push({
      descriptionFr: 'Pet Taxi — Retour',
      descriptionEn: 'Pet Taxi — Pick-up',
      quantity: 1,
      unitPrice: p.taxi_standard,
      total: p.taxi_standard,
    });
  }

  return {
    items,
    total: items.reduce((sum, item) => sum + item.total, 0),
  };
}

export function calculateTaxiPrice(taxiType: TaxiType, pricing?: PricingSettings): PriceBreakdown {
  const p = pricing ?? PRICING_DEFAULTS;
  const priceMap: Record<TaxiType, number> = {
    STANDARD: p.taxi_standard,
    VET: p.taxi_vet,
    AIRPORT: p.taxi_airport,
  };
  const price = priceMap[taxiType];
  const labelsFr: Record<TaxiType, string> = {
    STANDARD: 'Pet Taxi — Course standard',
    VET: 'Pet Taxi — Transport vétérinaire',
    AIRPORT: 'Pet Taxi — Navette aéroport',
  };
  const labelsEn: Record<TaxiType, string> = {
    STANDARD: 'Pet Taxi — Standard trip',
    VET: 'Pet Taxi — Vet transport',
    AIRPORT: 'Pet Taxi — Airport transfer',
  };

  return {
    items: [
      {
        descriptionFr: labelsFr[taxiType],
        descriptionEn: labelsEn[taxiType],
        quantity: 1,
        unitPrice: price,
        total: price,
      },
    ],
    total: price,
  };
}

export function getGroomingPriceForPet(groomingSize: GroomingSize, pricing?: PricingSettings): number {
  const p = pricing ?? PRICING_DEFAULTS;
  return groomingSize === 'SMALL' ? p.grooming_small_dog : p.grooming_large_dog;
}
