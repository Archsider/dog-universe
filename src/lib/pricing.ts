// Business rules & pricing for Dog Universe

export const TAXI_PRICES = {
  STANDARD: 150,
  VET: 300,
  AIRPORT: 300,
} as const;

export const GROOMING_PRICES = {
  SMALL: 100,
  LARGE: 150,
} as const;

// Boarding pricing rules
export const BOARDING_DOG_SINGLE = 120;      // 1 chien, ≤32 nuits
export const BOARDING_DOG_LONG_STAY = 100;   // 1 chien, >32 nuits
export const BOARDING_DOG_MULTI = 100;        // 2 chiens et plus (par chien)
export const BOARDING_CAT = 70;               // Chat, peu importe durée/nombre

export const TAXI_ADDON_PRICE = 150;          // Pet taxi addon (aller ou retour)

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
): PriceBreakdown {
  const items: PriceLineItem[] = [];

  const dogs = pets.filter(p => p.species === 'DOG');
  const cats = pets.filter(p => p.species === 'CAT');

  // Dogs
  if (dogs.length === 1) {
    const pricePerNight = nights > 32 ? BOARDING_DOG_LONG_STAY : BOARDING_DOG_SINGLE;
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
        unitPrice: BOARDING_DOG_MULTI,
        total: nights * BOARDING_DOG_MULTI,
      });
    });
  }

  // Cats
  cats.forEach(cat => {
    items.push({
      descriptionFr: `Pension ${cat.name} (chat)`,
      descriptionEn: `Boarding ${cat.name} (cat)`,
      quantity: nights,
      unitPrice: BOARDING_CAT,
      total: nights * BOARDING_CAT,
    });
  });

  // Grooming (dogs only)
  if (groomingMap) {
    dogs.forEach(dog => {
      const size = groomingMap[dog.id];
      if (size) {
        const groomPrice = GROOMING_PRICES[size];
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
      unitPrice: TAXI_ADDON_PRICE,
      total: TAXI_ADDON_PRICE,
    });
  }
  if (taxiReturnEnabled) {
    items.push({
      descriptionFr: 'Pet Taxi — Retour',
      descriptionEn: 'Pet Taxi — Pick-up',
      quantity: 1,
      unitPrice: TAXI_ADDON_PRICE,
      total: TAXI_ADDON_PRICE,
    });
  }

  return {
    items,
    total: items.reduce((sum, item) => sum + item.total, 0),
  };
}

export function calculateTaxiPrice(taxiType: TaxiType): PriceBreakdown {
  const price = TAXI_PRICES[taxiType];
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

export function getGroomingPriceForPet(groomingSize: GroomingSize): number {
  return GROOMING_PRICES[groomingSize];
}
