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

// Default boarding price per night (admin can override per booking)
export const DEFAULT_BOARDING_PRICE_PER_NIGHT = 200;

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

export function calculateBoardingPrice(
  nights: number,
  pricePerNight: number = DEFAULT_BOARDING_PRICE_PER_NIGHT,
  groomingSize?: GroomingSize
): PriceBreakdown {
  const items: PriceLineItem[] = [
    {
      descriptionFr: `Pension — ${nights} nuit${nights > 1 ? 's' : ''}`,
      descriptionEn: `Boarding — ${nights} night${nights > 1 ? 's' : ''}`,
      quantity: nights,
      unitPrice: pricePerNight,
      total: nights * pricePerNight,
    },
  ];

  if (groomingSize) {
    const groomingPrice = GROOMING_PRICES[groomingSize];
    const sizeLabelFr = groomingSize === 'SMALL' ? 'petit chien' : 'grand chien';
    const sizeLabelEn = groomingSize === 'SMALL' ? 'small dog' : 'large dog';
    items.push({
      descriptionFr: `Toilettage (${sizeLabelFr})`,
      descriptionEn: `Grooming (${sizeLabelEn})`,
      quantity: 1,
      unitPrice: groomingPrice,
      total: groomingPrice,
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
